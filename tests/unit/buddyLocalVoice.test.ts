import { describe, expect, it, vi } from 'vitest'
import {
  createLocalVoice,
  lineTimeoutMs,
  type LocalVoiceDeps,
  type VoiceProcess
} from '../../src/main/services/speech/localVoice'
import type {
  VoiceWorkerReply,
  VoiceWorkerRequest
} from '../../src/main/services/speech/localVoiceProtocol'
import { speakLine } from '../../src/main/services/speech/voiceChain'
import { speechChunks } from '../../src/shared/buddy/speechChunks'
import { buddyConfigSchema, defaultConfig } from '../../src/shared/configSchema'
import { migration } from '../../src/main/config/migrations/021-local-voice'
import type { BuddySpeakResult } from '../../src/shared/ipcContract'

/** A stand-in for the utility process: tests decide when it is ready and what it answers. */
class FakeProcess implements VoiceProcess {
  sent: VoiceWorkerRequest[] = []
  killed = false
  private messageListeners: ((message: VoiceWorkerReply) => void)[] = []
  private exitListeners: ((code: number) => void)[] = []
  postMessage(message: VoiceWorkerRequest): void {
    this.sent.push(message)
  }
  on(event: 'message' | 'exit', listener: (value: never) => void): void {
    if (event === 'message') this.messageListeners.push(listener)
    else this.exitListeners.push(listener)
  }
  kill(): void {
    this.killed = true
  }
  reply(message: VoiceWorkerReply): void {
    for (const listener of this.messageListeners) listener(message)
  }
  exit(code = 1): void {
    for (const listener of this.exitListeners) listener(code)
  }
}

type Setup = {
  voice: ReturnType<typeof createLocalVoice>
  processes: FakeProcess[]
  log: ReturnType<typeof vi.fn>
  clock: { t: number }
}

function setup(overrides: Partial<LocalVoiceDeps> = {}): Setup {
  const processes: FakeProcess[] = []
  const log = vi.fn()
  const clock = { t: 0 }
  const voice = createLocalVoice({
    modelPresent: () => true,
    fork: () => {
      const proc = new FakeProcess()
      processes.push(proc)
      return proc
    },
    log,
    now: () => clock.t,
    timeoutMs: () => 1000,
    readyTimeoutMs: 5000,
    ...overrides
  })
  return { voice, processes, log, clock }
}

const WAV = new Uint8Array([82, 73, 70, 70])
const UNAVAILABLE = { ok: false, reason: 'unavailable' }

describe('the voice on this computer', () => {
  it('never makes an ordinary line wait for the model: that line falls back while it loads', async () => {
    const { voice, processes } = setup()
    expect(await voice.speak('Hello there', 'am_michael')).toEqual(UNAVAILABLE)
    expect(processes).toHaveLength(1)
    processes[0]!.reply({ type: 'ready' })
    const line = voice.speak('Hello there', 'am_michael')
    const sent = processes[0]!.sent[0]!
    expect(sent).toMatchObject({ text: 'Hello there', voice: 'am_michael' })
    processes[0]!.reply({ type: 'audio', id: sent.id, wav: WAV })
    expect(await line).toEqual({
      ok: true,
      audioBase64: Buffer.from(WAV).toString('base64'),
      mime: 'audio/wav',
      source: 'local'
    })
  })

  it('waits for the model when asked (the caregiver preview and check)', async () => {
    const { voice, processes } = setup()
    const line = voice.speak('Hi', 'bm_george', { wait: true })
    await vi.waitFor(() => expect(processes).toHaveLength(1))
    processes[0]!.reply({ type: 'ready' })
    await vi.waitFor(() => expect(processes[0]!.sent).toHaveLength(1))
    expect(processes[0]!.sent[0]!.voice).toBe('bm_george')
    processes[0]!.reply({ type: 'audio', id: processes[0]!.sent[0]!.id, wav: WAV })
    expect((await line).ok).toBe(true)
  })

  it('sends plain text and a known voice only', async () => {
    const { voice, processes } = setup()
    voice.warm()
    processes[0]!.reply({ type: 'ready' })
    void voice.speak('**Good morning!** 🌞', 'not-a-voice')
    expect(processes[0]!.sent[0]).toMatchObject({ text: 'Good morning!', voice: 'am_michael' })
    expect(await voice.speak('🐾', 'am_michael')).toEqual({ ok: false, reason: 'empty' })
  })

  it('is unavailable without the model, and never starts a process', async () => {
    const fork = vi.fn()
    const { voice } = setup({ modelPresent: () => false, fork })
    expect(await voice.speak('Hi', 'am_michael', { wait: true })).toEqual(UNAVAILABLE)
    expect(fork).not.toHaveBeenCalled()
  })

  it('stays off for good when the model fails to load', async () => {
    const { voice, processes, log } = setup()
    voice.warm()
    processes[0]!.reply({ type: 'failed' })
    expect(processes[0]!.killed).toBe(true)
    expect(await voice.speak('Hi', 'am_michael', { wait: true })).toEqual(UNAVAILABLE)
    expect(processes).toHaveLength(1)
    expect(log).toHaveBeenCalledWith('buddy-local-voice-unavailable')
  })

  it('a crash fails the line in progress and the next line starts a new process', async () => {
    const { voice, processes } = setup()
    voice.warm()
    processes[0]!.reply({ type: 'ready' })
    const line = voice.speak('Hello', 'am_michael')
    processes[0]!.exit()
    expect(await line).toEqual(UNAVAILABLE)
    voice.warm()
    expect(processes).toHaveLength(2)
  })

  it('treats a hung line as a crash', async () => {
    vi.useFakeTimers()
    try {
      const { voice, processes } = setup()
      voice.warm()
      processes[0]!.reply({ type: 'ready' })
      const line = voice.speak('Hello', 'am_michael')
      vi.advanceTimersByTime(1001)
      expect(await line).toEqual(UNAVAILABLE)
      expect(processes[0]!.killed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up after three crashes in ten minutes, but not for crashes spread out', () => {
    const { voice, processes, log, clock } = setup()
    for (let i = 0; i < 2; i++) {
      voice.warm()
      processes.at(-1)!.exit()
      clock.t += 11 * 60_000
    }
    voice.warm()
    expect(processes).toHaveLength(3)
    for (let i = 0; i < 2; i++) {
      processes.at(-1)!.exit()
      voice.warm()
    }
    processes.at(-1)!.exit()
    voice.warm()
    expect(processes).toHaveLength(5)
    expect(log).toHaveBeenCalledWith('buddy-local-voice-gave-up')
  })

  it('allows more time for longer lines, within a cap', () => {
    expect(lineTimeoutMs(200)).toBeGreaterThan(lineTimeoutMs(20))
    expect(lineTimeoutMs(100_000)).toBe(45_000)
  })
})

describe('which voice says the line', () => {
  const ok = (source: 'online' | 'local'): BuddySpeakResult => ({
    ok: true,
    audioBase64: 'x',
    mime: source === 'online' ? 'audio/mpeg' : 'audio/wav',
    source
  })
  const fail: BuddySpeakResult = { ok: false, reason: 'unavailable' }

  it('uses the online voice when it is on and working', async () => {
    const local = vi.fn(async () => ok('local'))
    const online = async (): Promise<BuddySpeakResult> => ok('online')
    const result = await speakLine({ cloudTtsEnabled: true, online, local, log: vi.fn() })
    expect(result).toMatchObject({ source: 'online' })
    expect(local).not.toHaveBeenCalled()
  })

  it('falls to the voice on this computer, without waiting, when the online one fails or is off', async () => {
    const log = vi.fn()
    const local = vi.fn(async () => ok('local'))
    const broken = async (): Promise<BuddySpeakResult> => fail
    const failed = await speakLine({ cloudTtsEnabled: true, online: broken, local, log })
    expect(failed).toMatchObject({ source: 'local' })
    expect(local).toHaveBeenLastCalledWith(false)
    expect(log).toHaveBeenCalledWith('buddy-voice-unavailable')
    const online = vi.fn()
    const off = await speakLine({ cloudTtsEnabled: false, online, local, log })
    expect(off).toMatchObject({ source: 'local' })
    expect(online).not.toHaveBeenCalled()
  })

  it('lets admin preview exactly one path', async () => {
    const local = vi.fn(async () => ok('local'))
    const broken = async (): Promise<BuddySpeakResult> => fail
    const log = vi.fn()
    expect(
      await speakLine({ path: 'online', cloudTtsEnabled: true, online: broken, local, log })
    ).toEqual(fail)
    expect(
      await speakLine({ path: 'online', cloudTtsEnabled: false, online: broken, local, log })
    ).toEqual({ ok: false, reason: 'disabled' })
    expect(local).not.toHaveBeenCalled()
    await speakLine({ path: 'local', cloudTtsEnabled: true, online: broken, local, log })
    expect(local).toHaveBeenCalledWith(true)
  })
})

describe('speaking a long line in pieces', () => {
  it('keeps short lines whole', () => {
    expect(speechChunks("  Hi! It's nice to see you.  ")).toEqual(["Hi! It's nice to see you."])
    expect(speechChunks('   ')).toEqual([])
  })

  it('starts with a short piece, then longer ones, losing no words', () => {
    const text =
      'That sounds like a lovely morning. The garden must look beautiful with all those roses coming up. ' +
      "I'm glad you had a nice cup of tea while you watched the birds. They always seem so busy in the spring. " +
      'Maybe the robins will build a nest in the hedge again this year, like they did before.'
    const pieces = speechChunks(text)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces[0]!.length).toBeLessThanOrEqual(160)
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(240)
    expect(pieces.join(' ')).toBe(text)
  })

  it('cuts an overlong sentence at a comma or a space, never mid-word', () => {
    const sentence = Array.from({ length: 60 }, (_, i) => `word${i}`).join(', ') + '.'
    const pieces = speechChunks(sentence)
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(240)
    expect(pieces.join(' ')).toBe(sentence)
  })
})

describe('local voice setting', () => {
  it('migration 021 adds the default voice and switches the online voice off once', () => {
    const before = {
      schemaVersion: 20,
      buddy: { cloudTtsEnabled: true, ttsVoice: 'en-US-GuyNeural' }
    }
    expect(migration.migrate(before)).toEqual({
      schemaVersion: 21,
      buddy: { cloudTtsEnabled: false, ttsVoice: 'en-US-GuyNeural', localVoice: 'am_michael' }
    })
    expect(before.buddy).not.toHaveProperty('localVoice')
    expect(before.buddy.cloudTtsEnabled).toBe(true)
  })

  it('starts new installs on the voice on this computer', () => {
    expect(defaultConfig().buddy.cloudTtsEnabled).toBe(false)
    expect(buddyConfigSchema.parse({}).cloudTtsEnabled).toBe(false)
  })

  it('falls back to the default instead of failing her config on an unknown voice', () => {
    const parsed = buddyConfigSchema.parse({ ...defaultConfig().buddy, localVoice: 'gone_voice' })
    expect(parsed.localVoice).toBe('am_michael')
  })
})
