import { useEffect, useRef } from 'react'
import { zLayers } from '@shared/zLayers'
import type { BuddyCommand } from '@shared/buddy/commands'
import { TILE_SHADOW, tileBackground, tileInk } from '../clay'

export function BuddyMenu({
  onChat,
  onCommand,
  onClose
}: {
  onChat: () => void
  onCommand: (command: BuddyCommand) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector('button')?.focus()
    return () => previous?.focus()
  }, [])
  const choices = [
    { label: "Let's chat", icon: '💬', action: onChat },
    { label: 'Dance', icon: '🎵', action: () => onCommand({ clip: 'dance' }) },
    { label: 'Wave', icon: '👋', action: () => onCommand({ clip: 'big_wave' }) },
    {
      label: 'Say something nice',
      icon: '💛',
      action: () => onCommand({ clip: 'heart', text: "I'm happy to spend some time with you." })
    }
  ]
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: zLayers.buddyMenu,
        background: 'rgba(30,35,30,.25)',
        display: 'grid',
        placeItems: 'center'
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Buddy menu"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Tab') {
            const buttons = Array.from(panel.current?.querySelectorAll('button') ?? [])
            const next =
              (buttons.indexOf(document.activeElement as HTMLButtonElement) +
                (e.shiftKey ? -1 : 1) +
                buttons.length) %
              buttons.length
            e.preventDefault()
            buttons[next]?.focus()
          }
        }}
        style={{
          width: 780,
          padding: 32,
          borderRadius: 40,
          background: 'var(--s1,#FBFAF7)',
          boxShadow: TILE_SHADOW
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'calc(36px * var(--font-scale, 1))' }}>
            Hello, friend!
          </h2>
          <button
            aria-label="Close Buddy menu"
            onClick={onClose}
            style={{ width: 72, height: 72, border: 'none', borderRadius: '50%', fontSize: 36 }}
          >
            ×
          </button>
        </div>
        <div style={{ display: 'grid', gap: 18 }}>
          {choices.map((choice, index) => (
            <button
              key={choice.label}
              onClick={choice.action}
              style={{
                minHeight: 90,
                padding: '18px 28px',
                border: 'none',
                borderRadius: 28,
                background: tileBackground(index),
                color: tileInk(index),
                boxShadow: TILE_SHADOW,
                fontSize: 'calc(32px * var(--font-scale, 1))',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <span aria-hidden="true" style={{ marginRight: 20 }}>
                {choice.icon}
              </span>
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
