import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { BuddySpeakResult } from '@shared/ipcContract'

/**
 * Buddy's voice: Microsoft Edge's online "Read aloud" neural voices, the
 * same service the old app's tts.js used (no API key). Everything that can
 * fail here fails soft - the renderer falls back to the Windows voice
 * (speechSynthesis) on any ok:false, so she still hears him.
 *
 * Differences from the old tts.js:
 *   - the text is XML-escaped before it goes out: toStream() wraps its input
 *     in SSML, so a reply containing "&" or "<" used to break synthesis
 *   - the timeout lives here rather than being raced in the IPC handler
 *   - the client factory is injectable so tests never open a socket
 */

export const DEFAULT_VOICE = 'en-US-AriaNeural'
export const MAX_SPEECH_CHARS = 1200
const VOICE_PATTERN = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/

type AudioStream = AsyncIterable<Buffer | Uint8Array>
export type TtsClient = {
  setMetadata(voice: string, format: OUTPUT_FORMAT): Promise<void>
  toStream(input: string): { audioStream: AudioStream }
  close(): void
}

/**
 * Turns a chat reply into something worth hearing: no markdown symbols or
 * emoji read out as words, whitespace collapsed, length capped, then escaped
 * for the SSML template.
 */
export function cleanForSpeech(text: string): string {
  const plain = text
    .replace(/[*_#`~>|]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPEECH_CHARS)
  return plain
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function isValidVoice(voice: unknown): voice is string {
  return typeof voice === 'string' && VOICE_PATTERN.test(voice)
}

export function createTtsService(
  opts: { createClient?: () => TtsClient; timeoutMs?: number } = {}
): {
  speak(text: string, voice: string): Promise<BuddySpeakResult>
} {
  const createClient = opts.createClient ?? ((): TtsClient => new MsEdgeTTS() as unknown as TtsClient)
  const timeoutMs = opts.timeoutMs ?? 10_000
  // One ready client per voice: setMetadata opens the socket, so reusing it
  // saves ~half the latency on every line after the first.
  const clients = new Map<string, Promise<TtsClient>>()

  function clientFor(voice: string): Promise<TtsClient> {
    let pending = clients.get(voice)
    if (!pending) {
      pending = (async () => {
        const client = createClient()
        await client.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
        return client
      })()
      clients.set(voice, pending)
    }
    return pending
  }

  function drop(voice: string): void {
    const pending = clients.get(voice)
    clients.delete(voice)
    pending?.then((c) => c.close()).catch(() => undefined)
  }

  async function synthesize(text: string, voice: string): Promise<Buffer> {
    const client = await clientFor(voice)
    const chunks: Buffer[] = []
    for await (const chunk of client.toStream(text).audioStream) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
  }

  return {
    async speak(text, voice) {
      const clean = cleanForSpeech(text)
      if (!clean) return { ok: false, reason: 'empty' }
      const useVoice = isValidVoice(voice) ? voice : DEFAULT_VOICE
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const audio = await Promise.race([
          synthesize(clean, useVoice),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('tts timeout')), timeoutMs)
          })
        ])
        if (audio.length === 0) throw new Error('empty audio')
        return { ok: true, audioBase64: audio.toString('base64'), mime: 'audio/mpeg' }
      } catch {
        // A dead socket stays dead; the next line reconnects fresh.
        drop(useVoice)
        return { ok: false, reason: 'unavailable' }
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
