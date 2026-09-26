import { describe, it, expect, vi } from 'vitest'
import { cleanForSpeech, createTtsService, DEFAULT_VOICE, type TtsClient } from '../../src/main/services/speech/ttsService'
import { listenOnce, canListen, LISTEN_SCRIPT, MIN_CONFIDENCE } from '../../src/main/services/speech/sttService'
import type { ShellResult } from '../../src/main/services/reliability/shellExec'

function fakeClient(chunks: string[] | Error, setMetadata = vi.fn(async () => undefined)): TtsClient & {
  setMetadata: typeof setMetadata
  close: ReturnType<typeof vi.fn>
  spoken: string[]
} {
  const spoken: string[] = []
  return {
    spoken,
    setMetadata,
    close: vi.fn(),
    toStream(input: string) {
      spoken.push(input)
      return {
        audioStream: (async function* () {
          if (chunks instanceof Error) throw chunks
          for (const c of chunks) yield Buffer.from(c)
        })()
      }
    }
  }
}

describe('cleanForSpeech', () => {
  it('escapes characters that would break the SSML template', () => {
    expect(cleanForSpeech('Tea & biscuits <3')).toBe('Tea &amp; biscuits &lt;3')
  })

  it('drops markdown symbols and emoji instead of reading them out', () => {
    expect(cleanForSpeech('**Good morning!** 🌞 Have a _lovely_ day')).toBe('Good morning! Have a lovely day')
  })

  it('is empty for text with nothing speakable', () => {
    expect(cleanForSpeech('  🐾 ** ')).toBe('')
  })
})

describe('tts service', () => {
  it('returns base64 MP3 and reuses one connection per voice', async () => {
    const client = fakeClient(['ab', 'cd'])
    const create = vi.fn(() => client)
    const tts = createTtsService({ createClient: create })

    const first = await tts.speak('Hello there', 'en-US-AriaNeural')
    const second = await tts.speak('Hello again', 'en-US-AriaNeural')

    expect(first).toEqual({ ok: true, audioBase64: Buffer.from('abcd').toString('base64'), mime: 'audio/mpeg' })
    expect(second.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    expect(client.setMetadata).toHaveBeenCalledWith('en-US-AriaNeural', expect.anything())
    expect(client.spoken).toEqual(['Hello there', 'Hello again'])
  })

  it('falls back to the default voice when given a malformed voice name', async () => {
    const client = fakeClient(['x'])
    const tts = createTtsService({ createClient: () => client })
    await tts.speak('Hi', '"><script>')
    expect(client.setMetadata).toHaveBeenCalledWith(DEFAULT_VOICE, expect.anything())
  })

  it('soft-fails and reconnects fresh after an error', async () => {
    const broken = fakeClient(new Error('socket closed'))
    const healthy = fakeClient(['ok'])
    const create = vi.fn().mockReturnValueOnce(broken).mockReturnValueOnce(healthy)
    const tts = createTtsService({ createClient: create })

    expect(await tts.speak('Hi', DEFAULT_VOICE)).toEqual({ ok: false, reason: 'unavailable' })
    expect(await tts.speak('Hi', DEFAULT_VOICE)).toMatchObject({ ok: true })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('gives up after the timeout instead of hanging', async () => {
    const stuck: TtsClient = {
      setMetadata: () => new Promise(() => undefined),
      toStream: () => ({
        audioStream: (async function* () {
          // never reached: setMetadata never resolves
        })()
      }),
      close: () => undefined
    }
    const tts = createTtsService({ createClient: () => stuck, timeoutMs: 20 })
    expect(await tts.speak('Hi', DEFAULT_VOICE)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('does not call the service for empty lines', async () => {
    const create = vi.fn(() => fakeClient(['x']))
    const tts = createTtsService({ createClient: create })
    expect(await tts.speak('   ', DEFAULT_VOICE)).toEqual({ ok: false, reason: 'empty' })
    expect(create).not.toHaveBeenCalled()
  })
})

function shell(stdout: string, ok = true): ShellResult {
  return { ok, stdout, stderr: '', exitCode: ok ? 0 : 1, durationMs: 5 }
}

describe('speech recognition', () => {
  it('runs the dictation script and returns what was heard', async () => {
    const run = vi.fn(async () => shell('{"status":"ok","text":"what is the weather","confidence":0.82}'))
    expect(await listenOnce(run)).toEqual({ ok: true, text: 'what is the weather' })
    expect(run).toHaveBeenCalledWith(LISTEN_SCRIPT, expect.objectContaining({ timeoutMs: expect.any(Number) }))
  })

  it('treats silence and low-confidence noise as nothing heard', async () => {
    expect(await listenOnce(async () => shell('{"status":"nothing"}'))).toEqual({ ok: false, reason: 'nothing-heard' })
    const noise = JSON.stringify({ status: 'ok', text: 'the', confidence: MIN_CONFIDENCE / 2 })
    expect(await listenOnce(async () => shell(noise))).toEqual({ ok: false, reason: 'nothing-heard' })
  })

  it('reports a missing microphone distinctly', async () => {
    expect(await listenOnce(async () => shell('{"status":"no-mic"}'))).toEqual({ ok: false, reason: 'no-mic' })
  })

  it('soft-fails on a PowerShell failure or unparseable output', async () => {
    expect(await listenOnce(async () => shell('', false))).toEqual({ ok: false, reason: 'unavailable' })
    expect(await listenOnce(async () => shell('Exception calling Recognize'))).toEqual({ ok: false, reason: 'unavailable' })
    expect(await listenOnce(async () => shell('{"status":"no-recognizer"}'))).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('canListen is true only when the recognizer and mic both check out', async () => {
    expect(await canListen(async () => shell('{"status":"ok"}'))).toBe(true)
    expect(await canListen(async () => shell('{"status":"no-mic"}'))).toBe(false)
    expect(await canListen(async () => shell('', false))).toBe(false)
  })
})
