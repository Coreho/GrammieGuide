import type { CSSProperties } from 'react'
import { zLayers } from '@shared/zLayers'

export function NavBar({ onHome, onBack }: { onHome: () => void; onBack: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 72,
        zIndex: zLayers.navBar,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        background: 'var(--bgB,#1f2d3d)',
        color: 'var(--ink,#fff)'
      }}
    >
      <button onClick={onHome} style={navButtonStyle}>
        🏠 Home
      </button>
      <button onClick={onBack} style={navButtonStyle}>
        ← Back
      </button>
    </div>
  )
}

const navButtonStyle: CSSProperties = {
  fontSize: 'calc(1.1rem * var(--font-scale, 1))',
  padding: '12px 24px',
  borderRadius: 16,
  border: 'none',
  background: 'var(--s1,#3a5f8a)',
  color: 'var(--ink,#fff)',
  cursor: 'pointer'
}
