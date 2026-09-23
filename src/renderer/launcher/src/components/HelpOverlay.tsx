import { zLayers } from '@shared/zLayers'
import { OverlayShell } from './OverlayShell'

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayShell zIndex={zLayers.helpOverlay} onClose={onClose}>
      <h1 style={{ fontSize: 'calc(2rem * var(--font-scale, 1))' }}>Need Help?</h1>
      <p style={{ fontSize: 'calc(1.3rem * var(--font-scale, 1))' }}>
        A caregiver will be notified. (Calling/messaging arrives in a later update.)
      </p>
      <button onClick={onClose} style={dismissButtonStyle}>
        Back to Home
      </button>
    </OverlayShell>
  )
}

const dismissButtonStyle = {
  marginTop: 24,
  fontSize: 'calc(1.2rem * var(--font-scale, 1))',
  padding: '16px 32px',
  borderRadius: 16,
  border: 'none',
  background: '#c0392b',
  color: '#fff',
  cursor: 'pointer'
}
