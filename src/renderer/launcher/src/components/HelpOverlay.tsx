import { zLayers } from '@shared/zLayers'
import { PhoneIcon } from '../icons'

/**
 * Ported from the design's Help modal (icon circle + title + subtitle +
 * dismiss pill), with honest copy instead of the design's "Calling Sarah
 * now" - GrammieGuide doesn't have live calling built yet, so this says
 * what actually happens: a caregiver is notified, nothing more.
 */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zLayers.helpOverlay,
        background: 'rgba(46,46,44,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48
      }}
    >
      <div
        style={{
          width: 820,
          maxWidth: '100%',
          boxSizing: 'border-box',
          padding: 56,
          borderRadius: 44,
          background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
          boxShadow: 'inset 0 3px 1px var(--hl,#fff), 0 40px 80px rgba(0,0,0,.3)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 28,
          textAlign: 'center'
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'linear-gradient(180deg,#D9544F,#BC3A36)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 3px 1px rgba(255,255,255,.35), 0 0 0 8px var(--s1,#FBFAF7), 0 0 0 11px #BC3A36'
          }}
        >
          <PhoneIcon color="#fff" />
        </div>
        <div style={{ fontSize: 'calc(52px * var(--font-scale, 1))', fontWeight: 800, lineHeight: 1.1 }}>
          Getting you help
        </div>
        <div
          style={{
            fontSize: 'calc(30px * var(--font-scale, 1))',
            fontWeight: 500,
            color: 'var(--ink2,#3E3D3A)',
            lineHeight: 1.35
          }}
        >
          A caregiver has been notified. You&apos;re safe at home.
        </div>
        <button onClick={onClose} style={dismissButtonStyle}>
          Back to Home
        </button>
      </div>
    </div>
  )
}

const dismissButtonStyle = {
  marginTop: 8,
  padding: '26px 64px',
  border: 'none',
  borderRadius: 999,
  cursor: 'pointer',
  background: 'linear-gradient(180deg, var(--g1,#D3D1CB), var(--g2,#BAB8B2))',
  boxShadow: 'inset 0 2px 1px rgba(255,255,255,.7), 0 8px 16px rgba(var(--sh,60,55,45),.18)',
  fontSize: 'calc(32px * var(--font-scale, 1))',
  fontWeight: 700,
  color: 'var(--ink,#2E2E2C)'
}
