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
          background: '#20344a',
          color: '#fff',
          borderRadius: 24,
          padding: 40,
          maxWidth: '80vw',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}
      >
        {children}
      </div>
    </div>
  )
}
