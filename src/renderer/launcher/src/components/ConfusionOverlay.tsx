import { useEffect } from 'react'
import { zLayers } from '@shared/zLayers'
import { OverlayShell } from './OverlayShell'

const AUTO_DISMISS_MS = 10_000

export function ConfusionOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <OverlayShell zIndex={zLayers.confusionOverlay} onClose={onClose}>
      <h1 style={{ fontSize: 'calc(1.8rem * var(--font-scale, 1))' }}>Let&apos;s take a breath</h1>
      <p style={{ fontSize: 'calc(1.2rem * var(--font-scale, 1))' }}>
        You&apos;re back at the home screen. Tap anywhere to continue.
      </p>
    </OverlayShell>
  )
}
