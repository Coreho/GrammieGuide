/**
 * Pure protocol allow-list check, split out from embeddedBrowser.ts so it's
 * unit-testable without pulling in Electron (that module imports
 * WebContentsView/BrowserWindow/ipcMain at the top level, which don't exist
 * outside a running Electron process).
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function isAllowedUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return ALLOWED_PROTOCOLS.has(parsed.protocol)
  } catch {
    return false
  }
}
