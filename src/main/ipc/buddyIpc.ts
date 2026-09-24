import { ipcMain } from 'electron'
import type { BuddyChatTurn } from '@shared/ipcContract'
import { getConfig } from '../config/store'
import { buddyChat } from '../services/ai/buddyChatService'
import { getAnthropicClient } from '../services/ai/anthropicClient'
import { logActivity } from '../services/activityLog/activityLog'

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
}
