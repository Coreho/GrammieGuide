import { describe, it, expect } from 'vitest'
import {
  audioStep,
  decideAudio,
  initialAudioState,
  MUSIC_LOWERED_VOLUME,
  RESUME_DELAY_MS,
  type AudioDecision,
  type AudioEvent,
  type AudioSource,
  type AudioState
} from '../../src/shared/audio/audioPolicy'

/**
 * A tiny driver: feeds events at given times and remembers what the rule
 * asked the caller to stop, so each test reads like a timeline.
 */
type Harness = {
  at(ms: number): Harness
  send(event: AudioEvent): string[]
  decision(at?: number): AudioDecision
  readonly state: AudioState
  readonly stopped: string[]
}

function harness(start: AudioState = initialAudioState): Harness {
  let state = start
  let now = 0
  const stopped: string[] = []
  return {
    at(ms: number) {
      now = ms
      return this
    },
    send(event: AudioEvent) {
      const result = audioStep(state, event, now)
      state = result.state
      stopped.push(...result.stop)
      return result.stop
    },
    decision(at: number = now) {
      return decideAudio(state, at)
    },
    get state() {
      return state
    },
    stopped
  }
}

const play: AudioEvent = { type: 'musicPlay' }
const start = (source: AudioSource, id: string): AudioEvent => ({ type: 'start', source, id })
const end = (id: string): AudioEvent => ({ type: 'end', id })

describe('audio policy: the starting point', () => {
  it('starts silent, with nothing muted and no Stop to show', () => {
    expect(decideAudio(initialAudioState, 0)).toEqual({
      music: 'off',
      musicVolume: 0,
      showStopMusic: false,
      muteWebPage: false,
      changesAt: null
    })
  })

  it('plays music at full volume when nothing else needs her ears', () => {
    const h = harness()
    h.send(play)
    expect(h.decision()).toMatchObject({ music: 'playing', musicVolume: 1, showStopMusic: true })
  })
})

describe('audio policy: music gives way to voices and resumes afterwards (AC #1)', () => {
  it("lowers music while Buddy speaks, and brings it back once he's been quiet a moment", () => {
    const h = harness()
    h.at(0).send(play)
    h.at(1000).send(start('buddyVoice', 'line-1'))
    expect(h.decision()).toMatchObject({ music: 'lowered', musicVolume: MUSIC_LOWERED_VOLUME })

    h.at(3000).send(end('line-1'))
    // Not straight back to full: a second line often follows right away.
    expect(h.decision()).toMatchObject({ music: 'lowered', changesAt: 3000 + RESUME_DELAY_MS })
    expect(h.decision(3000 + RESUME_DELAY_MS - 1).music).toBe('lowered')
    expect(h.decision(3000 + RESUME_DELAY_MS)).toMatchObject({
      music: 'playing',
      musicVolume: 1,
      changesAt: null
    })
  })

  it('pauses music while a narration plays, and resumes it afterwards', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(500).send(start('narration', 'story-1'))
    expect(h.decision()).toMatchObject({ music: 'held', musicVolume: 0, showStopMusic: true })

    h.at(60_000).send(end('story-1'))
    expect(h.decision().music).toBe('held')
    expect(h.decision(60_000 + RESUME_DELAY_MS)).toMatchObject({ music: 'playing', musicVolume: 1 })
  })

  it('keeps music quiet with no gap when another line starts during the resume delay', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(100).send(start('buddyVoice', 'line-1'))
    h.at(2000).send(end('line-1'))
    h.at(2000 + RESUME_DELAY_MS / 2).send(start('buddyVoice', 'line-2'))
    // Still lowered, never back to full in between, and nothing scheduled while he talks.
    expect(h.decision(2000 + RESUME_DELAY_MS)).toMatchObject({ music: 'lowered', changesAt: null })
  })

  it('gets quieter at once: narration starting while Buddy has music lowered pauses it', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(100).send(start('buddyVoice', 'line-1'))
    h.at(200).send(start('narration', 'story-1'))
    expect(h.decision().music).toBe('held')
  })

  it('stays paused through the resume delay when a pause gives way to a lowering', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(100).send(start('webPage', 'page'))
    h.at(200).send(start('buddyVoice', 'line-1'))
    h.at(1000).send(end('page'))
    // The page went quiet but Buddy is still talking: music waits, then comes back lowered.
    expect(h.decision().music).toBe('held')
    expect(h.decision(1000 + RESUME_DELAY_MS).music).toBe('lowered')
  })
})

describe('audio policy: listening (AC #2)', () => {
  it('pauses music while Buddy is listening so the microphone does not hear it', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(1000).send(start('listening', 'mic-1'))
    expect(h.decision()).toMatchObject({ music: 'held', musicVolume: 0 })

    h.at(6000).send(end('mic-1'))
    expect(h.decision(6000 + RESUME_DELAY_MS).music).toBe('playing')
  })

  it('keeps music paused for a whole chat instead of stopping and starting every turn', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(1000).send(start('chat', 'chat'))
    h.at(1000).send(start('buddyVoice', 'greeting'))
    expect(h.decision().music).toBe('held')
    h.at(4000).send(end('greeting'))
    h.at(9000).send(start('listening', 'mic-1'))
    h.at(13_000).send(end('mic-1'))
    // Buddy thinks for a long while before he answers: music must not sneak back in.
    expect(h.decision(13_000 + RESUME_DELAY_MS * 4).music).toBe('held')
    h.at(20_000).send(start('buddyVoice', 'reply-1'))
    h.at(25_000).send(end('reply-1'))
    expect(h.decision(25_000 + RESUME_DELAY_MS * 4).music).toBe('held')

    h.at(40_000).send(end('chat'))
    expect(h.decision().music).toBe('held')
    expect(h.decision(40_000 + RESUME_DELAY_MS).music).toBe('playing')
  })

  it('silences any voice when he starts listening, so the microphone hears only her', () => {
    const h = harness()
    h.at(0).send(start('narration', 'story-1'))
    expect(h.at(10).send(start('listening', 'mic-1'))).toEqual(['story-1'])
    h.at(20).send(end('mic-1'))
    h.at(30).send(start('buddyVoice', 'line-1'))
    expect(h.at(40).send(start('listening', 'mic-2'))).toEqual(['line-1'])
    expect(h.stopped).toEqual(['story-1', 'line-1'])
  })

  it('refuses a voice that tries to start while he is listening', () => {
    const h = harness()
    h.at(0).send(start('listening', 'mic-1'))
    expect(h.at(10).send(start('buddyVoice', 'tap-line'))).toEqual(['tap-line'])
    expect(h.at(20).send(start('narration', 'story-1'))).toEqual(['story-1'])
    // The refused voices never mute or hold anything once listening ends.
    h.at(30).send(end('mic-1'))
    expect(h.decision(30 + RESUME_DELAY_MS).muteWebPage).toBe(false)
  })
})

describe('audio policy: voices take turns', () => {
  it('lets the newest voice play and stops the one before it', () => {
    const h = harness()
    h.at(0).send(start('narration', 'story-1'))
    expect(h.at(100).send(start('buddyVoice', 'line-1'))).toEqual(['story-1'])
    expect(h.at(200).send(start('buddyVoice', 'line-2'))).toEqual(['line-1'])
  })

  it('ignores the late end of a voice that was already cut off', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(0).send(start('narration', 'story-1'))
    h.at(100).send(start('narration', 'story-2'))
    const before = h.state
    h.at(150).send(end('story-1'))
    expect(h.state).toBe(before)
    expect(h.decision(150 + RESUME_DELAY_MS).music).toBe('held')
  })

  it('only counts ids it was given, not names every object has', () => {
    const h = harness()
    h.at(0).send(play)
    const before = h.state
    h.at(10).send(end('constructor'))
    expect(h.state).toBe(before)
    h.at(20).send(start('narration', 'toString'))
    expect(h.decision().music).toBe('held')
  })

  it('treats a repeated start of the same sound as one sound', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(0).send(start('webPage', 'page'))
    expect(h.at(50).send(start('webPage', 'page'))).toEqual([])
    h.at(100).send(end('page'))
    expect(h.decision(100 + RESUME_DELAY_MS).music).toBe('playing')
  })

  it('ends the old sound first when an id is reused for a different source', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(0).send(start('narration', 'sound-1'))
    h.at(100).send(start('buddyVoice', 'sound-1'))
    // The narration's pause still gets its resume delay before music rises to lowered.
    expect(h.decision().music).toBe('held')
    expect(h.decision(100 + RESUME_DELAY_MS).music).toBe('lowered')
    h.at(5000).send(end('sound-1'))
    expect(h.decision(5000 + RESUME_DELAY_MS).music).toBe('playing')
  })
})

describe('audio policy: web pages (AC #3, #5)', () => {
  it('pauses music when a page starts making sound and resumes it once the page goes quiet', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(5000).send(start('webPage', 'page'))
    expect(h.decision()).toMatchObject({ music: 'held', musicVolume: 0, showStopMusic: true })

    h.at(65_000).send(end('page'))
    expect(h.decision()).toMatchObject({ music: 'held', changesAt: 65_000 + RESUME_DELAY_MS })
    expect(h.decision(65_000 + RESUME_DELAY_MS)).toMatchObject({ music: 'playing', musicVolume: 1 })
  })

  it('resumes music when an audible page is closed', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(100).send(start('webPage', 'page'))
    // Closing the page ends its sound the same way going quiet does.
    h.at(9000).send(end('page'))
    expect(h.decision(9000 + RESUME_DELAY_MS).music).toBe('playing')
  })

  it("follows a page's sound starting and stopping again and again", () => {
    const h = harness()
    h.at(0).send(play)
    for (const t of [10_000, 30_000, 50_000]) {
      h.at(t).send(start('webPage', 'page'))
      expect(h.decision().music).toBe('held')
      h.at(t + 5000).send(end('page'))
      expect(h.decision(t + 5000 + RESUME_DELAY_MS).music).toBe('playing')
    }
  })

  it('does not start music that was off when a page goes quiet', () => {
    const h = harness()
    h.at(0).send(start('webPage', 'page'))
    h.at(5000).send(end('page'))
    expect(h.decision(5000 + RESUME_DELAY_MS)).toMatchObject({ music: 'off', musicVolume: 0 })
  })

  it("mutes page sound while Buddy speaks and unmutes it when he's done", () => {
    const h = harness()
    h.at(0).send(start('webPage', 'page'))
    expect(h.decision().muteWebPage).toBe(false)
    h.at(100).send(start('buddyVoice', 'line-1'))
    expect(h.decision().muteWebPage).toBe(true)
    h.at(2000).send(end('line-1'))
    expect(h.decision().muteWebPage).toBe(false)
  })

  it('mutes page sound while he is listening and during a narration', () => {
    const h = harness()
    h.at(0).send(start('listening', 'mic-1'))
    expect(h.decision().muteWebPage).toBe(true)
    h.at(10).send(end('mic-1'))
    expect(h.decision().muteWebPage).toBe(false)
    h.at(20).send(start('narration', 'story-1'))
    expect(h.decision().muteWebPage).toBe(true)
  })

  it('keeps music paused, not just lowered, while a page plays under Buddy', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(0).send(start('webPage', 'page'))
    h.at(100).send(start('buddyVoice', 'line-1'))
    expect(h.decision()).toMatchObject({ music: 'held', muteWebPage: true })
  })

  it('does not mute a page just because a chat is open', () => {
    const h = harness()
    h.at(0).send(start('chat', 'chat'))
    expect(h.decision().muteWebPage).toBe(false)
  })
})

describe('audio policy: her own choices win', () => {
  it('keeps music paused after a hold ends if she paused it meanwhile', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(100).send(start('webPage', 'page'))
    h.at(200).send({ type: 'musicPause' })
    h.at(300).send(end('page'))
    expect(h.decision(300 + RESUME_DELAY_MS)).toMatchObject({
      music: 'paused',
      musicVolume: 0,
      showStopMusic: true,
      changesAt: null
    })
  })

  it('remembers Play pressed during a hold and plays once the hold ends', () => {
    const h = harness()
    h.at(0).send(start('narration', 'story-1'))
    h.at(100).send(play)
    expect(h.decision().music).toBe('held')
    h.at(5000).send(end('story-1'))
    expect(h.decision(5000 + RESUME_DELAY_MS).music).toBe('playing')
  })

  it('plays right away when she presses Play during the resume delay', () => {
    const h = harness()
    h.at(0).send(play)
    h.at(100).send(start('webPage', 'page'))
    h.at(200).send({ type: 'musicPause' })
    h.at(300).send(end('page'))
    h.at(400).send(play)
    expect(h.decision()).toMatchObject({ music: 'playing', musicVolume: 1, changesAt: null })
  })

  it('ignores Pause when nothing is playing', () => {
    const h = harness()
    h.send({ type: 'musicPause' })
    expect(h.decision().music).toBe('off')
  })
})

// The rule half of AC #4. The rule knows sounds, not screens, so these are
// audio states: Stop must work in every one of them, and showStopMusic must
// not depend on anything a screen could hide. Drawing that Stop in the
// browser's nav bar (and testing it end to end) is TASK-37's acceptance criteria.
describe('audio policy: Stop works in every audio state (AC #4, the rule)', () => {
  type Scenario = { name: string; setup: (h: Harness) => void; ends: string[] }
  const scenarios: Scenario[] = [
    { name: 'music playing', setup: () => undefined, ends: [] },
    {
      name: 'Buddy talking over it',
      setup: (h) => h.send(start('buddyVoice', 'line-1')),
      ends: ['line-1']
    },
    {
      name: 'a web page making sound',
      setup: (h) => h.send(start('webPage', 'page')),
      ends: ['page']
    },
    {
      name: 'a web page making sound while Buddy talks',
      setup: (h) => {
        h.send(start('webPage', 'page'))
        h.send(start('buddyVoice', 'line-1'))
      },
      ends: ['line-1', 'page']
    },
    {
      name: 'a photo with its narration',
      setup: (h) => h.send(start('narration', 'story-1')),
      ends: ['story-1']
    },
    {
      name: 'a chat with Buddy listening',
      setup: (h) => {
        h.send(start('chat', 'chat'))
        h.send(start('listening', 'mic-1'))
      },
      ends: ['mic-1', 'chat']
    },
    { name: 'music she paused', setup: (h) => h.send({ type: 'musicPause' }), ends: [] }
  ]

  it.each(scenarios)('shows Stop and stops for good from: $name', ({ setup, ends }) => {
    const h = harness()
    h.at(0).send(play)
    h.at(100)
    setup(h)
    expect(h.decision().showStopMusic).toBe(true)

    h.at(200).send({ type: 'musicStop' })
    expect(h.decision()).toMatchObject({
      music: 'off',
      musicVolume: 0,
      showStopMusic: false,
      changesAt: null
    })

    // Whatever was holding the music ends later: it must not come back by itself.
    h.at(300)
    for (const id of ends) h.send(end(id))
    expect(h.decision(300 + RESUME_DELAY_MS * 10)).toMatchObject({
      music: 'off',
      musicVolume: 0,
      showStopMusic: false
    })
  })

  it('accepts Stop when nothing is playing', () => {
    const h = harness()
    h.send({ type: 'musicStop' })
    expect(h.decision()).toMatchObject({ music: 'off', showStopMusic: false })
  })
})
