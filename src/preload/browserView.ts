import { ipcRenderer } from 'electron'

/**
 * Forwards user activity inside the embedded web tile to the main process
 * so the shared inactivity/confusion timer resets on real interaction, not
 * just on navigation. No contextBridge exposure needed - this preload only
 * listens, it doesn't give the loaded page any privileged API.
 */
let lastSent = 0
const THROTTLE_MS = 2000

function reportActivity(): void {
  const now = Date.now()
  if (now - lastSent < THROTTLE_MS) return
  lastSent = now
  ipcRenderer.send('browserView:activity')
}

for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(eventName, reportActivity, { capture: true, passive: true })
}
