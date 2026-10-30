import { utilityProcess } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logActivity } from '../activityLog/activityLog'
import { resourcesDir } from '../reliability/kioskServices'
import { createLocalVoice, type LocalVoice, type VoiceProcess } from './localVoice'
import type { VoiceWorkerReply } from './localVoiceProtocol'

/**
 * The app's one local voice process (localVoice.ts), shared by Buddy's speech
 * and the caregiver's voice check. The model lives in resources/voice-model
 * (an extra resource once installed; fetched by scripts/fetchVoiceModel.ts).
 *
 * E2E runs keep the Windows fallback they test unless GRAMMIEGUIDE_LOCAL_VOICE
 * asks for this voice, so a suite never loads a 300 MB model per launch.
 */

const MODEL_FILE = 'onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx'

let instance: LocalVoice | null = null

export function getLocalVoice(): LocalVoice {
  if (instance) return instance
  const modelDir = join(resourcesDir(), 'voice-model')
  const enabled =
    process.env.GRAMMIEGUIDE_E2E !== '1' || process.env.GRAMMIEGUIDE_LOCAL_VOICE === '1'
  instance = createLocalVoice({
    modelPresent: () => enabled && existsSync(join(modelDir, MODEL_FILE)),
    log: logActivity,
    fork: () => {
      const child = utilityProcess.fork(join(__dirname, 'localVoiceWorker.js'), [], {
        serviceName: 'Buddy voice',
        stdio: 'ignore',
        env: { ...process.env, GRAMMIEGUIDE_VOICE_MODEL_DIR: modelDir }
      })
      return {
        postMessage: (message) => child.postMessage(message),
        on: ((event: 'message' | 'exit', listener: (value: never) => void) => {
          child.on(event as 'message', listener as (message: VoiceWorkerReply) => void)
        }) as VoiceProcess['on'],
        kill: () => {
          child.kill()
        }
      }
    }
  })
  return instance
}
