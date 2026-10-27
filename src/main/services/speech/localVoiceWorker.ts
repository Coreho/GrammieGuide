import { env, RawAudio } from '@huggingface/transformers'
import { KokoroTTS, TextSplitterStream } from 'kokoro-js'
import type { VoiceWorkerReply, VoiceWorkerRequest } from './localVoiceProtocol'

/**
 * Buddy's voice on this computer, in its own Electron utility process (see
 * localVoice.ts for why). Loads Kokoro-82M from the folder main names in
 * GRAMMIEGUIDE_VOICE_MODEL_DIR and never reaches for the network: the model
 * ships with the app (scripts/fetchVoiceModel.ts).
 *
 * One line at a time; each reply is a WAV file. Kokoro reads at most ~500
 * phonemes per pass, so a line is split into sentences and joined back up.
 */

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

env.localModelPath = process.env.GRAMMIEGUIDE_VOICE_MODEL_DIR ?? ''
env.allowLocalModels = true
env.allowRemoteModels = false

const port = process.parentPort
const send = (reply: VoiceWorkerReply): void => port.postMessage(reply)

// fp32 ran about three times faster than q8 on a plain CPU.
const loading = KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu' })
loading.then(
  () => send({ type: 'ready' }),
  () => send({ type: 'failed' })
)

async function synthesize({ id, text, voice, speed }: VoiceWorkerRequest): Promise<void> {
  try {
    const tts = await loading
    const parts: Float32Array[] = []
    let rate = 24_000
    // Given a plain string, kokoro-js's stream() waits forever for text that
    // never comes after the last sentence; a closed splitter ends it.
    const sentences = new TextSplitterStream()
    sentences.push(text)
    sentences.close()
    const options = { voice: voice as 'af_heart', speed }
    for await (const { audio } of tts.stream(sentences, options)) {
      parts.push(audio.audio)
      rate = audio.sampling_rate
    }
    const joined = new Float32Array(parts.reduce((n, part) => n + part.length, 0))
    let offset = 0
    for (const part of parts) {
      joined.set(part, offset)
      offset += part.length
    }
    send({ type: 'audio', id, wav: new Uint8Array(new RawAudio(joined, rate).toWav()) })
  } catch {
    send({ type: 'error', id })
  }
}

let queue = Promise.resolve()
port.on('message', (event) => {
  const request = event.data as VoiceWorkerRequest
  queue = queue.then(() => synthesize(request))
})
