import type { CSSProperties } from 'react'
import { zLayers } from '@shared/zLayers'

export function NavBar({
  onHome,
  onBack,
  onStopMusic,
  message,
  readerToggle,
  ravelrySave
}: {
  onHome: () => void
  onBack: () => void
  onStopMusic?: () => void
  message?: string | null
  readerToggle?: { article: boolean; onToggle: () => void }
  /** On a Ravelry pattern page: save the pattern she is looking at. */
  ravelrySave?: { saved: boolean; saving: boolean; onSave: () => void }
}) {
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
      {readerToggle && (
        <button style={navButtonStyle} onClick={readerToggle.onToggle}>
          {readerToggle.article ? 'Show page' : 'Show article'}
        </button>
      )}
      {ravelrySave && (
        <button
          data-ravelry-page-save
          disabled={ravelrySave.saved || ravelrySave.saving}
          onClick={ravelrySave.onSave}
          style={{
            ...navButtonStyle,
            fontWeight: 800,
            background: 'linear-gradient(180deg, var(--a1, #bce5cb), var(--a2, #89cba7))',
            color: 'var(--ink, #30291f)',
            opacity: ravelrySave.saved ? 0.75 : 1
          }}
        >
          {ravelrySave.saved ? '✓ Saved' : ravelrySave.saving ? 'Saving…' : 'Save this pattern'}
        </button>
      )}
      {onStopMusic && (
        <button
          onClick={onStopMusic}
          style={{ ...navButtonStyle, background: '#a7332b', color: '#fff' }}
        >
          ■ Stop music
        </button>
      )}
      {message && (
        <span role="status" data-toast style={{ fontSize: 'calc(20px * var(--font-scale, 1))' }}>
          {message}
        </span>
      )}
    </div>
  )
}

const navButtonStyle: CSSProperties = {
  minHeight: 56,
  fontSize: 'calc(1.1rem * var(--font-scale, 1))',
  padding: '12px 24px',
  borderRadius: 16,
  border: 'none',
  background: 'var(--s1,#3a5f8a)',
  color: 'var(--ink,#fff)',
  cursor: 'pointer'
}
