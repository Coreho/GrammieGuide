import type { CSSProperties } from 'react'
import { FONT_STEP_COUNT } from '@shared/theme'
import { CLAY_UP, CLAY_DISABLED, TRACK_SHADOW } from '../clay'

/**
 * The old app's font scale was keyboard-only (Ctrl+=/Ctrl+-) with no
 * on-screen control at all. Ported from the Clay Launcher design: two big
 * circular buttons around a track pill with a 5-dot level indicator, each
 * button visibly disabling itself at the top/bottom step instead of just
 * silently doing nothing.
 */
export function FontScaleControl({ step, onChange }: { step: number; onChange: (next: number) => void }) {
  const atMin = step === 0
  const atMax = step === FONT_STEP_COUNT - 1

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: 12,
        borderRadius: 999,
        background: 'var(--track,#C9C7C1)',
        boxShadow: TRACK_SHADOW
      }}
    >
      <button
        aria-label="Make text smaller"
        disabled={atMin}
        onClick={() => onChange(step - 1)}
        style={circleStyle(atMin)}
      >
        <span style={{ fontSize: 32, fontWeight: 800 }}>A</span>
        <span style={{ fontSize: 32, fontWeight: 800 }}>&minus;</span>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 4px' }}>
        <div style={{ fontSize: 'calc(20px * var(--font-scale, 1))', fontWeight: 700, color: 'var(--ink,#2E2E2C)', whiteSpace: 'nowrap' }}>
          Text size
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: FONT_STEP_COUNT }, (_, i) => (
            <span
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: i <= step ? 'var(--dot,#2F7F62)' : 'var(--dotOff,#EDEBE6)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,.2)'
              }}
            />
          ))}
        </div>
      </div>

      <button
        aria-label="Make text bigger"
        disabled={atMax}
        onClick={() => onChange(step + 1)}
        style={circleStyle(atMax)}
      >
        <span style={{ fontSize: 42, fontWeight: 800 }}>A</span>
        <span style={{ fontSize: 32, fontWeight: 800 }}>+</span>
      </button>
    </div>
  )
}

function circleStyle(disabled: boolean): CSSProperties {
  return {
    width: 96,
    height: 96,
    border: 'none',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    cursor: disabled ? 'default' : 'pointer',
    background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s3,#E8E6E1))',
    boxShadow: disabled ? CLAY_DISABLED : CLAY_UP,
    color: disabled ? 'var(--dis,#9C9A95)' : 'var(--ink,#2E2E2C)',
    transition: 'transform .12s'
  }
}
