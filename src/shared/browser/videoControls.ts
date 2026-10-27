export type VideoCommand = 'play' | 'pause' | 'rewind' | 'fullscreen'
export interface VideoState {
  available: boolean
  paused: boolean
  canRewind: boolean
  fullscreen: boolean
}
export const NO_VIDEO: VideoState = {
  available: false,
  paused: true,
  canRewind: false,
  fullscreen: false
}

/** Serialized into a separate world with a user gesture from Home's button.
 * Keep this self-contained: page scripts cannot replace its DOM prototypes. */
export async function operateVideo(command: VideoCommand): Promise<boolean> {
  const player = document.querySelector('video')
  if (!player || player.readyState < 1 || player.error) return false
  if (command === 'play') await player.play()
  if (command === 'pause') player.pause()
  if (command === 'rewind') {
    if (!player.seekable.length) return false
    player.currentTime = Math.max(player.seekable.start(0), player.currentTime - 10)
  }
  if (command === 'fullscreen') {
    // HTML fullscreen asks the deny-all session for a permission and can cover
    // kiosk chrome. A top-layer popover expands only inside this WebContentsView.
    const world = globalThis as typeof globalThis & { videoStyle?: string | null }
    if (player.matches(':popover-open')) {
      player.hidePopover()
      player.removeAttribute('popover')
      if (world.videoStyle === null) player.removeAttribute('style')
      else player.setAttribute('style', world.videoStyle ?? '')
    } else {
      world.videoStyle = player.getAttribute('style')
      player.setAttribute('popover', 'manual')
      player.style.cssText =
        'position:fixed;inset:0;margin:0;border:0;padding:0;width:100%;height:100%;max-width:none;max-height:none;object-fit:contain;background:black'
      player.showPopover()
    }
  }
  return true
}

/** Only YouTube's individual videos, never search/home or lookalike hosts. */
export function supportsVideoControls(address: string): boolean {
  try {
    const url = new URL(address)
    return (
      url.protocol === 'https:' &&
      ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) &&
      ((url.pathname === '/watch' && Boolean(url.searchParams.get('v'))) ||
        /^\/(shorts|embed)\/[^/]+\/?$/.test(url.pathname))
    )
  } catch {
    return false
  }
}
