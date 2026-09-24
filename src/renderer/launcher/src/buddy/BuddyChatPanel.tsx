import { useEffect, useRef, useState } from 'react'
import { zLayers } from '@shared/zLayers'
import type { BuddyChatTurn } from '@shared/ipcContract'

/**
 * Tap-to-greet chat with Buddy. Replies come from the main process
 * (buddy:chat), which owns the API key and always returns a calm,
 * showable line - even on failure - so this panel never renders error
 * text of its own. Deliberately styled nothing like HelpOverlay (different
 * icon, different accent color, different tone) so the two are never
 * visually confusable.
 */
type Message = { from: 'user' | 'buddy'; text: string }

function toTurns(messages: Message[]): BuddyChatTurn[] {
  return messages.map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', text: m.text }))
}

export function BuddyChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { from: 'buddy', text: 'Hi! Tap the box below and say something to me.' }
  ])
  const [draft, setDraft] = useState('')
  const [waiting, setWaiting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, waiting])

  async function send(): Promise<void> {
    const text = draft.trim()
    if (!text || waiting) return
    const next: Message[] = [...messages, { from: 'user', text }]
    setMessages(next)
    setDraft('')
    setWaiting(true)
    try {
      const result = await window.launcher.buddyChat(toTurns(next))
      setMessages((prev) => [...prev, { from: 'buddy', text: result.reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { from: 'buddy', text: "I'm having a little trouble hearing you right now. Let's try again in a bit." }
      ])
    } finally {
      setWaiting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zLayers.buddyChat,
        background: 'rgba(46,46,44,.35)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 48
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxWidth: '100%',
          maxHeight: '70vh',
          boxSizing: 'border-box',
          borderRadius: 32,
          background: 'linear-gradient(180deg, var(--s1,#FBFAF7), var(--s2,#ECEAE5))',
          boxShadow: 'inset 0 3px 1px var(--hl,#fff), 0 30px 60px rgba(var(--sh,60,55,45),.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px', borderBottom: '1px solid var(--s3,#E8E6E1)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22
            }}
          >
            🐾
          </div>
          <div style={{ fontSize: 'calc(22px * var(--font-scale, 1))', fontWeight: 700, color: 'var(--ink,#2E2E2C)' }}>
            Buddy
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--ink2,#5E5D59)'
            }}
          >
            ✕
          </button>
        </div>

        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.from === 'buddy' ? 'flex-start' : 'flex-end',
                maxWidth: '80%',
                padding: '12px 18px',
                borderRadius: 18,
                fontSize: 'calc(18px * var(--font-scale, 1))',
                background: m.from === 'buddy' ? 'var(--s3,#E8E6E1)' : 'linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4))',
                color: m.from === 'buddy' ? 'var(--ink,#2E2E2C)' : 'var(--ai,#1F5A45)'
              }}
            >
              {m.text}
            </div>
          ))}
          {waiting && (
            <div
              aria-live="polite"
              style={{
                alignSelf: 'flex-start',
                padding: '12px 18px',
                borderRadius: 18,
                fontSize: 'calc(18px * var(--font-scale, 1))',
                background: 'var(--s3,#E8E6E1)',
                color: 'var(--ink2,#5E5D59)',
                fontStyle: 'italic'
              }}
            >
              Buddy is thinking…
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, padding: 20, borderTop: '1px solid var(--s3,#E8E6E1)' }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="Say something..."
            style={{
              flex: 1,
              fontSize: 'calc(18px * var(--font-scale, 1))',
              padding: '12px 18px',
              borderRadius: 999,
              border: '1px solid var(--s3,#E8E6E1)',
              background: 'var(--s1,#FBFAF7)',
              color: 'var(--ink,#2E2E2C)'
            }}
          />
          <button
            onClick={() => void send()}
            disabled={waiting}
            style={{
              opacity: waiting ? 0.6 : 1,
              fontSize: 'calc(18px * var(--font-scale, 1))',
              fontWeight: 700,
              padding: '12px 24px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4))',
              color: 'var(--ai,#1F5A45)'
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
