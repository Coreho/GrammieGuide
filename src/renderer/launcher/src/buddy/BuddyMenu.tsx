import { useEffect, useLayoutEffect, useRef } from 'react'
import { zLayers } from '@shared/zLayers'
import type { BuddyCommand } from '@shared/buddy/commands'
import { CHIP_SHADOW } from '../clay'

/** Coordinates inside the scaled Stage, captured when the shortcut is pressed. */
export type BuddyMenuAnchor = { x: number; y: number }

export function BuddyMenu({
  anchor,
  onChat,
  onCommand,
  onClose
}: {
  anchor: BuddyMenuAnchor
  onChat?: () => void
  onCommand: (command: BuddyCommand) => void
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = panel.current
    const stage = el?.parentElement
    if (!el || !stage) return
    const place = (): void => {
      // Measure the actual card: larger text may wrap a row. Clamp both axes
      // before paint so neither the left edge nor the top can clip its controls.
      const gap = 12
      el.style.left = `${Math.max(gap, Math.min(anchor.x - el.offsetWidth / 2, stage.clientWidth - el.offsetWidth - gap))}px`
      el.style.top = `${Math.max(gap, Math.min(anchor.y - el.offsetHeight - gap, stage.clientHeight - el.offsetHeight - gap))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [anchor])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector('button')?.focus()
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const outside = (event: MouseEvent): void => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) onClose()
    }
    document.addEventListener('click', outside)
    return () => document.removeEventListener('click', outside)
  }, [onClose])

  const choices = [
    ...(onChat ? [{ label: "Let's chat", icon: '💬', action: onChat }] : []),
    { label: 'Dance', icon: '🎵', action: () => onCommand({ clip: 'dance' }) },
    { label: 'Wave', icon: '👋', action: () => onCommand({ clip: 'big_wave' }) },
    {
      label: 'Say something nice',
      icon: '💛',
      action: () => onCommand({ clip: 'heart', text: "I'm happy to spend some time with you." })
    },
    { label: 'Take a walk', icon: '🐾', action: () => onCommand({ walk: true }) }
  ]

  return (
    <div
      ref={panel}
      role="menu"
      aria-label="Buddy menu"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
        if (['Tab', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          const buttons = Array.from(panel.current?.querySelectorAll('button') ?? [])
          const backwards = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)
          const next =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? buttons.length - 1
                : (buttons.indexOf(document.activeElement as HTMLButtonElement) +
                    (backwards ? -1 : 1) +
                    buttons.length) %
                  buttons.length
          e.preventDefault()
          buttons[next]?.focus()
        }
      }}
      style={{
        position: 'absolute',
        zIndex: zLayers.buddyMenu,
        width: 290,
        maxWidth: 'calc(100% - 24px)',
        maxHeight: 'calc(100% - 24px)',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: 8,
        borderRadius: 22,
        background: 'color-mix(in srgb, var(--s1,#FBFAF7) 82%, transparent)',
        backdropFilter: 'blur(12px)',
        boxShadow: CHIP_SHADOW,
        color: 'var(--ink,#2E2E2C)'
      }}
    >
      {choices.map((choice) => (
        <button
          key={choice.label}
          role="menuitem"
          onClick={choice.action}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            minHeight: 48,
            padding: '8px 10px',
            border: 'none',
            borderRadius: 14,
            background: 'transparent',
            color: 'inherit',
            fontSize: 'calc(20px * var(--font-scale, 1))',
            fontFamily: 'inherit',
            fontWeight: 700,
            lineHeight: 1.2,
            textAlign: 'left',
            cursor: 'pointer'
          }}
        >
          <span aria-hidden="true">{choice.icon}</span>
          <span>{choice.label}</span>
        </button>
      ))}
    </div>
  )
}
