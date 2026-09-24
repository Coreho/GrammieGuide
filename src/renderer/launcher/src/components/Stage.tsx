import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/**
 * The design is a fixed 1440x900 layout that scales uniformly to fit
 * whatever window size is actually available, rather than a fluid
 * responsive layout - the right call for a kiosk bolted to one specific
 * TV/monitor rather than a page viewed at arbitrary widths. Ported
 * directly from the design's own `stageTransform` approach.
 */
export function Stage({
  rootRef,
  children
}: {
  rootRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  const [scale, setScale] = useState(1)
  const outerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function recompute(): void {
      const w = outerRef.current?.clientWidth ?? window.innerWidth
      const h = outerRef.current?.clientHeight ?? window.innerHeight
      setScale(Math.min(w / 1440, h / 900))
    }
    recompute()
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [])

  return (
    <div ref={outerRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--page,#0f1b2b)' }}>
      <div
        ref={rootRef}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 1440,
          height: 900,
          transform: `translate(-50%,-50%) scale(${scale})`,
          boxSizing: 'border-box',
          padding: '40px 64px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 32,
          overflow: 'hidden',
          background:
            'radial-gradient(120% 90% at 50% 0%, var(--bgA,#F4F3EF) 0%, var(--bgB,#ECEAE5) 60%, var(--bgC,#E6E4DF) 100%)',
          color: 'var(--ink,#2E2E2C)',
          userSelect: 'none'
        }}
      >
        {children}
      </div>
    </div>
  )
}
