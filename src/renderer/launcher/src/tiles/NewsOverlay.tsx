import { useEffect, useState, type CSSProperties } from 'react'
import { zLayers } from '@shared/zLayers'
import { friendlyAge } from '@shared/news/friendlyAge'
import type { NewsResult, NewsStory } from '@shared/news/types'
import { TILE_SHADOW, TILE_SHADOW_ACTIVE } from '../clay'
import type { BuiltinViewProps } from './builtins'

/**
 * The News tile's own view: today's stories as long, short cards she can scan
 * before choosing one, instead of landing on a busy front page. Everything is
 * plain text from main (parseFeed strips the feed's HTML), and pictures arrive
 * as data: URLs, so the launcher's CSP stays as strict as before.
 */
export function NewsOverlay({ tile, onClose, onBrowsing }: BuiltinViewProps) {
  const [news, setNews] = useState<NewsResult | null>(null)

  useEffect(() => {
    let live = true
    window.launcher
      .getNews(tile.id)
      .then((result) => live && setNews(result))
      .catch(() => live && setNews({ ok: false }))
    return () => {
      live = false
    }
  }, [tile.id])

  async function open(storyId?: string): Promise<void> {
    const result = await window.launcher.openNews(tile.id, storyId)
    if (result.ok) onBrowsing()
  }

  const now = Date.now()
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zLayers.newsOverlay,
        background: 'rgba(46,46,44,.45)',
        display: 'flex',
        justifyContent: 'center',
        padding: 40,
        boxSizing: 'border-box'
      }}
    >
      <section
        role="dialog"
        aria-label={tile.label}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 1400,
          maxWidth: '100%',
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          padding: 40,
          borderRadius: 44,
          color: 'var(--ink,#2E2E2C)',
          background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
          boxShadow: 'inset 0 3px 1px var(--hl,#fff), 0 40px 80px rgba(0,0,0,.3)'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24
          }}
        >
          <h1 style={{ margin: 0, fontSize: 'calc(52px * var(--font-scale, 1))', lineHeight: 1.1 }}>
            {tile.label}
          </h1>
          <button onClick={onClose} style={pillStyle}>
            Back to Home
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            // Room for the cards' shadows inside the scroll area.
            padding: '6px 10px 16px'
          }}
        >
          {!news && <p style={messageStyle}>Getting today&apos;s news...</p>}
          {news && !news.ok && (
            <>
              {/* Never the reason: a calm line, and the site itself when there is one. */}
              <p style={messageStyle}>The news isn&apos;t ready right now.</p>
              {tile.url && (
                <button onClick={() => void open()} style={{ ...pillStyle, alignSelf: 'center' }}>
                  Open the news website
                </button>
              )}
            </>
          )}
          {news?.ok &&
            news.stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                now={now}
                onOpen={() => void open(story.id)}
              />
            ))}
        </div>
      </section>
    </div>
  )
}

function StoryCard({ story, now, onOpen }: { story: NewsStory; now: number; onOpen: () => void }) {
  const age = friendlyAge(story.publishedAt, now)
  return (
    <button
      onClick={onOpen}
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 28,
        width: '100%',
        minHeight: 150,
        padding: '20px 28px',
        border: 'none',
        borderRadius: 32,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'inherit',
        background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
        boxShadow: TILE_SHADOW,
        transition: 'transform .12s, box-shadow .12s'
      }}
      onPointerDown={(e) => {
        e.currentTarget.style.transform = 'translateY(3px) scale(.995)'
        e.currentTarget.style.boxShadow = TILE_SHADOW_ACTIVE
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = TILE_SHADOW
      }}
    >
      {story.thumbnail && (
        <img
          src={story.thumbnail}
          alt=""
          draggable={false}
          style={{ width: 200, height: 130, flex: 'none', objectFit: 'cover', borderRadius: 20 }}
        />
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontSize: 'calc(34px * var(--font-scale, 1))',
            fontWeight: 700,
            lineHeight: 1.15
          }}
        >
          {story.title}
        </span>
        {story.summary && (
          <span
            style={{
              fontSize: 'calc(24px * var(--font-scale, 1))',
              lineHeight: 1.3,
              color: 'var(--ink2,#4A4945)',
              // A preview, not the article: two lines is enough to decide.
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {story.summary}
          </span>
        )}
        {age && (
          <span
            style={{ fontSize: 'calc(22px * var(--font-scale, 1))', color: 'var(--ink2,#4A4945)' }}
          >
            {age}
          </span>
        )}
      </span>
    </button>
  )
}

const messageStyle: CSSProperties = {
  margin: '40px 0 12px',
  textAlign: 'center',
  fontSize: 'calc(34px * var(--font-scale, 1))',
  fontWeight: 600,
  color: 'var(--ink2,#4A4945)'
}

const pillStyle: CSSProperties = {
  flex: 'none',
  padding: '20px 48px',
  border: 'none',
  borderRadius: 999,
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: 'linear-gradient(180deg, var(--g1,#D3D1CB), var(--g2,#BAB8B2))',
  boxShadow: 'inset 0 2px 1px rgba(255,255,255,.7), 0 8px 16px rgba(var(--sh,60,55,45),.18)',
  fontSize: 'calc(30px * var(--font-scale, 1))',
  fontWeight: 700,
  color: 'var(--ink,#2E2E2C)'
}
