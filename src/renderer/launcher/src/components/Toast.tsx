/** Brief "Opening X..." confirmation, ported from the design's toast. */
export function Toast({ message }: { message: string }) {
  return (
    <div
      data-toast
      style={{
        position: 'absolute',
        top: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '20px 36px',
        borderRadius: 24,
        background: 'linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4))',
        boxShadow: 'inset 0 2px 1px rgba(255,255,255,.7), 0 14px 28px rgba(var(--sh,60,55,45),.2)',
        fontSize: 'calc(32px * var(--font-scale, 1))',
        fontWeight: 700,
        color: 'var(--ai,#1F5A45)',
        whiteSpace: 'nowrap',
        // Purely informational, and it sits right over the tile grid. Without this
        // it swallows the next tap on a tile for as long as it is on screen, which
        // reads to her as a dead tile.
        pointerEvents: 'none'
      }}
    >
      {message}
    </div>
  )
}
