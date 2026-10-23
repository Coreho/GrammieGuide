import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { getAdminWindow } from '../windows/windowManager'
import { onAdminLocked } from '../services/auth/adminAuth'
import { requireAdminUnlocked } from './requireAdminUnlocked'
import { cancelChatGptLogin, getChatGptSession } from '../services/chatgpt/runtime'

export function requireChatGptAdmin(event: IpcMainInvokeEvent): void {
  requireAdminUnlocked()
  if (
    event.sender !== getAdminWindow()?.webContents ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw new Error('Open ChatGPT settings in the caregiver panel.')
}
export function registerChatGptIpc(): void {
  onAdminLocked(cancelChatGptLogin)
  app.on('before-quit', cancelChatGptLogin)
  ipcMain.handle('chatgpt:state', (event) => {
    requireChatGptAdmin(event)
    return getChatGptSession().state()
  })
  ipcMain.handle('chatgpt:connect', async (event, request: { id?: unknown }) => {
    requireChatGptAdmin(event)
    if (request?.id !== undefined && typeof request.id !== 'string')
      throw new Error('Choose a saved account.')
    event.sender.removeListener('destroyed', cancelChatGptLogin)
    event.sender.removeListener('did-start-navigation', cancelChatGptLogin)
    event.sender.once('destroyed', cancelChatGptLogin)
    event.sender.once('did-start-navigation', cancelChatGptLogin)
    return getChatGptSession().connect(request?.id as string | undefined)
  })
  ipcMain.handle('chatgpt:cancel', (event) => {
    requireChatGptAdmin(event)
    cancelChatGptLogin()
    return getChatGptSession().state()
  })
  ipcMain.handle('chatgpt:select', (event, request: { id?: unknown }) => {
    requireChatGptAdmin(event)
    if (typeof request?.id !== 'string') throw new Error('Choose a saved account.')
    return getChatGptSession().select(request.id)
  })
  ipcMain.handle('chatgpt:models', (event) => {
    requireChatGptAdmin(event)
    return getChatGptSession().loadModels()
  })
  ipcMain.handle('chatgpt:test', (event, request: { model?: unknown }) => {
    requireChatGptAdmin(event)
    if (typeof request?.model !== 'string' || request.model.length > 200)
      throw new Error('Choose a discovered model.')
    return getChatGptSession().test(request.model)
  })
  ipcMain.handle('chatgpt:welcome', (event) => {
    requireChatGptAdmin(event)
    return getChatGptSession().welcome()
  })
  ipcMain.handle('chatgpt:signOut', (event) => {
    requireChatGptAdmin(event)
    return getChatGptSession().signOut()
  })
  ipcMain.handle('chatgpt:usage', (event) => {
    requireChatGptAdmin(event)
    return shell.openExternal('https://chatgpt.com/settings/usage')
  })
}
