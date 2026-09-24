import type { ReactNode } from 'react'

/**
 * Shared full-screen overlay backdrop + centered card, so every overlay
 * (Help, Weather, Confusion, ...) looks and behaves consistently instead of
 * each hand-rolling its own backdrop/positioning like the old app's
 * overlays did.
 */
export function OverlayShell({
  zIndex,
  onClose,
  children
}: {
  zIndex: number
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
          color: 'var(--ink,#2E2E2C)',
          borderRadius: 24,
          padding: 40,
          maxWidth: '80vw',
          textAlign: 'center',
          boxShadow: 'inset 0 3px 1px var(--hl,#fff), 0 20px 40px rgba(var(--sh,60,55,45),.3)'
        }}
      >
        {children}
      </div>
    </div>
  )
}
