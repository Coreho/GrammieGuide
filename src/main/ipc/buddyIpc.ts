import { app, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { BuddyChatTurn } from '@shared/ipcContract'
import { getConfig } from '../config/store'
import { buddyChat } from '../services/ai/buddyChatService'
import { getBuddyChatClient } from '../services/ai/buddyChatClient'
import { logActivity } from '../services/activityLog/activityLog'
import { createTtsService } from '../services/speech/ttsService'
import { listenOnce, canListen } from '../services/speech/sttService'
import { buddyCommandSchema } from '@shared/buddy/commands'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { getLauncherWindow } from '../windows/windowManager'
import {
  buddyActionRequestSchema,
  ACTION_REPLIES,
  type BuddyActionRequest,
  type BuddyActionResult
} from '@shared/buddy/actions'
import { resolveBuddyAction } from '../services/ai/buddyActions'
import { libraryPaths } from '../services/media/libraryPaths'
import type { MediaLibrary } from '@shared/media/mediaPath'
import type { LibraryStore } from '../services/media/libraryStore'
import { runPowerShell } from '../services/reliability/shellExec'
import { PersonalHistory } from '@shared/buddy/personalFacts'

const tts = createTtsService()
// The recognizer/mic check spawns PowerShell (~1s); the answer can't change
// without a reboot-level hardware change, so ask once per run.
let canListenOnce: Promise<boolean> | null = null

export function registerBuddyIpc(getStore: (kind: MediaLibrary) => LibraryStore): void {
  const personalHistory = new PersonalHistory()
  const resolveAction = (action: BuddyActionRequest): Promise<BuddyActionResult> =>
    resolveBuddyAction(
      action,
      getConfig(),
      (kind) => getStore(kind).list(),
      async (kind, entry) => {
        try {
          return (
            await stat(join(libraryPaths(app.getPath('userData'), kind).folder, entry.fileName))
          ).isFile()
        } catch {
          return false
        }
      }
    )
  ipcMain.handle('buddy:action', (event, request: unknown) => {
    const parsed = buddyActionRequestSchema.safeParse(request)
    if (event.sender !== getLauncherWindow()?.webContents || !parsed.success)
      return { ok: false, reply: ACTION_REPLIES.unavailable }
    return resolveAction(parsed.data)
  })
  ipcMain.handle('buddy:command', (_e, req: unknown) => {
    requireAdminUnlocked()
    const command = buddyCommandSchema.safeParse(req)
    const launcher = getLauncherWindow()
    if (!command.success || !launcher || launcher.isDestroyed()) return { ok: false }
    launcher.webContents.send('buddy:command', command.data)
    logActivity('buddy-command')
    return { ok: true }
  })
  ipcMain.handle('buddy:chat', async (_e, req: { turns: BuddyChatTurn[] }) => {
    if (_e.sender !== getLauncherWindow()?.webContents)
      return { ok: false, reason: 'unavailable', reply: ACTION_REPLIES.unavailable }
    const { provider, anthropicApiKey, openrouterApiKey, model, chatEnabled } = getConfig().buddy
    // Each provider keeps its own key, so switching back and forth never needs
    // one to be re-entered.
    const apiKey = provider === 'openrouter' ? openrouterApiKey : anthropicApiKey
    const result = await buddyChat(Array.isArray(req?.turns) ? req.turns : [], {
      chatEnabled,
      apiKey,
      provider,
      model,
      client: chatEnabled && apiKey ? getBuddyChatClient(provider, apiKey) : null,
      log: logActivity,
      personal: { facts: () => getConfig().buddy.personalFacts, history: personalHistory },
      resolveAction
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

  let listening: AbortController | null = null
  ipcMain.handle('buddy:cancelListen', (event) => {
    if (event.sender === getLauncherWindow()?.webContents) listening?.abort()
  })
  ipcMain.handle('buddy:listen', async (event) => {
    if (event.sender !== getLauncherWindow()?.webContents || !getConfig().buddy.chatEnabled)
      return { ok: false, reason: 'unavailable' }
    listening?.abort()
    const controller = new AbortController()
    listening = controller
    const cancel = (): void => controller.abort()
    event.sender.once('destroyed', cancel)
    // The existing recognizer accepts a runner. Cancel its child process here so
    // closing chat releases the microphone, rather than merely hiding the result.
    const result = await listenOnce((script, opts) =>
      runPowerShell(script, { ...opts, signal: controller.signal })
    ).finally(() => {
      event.sender.removeListener('destroyed', cancel)
      if (listening === controller) listening = null
    })
    if (controller.signal.aborted || !getConfig().buddy.chatEnabled)
      return { ok: false, reason: 'unavailable' }
    // Like chat: that she spoke is loggable, what she said is not.
    logActivity(result.ok ? 'buddy-heard' : `buddy-listen-${result.reason}`)
    return result
  })

  ipcMain.handle('buddy:canListen', () => {
    canListenOnce ??= canListen().catch(() => false)
    return canListenOnce
  })
}
