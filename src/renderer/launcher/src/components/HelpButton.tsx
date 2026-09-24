import { PhoneIcon } from '../icons'

/**
 * Ported from the design's footer "Get help" pill, including the double
 * box-shadow ring (white then red) that halos it off the background - that
 * halo is what makes Help visually unmistakable regardless of theme, which
 * is the actual point: it must never be confusable with a regular tile.
 * The design's real-looking "Calls Sarah" / live-call flow is replaced
 * with honest copy since GrammieGuide doesn't have calling built yet.
 */
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Get help"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '18px 44px 18px 18px',
        border: 'none',
        borderRadius: 999,
        cursor: 'pointer',
        background: 'linear-gradient(180deg,#D9544F,#BC3A36)',
        color: '#fff',
        boxShadow:
          'inset 0 3px 1px rgba(255,255,255,.35), inset 0 -5px 10px rgba(0,0,0,.15), 0 0 0 7px var(--s1,#FBFAF7), 0 0 0 10px #BC3A36, 0 18px 34px rgba(150,40,40,.35)',
        transition: 'transform .12s'
      }}
      onPointerDown={(e) => (e.currentTarget.style.transform = 'translateY(3px) scale(.98)')}
      onPointerUp={(e) => (e.currentTarget.style.transform = '')}
      onPointerLeave={(e) => (e.currentTarget.style.transform = '')}
    >
      <div
        style={{
          width: 88,
          height: 88,
          flex: 'none',
          borderRadius: '50%',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'inset 0 -3px 6px rgba(0,0,0,.1), 0 4px 8px rgba(0,0,0,.2)'
        }}
      >
        <PhoneIcon />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 'calc(40px * var(--font-scale, 1))', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap' }}>
          Get help
        </div>
        <div style={{ fontSize: 'calc(22px * var(--font-scale, 1))', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
          Notifies a caregiver
        </div>
      </div>
    </button>
  )
}
