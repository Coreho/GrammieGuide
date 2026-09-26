import { ipcMain } from 'electron'
import type { BuddyChatTurn } from '@shared/ipcContract'
import { getConfig } from '../config/store'
import { buddyChat } from '../services/ai/buddyChatService'
import { getAnthropicClient } from '../services/ai/anthropicClient'
import { logActivity } from '../services/activityLog/activityLog'
import { createTtsService } from '../services/speech/ttsService'
import { listenOnce, canListen } from '../services/speech/sttService'

const tts = createTtsService()
// The recognizer/mic check spawns PowerShell (~1s); the answer can't change
// without a reboot-level hardware change, so ask once per run.
let canListenOnce: Promise<boolean> | null = null

export function registerBuddyIpc(): void {
  ipcMain.handle('buddy:chat', async (_e, req: { turns: BuddyChatTurn[] }) => {
    const { anthropicApiKey, model } = getConfig().buddy
    const result = await buddyChat(Array.isArray(req?.turns) ? req.turns : [], {
      apiKey: anthropicApiKey,
      model,
      client: anthropicApiKey ? getAnthropicClient(anthropicApiKey) : null,
      log: logActivity
    })
    // Log that a conversation happened, never what was said - the activity
    // log is caregiver-visible, and her chats with Buddy are hers.
    logActivity(result.ok ? 'buddy-chat' : `buddy-chat-${result.reason}`)
    return result
  })

  ipcMain.handle('buddy:speak', async (_e, req: { text?: unknown; voice?: unknown }) => {
    const { cloudTtsEnabled, ttsVoice } = getConfig().buddy
    if (!cloudTtsEnabled) return { ok: false, reason: 'disabled' }
    const text = typeof req?.text === 'string' ? req.text : ''
    const voice = typeof req?.voice === 'string' ? req.voice : ttsVoice
    const result = await tts.speak(text, voice)
    if (!result.ok && result.reason === 'unavailable') logActivity('buddy-voice-unavailable')
    return result
  })

  ipcMain.handle('buddy:listen', async () => {
    const result = await listenOnce()
    // Like chat: that she spoke is loggable, what she said is not.
    logActivity(result.ok ? 'buddy-heard' : `buddy-listen-${result.reason}`)
    return result
  })

  ipcMain.handle('buddy:canListen', () => {
    canListenOnce ??= canListen().catch(() => false)
    return canListenOnce
  })
}
