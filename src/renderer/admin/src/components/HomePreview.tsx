import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useConfigStore } from '../state/useConfigStore'
import { applyPreviewThemeToElement } from '@shared/theme'
import { TileGrid } from '../../../launcher/src/components/TileGrid'
import { HomeHeader, timeParts } from '../../../launcher/src/components/HomeHeader'
import { ContactButton } from '../../../launcher/src/contacts/ContactButton'

/**
 * A scaled, non-interactive preview of the Home screen at the caregiver's
 * chosen text size, theme, layout, and tiles.
 *
 * Renders at Home's fixed 1440x900 design size, scaled down to fit the admin
 * panel via CSS transform. Scopes her theme tokens and --font-scale to the
 * preview container alone, never touching admin's document root. Reuses
 * TileGrid with a no-op action and a static placeholder for Buddy, avoiding
 * loading Three.js into the admin window.
 */
export function HomePreview() {
  const config = useConfigStore((s) => s.config)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)
  const [now, setNow] = useState(() => new Date())

  // Keep clock and date live without polling or IPC
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])

  // Keep the 1440x900 design scaled to the preview container's rendered width
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = (): void => {
      const w = el.clientWidth
      if (w > 0) {
        setScale(w / 1440)
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Apply her theme tokens and --font-scale on the preview container only,
  // clearing THEME_ONLY_KEYS so previous theme styles do not stick.
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || !config) return
    applyPreviewThemeToElement(
      el,
      config.display.theme,
      config.display.fontStep,
      config.display.background
    )
  }, [config?.display.theme, config?.display.fontStep, config?.display.background])

  if (!config) return null

  const { time, ampm, date } = timeParts(now)

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: '.85rem',
          fontWeight: 600,
          color: '#555',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline'
        }}
      >
        <span>Home preview (her screen at her text size)</span>
        <span style={{ fontSize: '.75rem', fontWeight: 'normal', color: '#777' }}>
          Non-interactive
        </span>
      </div>
      <div
        ref={wrapperRef}
        data-home-preview
        data-testid="home-preview"
        style={{
          width: '100%',
          maxWidth: 720,
          aspectRatio: '1440 / 900',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          border: '1px solid #c8d1dc',
          background: 'var(--page, #0f1b2b)',
          pointerEvents: 'none'
        }}
      >
        <div
          ref={stageRef}
          data-home-preview-stage
          inert
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 1440,
            height: 900,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            boxSizing: 'border-box',
            padding: '40px 64px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
            overflow: 'hidden',
            background:
              'radial-gradient(120% 90% at 50% 0%, var(--bgA,#F4F3EF) 0%, var(--bgB,#ECEAE5) 60%, var(--bgC,#E6E4DF) 100%)',
            color: 'var(--ink,#2E2E2C)',
            fontFamily: "'Figtree', system-ui, sans-serif",
            userSelect: 'none',
            pointerEvents: 'none'
          }}
        >
          {/* Home's own header; weather is never fetched from the preview. */}
          <HomeHeader time={time} ampm={ampm} date={date} weather={null} />

          <TileGrid
            tiles={config.tiles}
            layout={config.display.homeLayout}
            onActivate={() => {
              // Non-interactive: never call any IPC that changes anything
            }}
          />

          <footer
            style={{ flex: 'none', height: 150, display: 'flex', alignItems: 'flex-end', gap: 32 }}
          >
            <div
              data-home-contact-slot
              style={{ width: 420, height: 112, flex: 'none', pointerEvents: 'none' }}
            >
              {config.contacts.enabled && config.contacts.preferred && (
                <ContactButton name={config.contacts.preferred.name} onClick={() => {}} />
              )}
            </div>
            {/* Static placeholder where Buddy's floor is; never loads Three.js into admin */}
            <div
              data-home-buddy-placeholder
              aria-hidden="true"
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink2, #5E5D59)',
                fontSize: 'calc(24px * var(--font-scale, 1))',
                opacity: 0.6,
                pointerEvents: 'none'
              }}
            >
              🐱 Buddy
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}
