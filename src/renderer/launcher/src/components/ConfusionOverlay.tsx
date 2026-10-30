import { useEffect, useRef, type ButtonHTMLAttributes } from 'react'
import { zLayers } from '@shared/zLayers'
import { OverlayShell } from './OverlayShell'
import { DayPeriodGlyph, timeParts } from './HomeHeader'

const AUTO_DISMISS_MS = 15_000

const ACTION_BUTTON_STYLE: ButtonHTMLAttributes<HTMLButtonElement>['style'] = {
  minHeight: 74,
  padding: '14px 26px',
  border: 0,
  borderRadius: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  fontFamily: 'inherit',
  fontSize: 'calc(26px * var(--font-scale, 1))',
  fontWeight: 700,
  color: 'var(--ink, #2E2E2C)',
  background: 'linear-gradient(180deg, var(--s1, #FBFAF7), var(--s2, #ECEAE5))',
  boxShadow: '0 10px 20px rgba(var(--sh, 60, 55, 45), 0.16), inset 0 2px 0 var(--hl, #fff)',
  cursor: 'pointer'
}

export function ConfusionOverlay({
  now = new Date(),
  chatEnabled = false,
  onClose,
  onPlayMusic,
  onShowPhotos,
  onOpenChat
}: {
  now?: Date
  chatEnabled?: boolean
  onClose: () => void
  onPlayMusic?: () => void
  onShowPhotos?: () => void
  onOpenChat?: () => void
}) {
  const homeBtnRef = useRef<HTMLButtonElement>(null)
  const parts = timeParts(now)
  // App passes a new onClose on every render, and it re-renders every 10s for
  // the clock. Depending on onClose restarted the 15s timer before it could
  // fire and pulled focus back to Home each time, so read it through a ref.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    homeBtnRef.current?.focus()
    const t = setTimeout(() => onCloseRef.current(), AUTO_DISMISS_MS)
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <OverlayShell zIndex={zLayers.confusionOverlay} onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Let's take a breath"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          maxWidth: 880
        }}
      >
        <div
          data-confusion-orientation
          data-day-period={parts.period}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 22px',
            borderRadius: 999,
            background: 'rgba(var(--sh, 60, 55, 45), 0.09)',
            fontSize: 'calc(24px * var(--font-scale, 1))',
            fontWeight: 700,
            color: 'var(--ink, #2E2E2C)'
          }}
        >
          <DayPeriodGlyph period={parts.period} size={30} />
          <span>{parts.orientationLine}</span>
        </div>

        <h1 style={{ margin: 0, fontSize: 'calc(44px * var(--font-scale, 1))', fontWeight: 800 }}>
          Let&apos;s take a breath
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: 'calc(28px * var(--font-scale, 1))',
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--ink2, #4A4945)'
          }}
        >
          Everything is okay. You&apos;re back at the home screen.
        </p>

        <div
          data-confusion-actions
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginTop: 8
          }}
        >
          <button
            ref={homeBtnRef}
            onClick={onClose}
            style={{
              ...ACTION_BUTTON_STYLE,
              background: '#1D7844',
              color: '#FFFFFF',
              boxShadow: '0 10px 20px rgba(29, 120, 68, 0.28)'
            }}
          >
            Back to Home
          </button>
          {onPlayMusic && (
            <button onClick={onPlayMusic} style={ACTION_BUTTON_STYLE}>
              Play Calming Music
            </button>
          )}
          {onShowPhotos && (
            <button onClick={onShowPhotos} style={ACTION_BUTTON_STYLE}>
              Look at Family Photos
            </button>
          )}
          {chatEnabled && onOpenChat && (
            <button onClick={onOpenChat} style={ACTION_BUTTON_STYLE}>
              Chat with Buddy
            </button>
          )}
        </div>
      </div>
    </OverlayShell>
  )
}
