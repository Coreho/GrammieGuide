import { Component, createElement, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReaderNode, ReaderState } from '@shared/news/reader'
import { readChunks } from '@shared/news/reader'
import { zLayers } from '@shared/zLayers'
import { CLAY_UP } from '../clay'
import { speak, stopSpeaking } from '../buddy/speech'
import './ReaderView.css'

function renderNode(node: ReaderNode, key: number): React.ReactNode {
  if (typeof node === 'string') return node
  if (node.tag === 'img')
    return node.src ? (
      <img key={key} src={node.src} alt={node.alt ?? ''} referrerPolicy="no-referrer" />
    ) : node.alt ? (
      <span key={key}>{node.alt}</span>
    ) : null
  // React throws if a void tag is given children, even an empty list, which blanked all of Home.
  if (node.tag === 'br') return <br key={key} />
  return createElement(node.tag, { key }, node.children.map(renderNode))
}

/**
 * Article content comes from the internet. If it can't be drawn she goes back to the real page,
 * because a render error with nothing to catch it empties Home, Home button included.
 */
class ReaderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  componentDidCatch(): void {
    void window.launcher.readerMode('page')
  }
  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

export function ReaderView({ state }: { state: ReaderState }) {
  return (
    // A new article gets a fresh chance; one bad article doesn't disable the reader.
    <ReaderBoundary key={state.article?.title ?? 'none'}>
      <ReaderContent state={state} />
    </ReaderBoundary>
  )
}

function ReaderContent({ state }: { state: ReaderState }) {
  const [reading, setReading] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    setReading(false)
    return () => {
      generation.current++
      stopSpeaking()
    }
  }, [state.article, state.mode])
  if (state.mode !== 'article' && state.mode !== 'loading') return null
  const article = state.article
  const read = async (): Promise<void> => {
    if (reading) {
      generation.current++
      stopSpeaking()
      setReading(false)
      return
    }
    if (!article) return
    const mine = ++generation.current
    setReading(true)
    await readChunks(
      `${article.title}\n${article.byline}\n${article.plainText}`,
      speak,
      () => mine === generation.current
    )
    if (mine === generation.current) setReading(false)
  }
  const date = article?.date ? new Date(article.date) : null
  return (
    <section
      aria-label="News article"
      className="reader-view"
      style={{ zIndex: zLayers.readerView }}
    >
      <article style={{ boxShadow: CLAY_UP }}>
        <h1>{article?.title || state.headline || 'Your story'}</h1>
        {state.mode === 'loading' ? (
          <p role="status">Getting the story…</p>
        ) : (
          article && (
            <>
              {article.byline && <p>{article.byline}</p>}
              {date && !Number.isNaN(date.getTime()) && (
                <p>{date.toLocaleDateString(undefined, { dateStyle: 'long' })}</p>
              )}
              <button className="reader-speech" onClick={() => void read()}>
                {reading ? '■ Stop reading' : '🔊 Read aloud'}
              </button>
              <div className="reader-body">{article.nodes.map(renderNode)}</div>
            </>
          )
        )}
      </article>
    </section>
  )
}
