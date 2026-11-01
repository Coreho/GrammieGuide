import { BrowserWindow, session } from 'electron'
import { join } from 'node:path'

const PARTITION = 'pdf-pages'
const TOTAL_TIMEOUT_MS = 120_000
let sessionReady = false

/** No request leaves this session, whatever a PDF asks for. */
function lockedSession(): Electron.Session {
  const ses = session.fromPartition(PARTITION)
  if (!sessionReady) {
    sessionReady = true
    ses.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true })
    )
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    ses.setPermissionCheckHandler(() => false)
  }
  return ses
}

export type RenderPdf = (
  bytes: Uint8Array,
  maxPages: number,
  edge: number,
  onPage: (jpeg: Buffer) => Promise<void>
) => Promise<void>

/**
 * A downloaded PDF is the most complicated thing this app ever parses from the internet, so it
 * is opened only in a hidden sandboxed window with no preload, no Node and no network, which is
 * closed straight afterwards. It hands back pictures, which main decodes and re-encodes again.
 * This needs the built renderer, so under `npm run dev` it fails and the pattern saves without
 * pages. A PDF longer than maxPages is refused before any page is drawn.
 */
export const renderPdfPages: RenderPdf = async (bytes, maxPages, edge, onPage) => {
  const window = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      session: lockedSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  const contents = window.webContents
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => event.preventDefault())
  let timer: NodeJS.Timeout | undefined
  const failed = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('PDF took too long')), TOTAL_TIMEOUT_MS)
    contents.once('render-process-gone', () => reject(new Error('PDF window crashed')))
  })
  const work = async (): Promise<void> => {
    await window.loadFile(join(__dirname, '../renderer/pdfPages/index.html'))
    const base64 = Buffer.from(bytes).toString('base64')
    const pages = (await contents.executeJavaScript(`openPdf(${JSON.stringify(base64)})`)) as number
    if (!Number.isInteger(pages) || pages < 1 || pages > maxPages) {
      throw new Error('PDF has too many pages')
    }
    for (let number = 1; number <= pages; number++) {
      const url = (await contents.executeJavaScript(`renderPage(${number}, ${edge})`)) as string
      if (typeof url !== 'string' || !url.startsWith('data:image/jpeg;base64,')) {
        throw new Error('PDF page could not be drawn')
      }
      await onPage(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
    }
  }
  try {
    await Promise.race([work(), failed])
  } finally {
    clearTimeout(timer)
    if (!window.isDestroyed()) window.destroy()
  }
}
