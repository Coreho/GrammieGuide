import { useEffect, useState } from 'react'
import { NO_VIDEO } from '@shared/browser/videoControls'
import { zLayers } from '@shared/zLayers'

export function VideoControls() {
  const [state, setState] = useState(NO_VIDEO)
  useEffect(() => window.launcher.onVideo(setState), [])
  if (!state.available) return null
  return (
    <div
      role="toolbar"
      aria-label="Video controls"
      style={{
        position: 'fixed',
        top: 72,
        left: 0,
        right: 0,
        height: 88,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        background: 'var(--bgB, #f3eee5)',
        zIndex: zLayers.navBar
      }}
    >
      <button
        style={button}
        onClick={() => void window.launcher.videoCommand(state.paused ? 'play' : 'pause')}
      >
        {state.paused ? '▶ Play' : 'Ⅱ Pause'}
      </button>
      <button
        style={button}
        disabled={!state.canRewind}
        onClick={() => void window.launcher.videoCommand('rewind')}
      >
        ↶ Back 10 seconds
      </button>
      <button style={button} onClick={() => void window.launcher.videoCommand('fullscreen')}>
        {state.fullscreen ? 'Smaller video' : 'Full screen'}
      </button>
    </div>
  )
}
const button = {
  minHeight: 64,
  padding: '8px 24px',
  borderRadius: 16,
  border: '2px solid currentColor',
  background: 'var(--s1, #fff)',
  color: 'var(--ink, #243449)',
  fontSize: 'clamp(18px, calc(20px * var(--font-scale, 1)), 30px)',
  cursor: 'pointer'
}
