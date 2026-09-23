/**
 * The old app's font scale was keyboard-only (Ctrl+=/Ctrl+-) with no
 * on-screen control at all - a direct accessibility gap for the one user
 * who can't use a keyboard shortcut. This fixes that: a small, always-
 * reachable on-screen +/- control on Home.
 */
export function FontScaleControl({
  fontScale,
  onChange
}: {
  fontScale: number
  onChange: (next: number) => void
}) {
  const step = 0.1
  const clamp = (v: number): number => Math.min(1.6, Math.max(0.8, Math.round(v * 10) / 10))

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: 20,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.5)',
        borderRadius: 16,
        padding: '8px 12px'
      }}
    >
      <button
        aria-label="Decrease text size"
        onClick={() => onChange(clamp(fontScale - step))}
        style={fontButtonStyle}
      >
        A-
      </button>
      <button
        aria-label="Increase text size"
        onClick={() => onChange(clamp(fontScale + step))}
        style={fontButtonStyle}
      >
        A+
      </button>
    </div>
  )
}

const fontButtonStyle = {
  fontSize: '1.1rem',
  fontWeight: 700,
  padding: '10px 16px',
  borderRadius: 12,
  border: 'none',
  background: '#3a5f8a',
  color: '#fff',
  cursor: 'pointer'
}
