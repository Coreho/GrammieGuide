import { ipcMain, net, type WebContents } from 'electron'
import { createServer } from 'node:net'
import { isCheckId, isVoiceReport, type CheckId } from '@shared/checks/caregiverChecks'
import { getConfig } from '../config/store'
import { logActivity } from '../services/activityLog/activityLog'
import { getAudioCoordinator } from '../services/audio/audioRuntime'
import { onAdminLocked } from '../services/auth/adminAuth'
import {
  closeEmbeddedBrowser,
  deviceOnline,
  getPageProblem,
  isBrowserOpen,
  openUrl
} from '../services/browser/embeddedBrowser'
import { createCaregiverChecks } from '../services/checks/caregiverChecks'
import { runPowerShell } from '../services/reliability/shellExec'
import { listenOnce } from '../services/speech/sttService'
import { createTtsService } from '../services/speech/ttsService'
import { getAdminWindow, getLauncherWindow } from '../windows/windowManager'
import { requireAdminUnlocked } from './requireAdminUnlocked'

/** A port that was free a moment ago and is closed again, so a load there is refused at once. */
function reserveClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      )
    })
  })
}

function sendTo(contents: WebContents | undefined, channel: string, payload: unknown): void {
  if (!contents || contents.isDestroyed()) return
  try {
    contents.send(channel, payload)
  } catch {
    // A window closing mid-send reads the current results when it opens again.
  }
}

const tts = createTtsService()
let listeningHolds = 0

export const caregiverChecks = createCaregiverChecks({
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  voiceSettings: () => getConfig().buddy,
  synthesize: (text, voice) => tts.speak(text, voice),
  listen: (signal) => listenOnce(runPowerShell, signal),
  holdListening: () => {
    // Main owns this hold, so it ends in a finally even if the admin window is gone.
    const id = `check:microphone:${++listeningHolds}`
    const audio = getAudioCoordinator()
    audio.dispatch({ type: 'start', source: 'listening', id })
    return () => audio.dispatch({ type: 'end', id })
  },
  isOnline: deviceOnline,
  fetchText: async (url, signal) => {
    const response = await net.fetch(url, { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  },
  reserveClosedPort,
  browser: {
    isOpen: isBrowserOpen,
    problem: getPageProblem,
    // Private: the activity log records that a page opened, not the check's address.
    open: (url) => openUrl(url, { privateNavigation: true }),
    close: closeEmbeddedBrowser
  },
  home: {
    available: () => Boolean(getLauncherWindow() && !getLauncherWindow()?.isDestroyed()),
    requestRecoveryPage: () =>
      sendTo(getLauncherWindow()?.webContents, 'checks:recovery-start', {}),
    returnHome: () => sendTo(getLauncherWindow()?.webContents, 'browser:return-home', {})
  },
  log: (type) => logActivity(type),
  onChange: (results) => sendTo(getAdminWindow()?.webContents, 'checks:changed', results)
})

/** Stops this sender's running checks when its window closes or reloads. */
const watchedSenders = new WeakSet<WebContents>()
function cancelWhenGone(sender: WebContents): void {
  if (watchedSenders.has(sender)) return
  watchedSenders.add(sender)
  sender.once('destroyed', () => caregiverChecks.cancelAll())
  sender.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) caregiverChecks.cancelAll()
  })
}

export function registerChecksIpc(): void {
  // Locking the panel stops a recording or a voice check on the spot.
  onAdminLocked(() => caregiverChecks.cancelAll())

  ipcMain.handle('checks:list', () => {
    requireAdminUnlocked()
    return caregiverChecks.results()
  })
  ipcMain.handle('checks:run', async (event, req: { id?: unknown }) => {
    requireAdminUnlocked()
    const id = req?.id
    if (!isCheckId(id) || id === 'voice') throw new Error('Unknown check.')
    cancelWhenGone(event.sender)
    return caregiverChecks.run(id)
  })
  ipcMain.handle('checks:cancel', (_event, req: { id?: unknown }) => {
    requireAdminUnlocked()
    if (req?.id === undefined) caregiverChecks.cancelAll()
    else if (isCheckId(req.id)) caregiverChecks.cancel(req.id as CheckId)
    return caregiverChecks.results()
  })
  ipcMain.handle('checks:voiceStart', async (event) => {
    requireAdminUnlocked()
    cancelWhenGone(event.sender)
    const start = await caregiverChecks.startVoice()
    // Locked while the voice was being made: the lock already cancelled it, send nothing to play.
    if (start.kind !== 'cancelled') requireAdminUnlocked()
    return start
  })
  ipcMain.handle('checks:voiceReport', (_event, req: { runId?: unknown; report?: unknown }) => {
    requireAdminUnlocked()
    if (typeof req?.runId !== 'number' || !isVoiceReport(req.report))
      throw new Error('Unknown report.')
    return caregiverChecks.reportVoice(req.runId, req.report)
  })
  ipcMain.handle('browser:openRecoveryCheck', (event) => {
    // Only Home may open it, and only the page a running check chose.
    if (event.sender !== getLauncherWindow()?.webContents) return { ok: false }
    return caregiverChecks.openRecoveryPage()
  })
}
