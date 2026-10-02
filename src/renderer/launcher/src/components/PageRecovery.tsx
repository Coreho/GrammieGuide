import type { CSSProperties } from 'react'
import type { PageProblem } from '@shared/browser/loadFailure'
import { zLayers } from '@shared/zLayers'
import { CLAY_UP } from '../clay'

/**
 * Shown in place of a web page that failed to load or a link that was blocked.
 * Plain words, two big choices, and never an error code: the old app left
 * Chromium's own error page on her screen. The nav bar above stays put, so
 * Home is in the same place as on every page.
 */
const WORDS: Record<PageProblem, { title: string; body: string; action: string }> = {
  offline: {
    title: "The internet isn't working right now.",
    body: "This page will open by itself as soon as it's back.",
    action: 'Try again'
  },
  unreachable: {
    title: "This page won't open right now.",
    body: 'It may be busy. You can try again in a little while.',
    action: 'Try again'
  },
  blocked: {
    title: "That page can't be opened here.",
    body: 'You can go back to the page you were on, or go Home.',
    action: 'Back to the page'
  }
}

export function PageRecovery({
  problem,
  onAction,
  onHome
}: {
  problem: PageProblem
  onAction: () => void
  onHome: () => void
}) {
  const words = WORDS[problem]
  return (
    <div
      role="alert"
      aria-label={words.title}
      style={{
        position: 'fixed',
        top: 72,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: zLayers.pageRecovery,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 48,
        textAlign: 'center',
        // The same background and ink as Home, so it feels like part of her screen.
        background:
          'radial-gradient(120% 90% at 50% 0%, var(--bgA,#F4F3EF) 0%, var(--bgB,#ECEAE5) 60%, var(--bgC,#E6E4DF) 100%)',
        color: 'var(--ink,#2E2E2C)'
      }}
    >
      <div style={{ fontSize: 'calc(2.6rem * var(--font-scale, 1))', fontWeight: 800 }}>
        {words.title}
      </div>
      <div style={{ fontSize: 'calc(1.7rem * var(--font-scale, 1))', maxWidth: 900 }}>
        {words.body}
      </div>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={onAction} style={bigButton}>
          {words.action}
        </button>
        <button onClick={onHome} style={bigButton}>
          🏠 Home
        </button>
      </div>
    </div>
  )
}

const bigButton: CSSProperties = {
  minWidth: 280,
  minHeight: 110,
  padding: '0 40px',
  borderRadius: 28,
  border: 'none',
  fontSize: 'calc(1.9rem * var(--font-scale, 1))',
  fontWeight: 800,
  cursor: 'pointer',
  color: 'var(--ink,#2E2E2C)',
  background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
  boxShadow: CLAY_UP
}
