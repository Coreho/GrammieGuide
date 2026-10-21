import { ipcRenderer } from 'electron'
import { NO_VIDEO, type VideoState } from '@shared/browser/videoControls'

/**
 * Forwards user activity inside the embedded web tile to the main process
 * so the shared inactivity/confusion timer resets on real interaction, not
 * just on navigation. No contextBridge exposure needed - this preload only
 * listens, it doesn't give the loaded page any privileged API.
 */
let lastSent = 0
const THROTTLE_MS = 2000

function reportActivity(event: Event): void {
  // Only her real input counts: a page could otherwise dispatch fake events on a
  // timer and keep itself open forever past the caregiver's idle timeout.
  if (!event.isTrusted) return
  const now = Date.now()
  if (now - lastSent < THROTTLE_MS) return
  lastSent = now
  ipcRenderer.send('browserView:activity')
}

for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(eventName, reportActivity, { capture: true, passive: true })
}

// Nothing is exposed to page JavaScript. Main decides whether this document is
// supported; only its isolated preload receives the fixed transport commands.
let videoEnabled = false
function video(): HTMLVideoElement | null {
  return videoEnabled ? document.querySelector('video') : null
}
function reportVideo(): void {
  const player = video()
  const state: VideoState =
    player && player.readyState >= 1 && !player.error
      ? {
          available: true,
          paused: player.paused || player.ended,
          canRewind: player.seekable.length > 0,
          fullscreen: Boolean(document.fullscreenElement) || player.matches(':popover-open')
        }
      : { ...NO_VIDEO }
  ipcRenderer.send('browserView:videoState', state)
}
ipcRenderer.on('browserView:videoEnabled', (_event, enabled: boolean) => {
  videoEnabled = enabled === true
  reportVideo()
})
setInterval(reportVideo, 500)
