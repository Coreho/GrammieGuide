import { BrowserWindow } from 'electron'
import { getConfig } from '../../config/store'
import { navigationAllowed } from '@shared/browser/approvedSites'
import { WEB_PARTITION, hardenWebSession } from '../browser/webSession'

/** One short-lived sandboxed page, muted before navigation and forcibly closed on every path. */
export async function captureNewsPreview(url: string): Promise<string> {
  hardenWebSession()
  const window = new BrowserWindow({
    show: false,
    width: 720,
    height: 960,
    useContentSize: true,
    skipTaskbar: true,
    webPreferences: {
      partition: WEB_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      disableDialogs: true,
      backgroundThrottling: false,
      offscreen: true
    }
  })
  const contents = window.webContents
  contents.setAudioMuted(true)
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const guard = (event: Electron.Event, target: string): void => {
    if (!navigationAllowed(target, getConfig(), 'redirect')) event.preventDefault()
  }
  contents.on('will-navigate', guard)
  contents.on('will-redirect', guard)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        if (!navigationAllowed(url, getConfig(), 'open')) throw new Error('Unapproved source')
        await new Promise<void>((resolve, reject) => {
          contents.once('dom-ready', () => resolve())
          void window.loadURL(url).catch(reject)
        })
        // Give loaded images one paint opportunity, without waiting on ad/analytics traffic.
        await new Promise((resolve) => setTimeout(resolve, 500))
        const image = await contents.capturePage(undefined, { stayHidden: true, stayAwake: false })
        if (image.isEmpty()) throw new Error('Empty preview')
        const jpeg = image.resize({ width: 480 }).toJPEG(70)
        if (jpeg.length > 300_000) throw new Error('Preview too large')
        return `data:image/jpeg;base64,${jpeg.toString('base64')}`
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Preview timed out')), 10_000)
      })
    ])
  } finally {
    clearTimeout(timeout)
    // destroy ignores beforeunload; removing/hiding alone would leave video and scripts alive.
    if (!window.isDestroyed()) window.destroy()
  }
}
