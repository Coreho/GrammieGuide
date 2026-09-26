import { useEffect, useRef, useState } from 'react'
import { zLayers } from '@shared/zLayers'
import type { BuddyChatTurn } from '@shared/ipcContract'
import type { ChatPhase } from '@shared/buddy/buddyMachine'
import { speak, stopSpeaking } from './speech'

/**
 * Tap-to-greet chat with Buddy. Replies come from the main process
 * (buddy:chat), which owns the API key and always returns a calm,
 * showable line - even on failure - so this panel never renders error
 * text of its own. Deliberately styled nothing like HelpOverlay (different
 * icon, different accent color, different tone) so the two are never
 * visually confusable.
 *
 * Since M4 it lives inside the Home stage (not over the whole window) and
 * sits to the left, so Buddy can stand beside it above the dimmed backdrop
 * and visibly listen, think and talk; `onPhaseChange` is how he knows which.
 * She can talk instead of typing (the Talk button, Windows' offline
 * recognizer) and, if the caregiver leaves it on, hears his replies.
 */
type Message = { from: 'user' | 'buddy'; text: string }

const GREETING = "Hi! It's nice to see you. What would you like to talk about?"
const LINES = {
  notHeard: "I didn't quite catch that. You can tap Talk and try again, or type it below.",
  noMic: "I can't hear through the microphone right now. You can type to me instead.",
  trouble: "I'm having a little trouble hearing you right now. Let's try again in a bit."
}

function toTurns(messages: Message[]): BuddyChatTurn[] {
  return messages.map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', text: m.text }))
}

/** Without a voice he still "talks" on screen, for about as long as reading the line takes. */
function silentTalkMs(text: string): number {
  return Math.min(8000, 1200 + text.length * 55)
}

export function BuddyChatPanel({
  onClose,
  onPhaseChange,
  voiceEnabled
}: {
  onClose: () => void
  onPhaseChange: (phase: ChatPhase) => void
  voiceEnabled: boolean
}) {
  const [messages, setMessages] = useState<Message[]>([{ from: 'buddy', text: GREETING }])
  const [draft, setDraft] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [hearing, setHearing] = useState(false)
  const [micAvailable, setMicAvailable] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const open = useRef(true)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const phaseRef = useRef(onPhaseChange)
  phaseRef.current = onPhaseChange
  const voiceRef = useRef(voiceEnabled)
  voiceRef.current = voiceEnabled
  // Each phase change bumps this, so a line that finishes after she has
  // already moved on (sent something, tapped Talk) can't reset the phase.
  const phaseGen = useRef(0)

  function setPhase(phase: ChatPhase): number {
    phaseGen.current++
    phaseRef.current(phase)
    return phaseGen.current
  }

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, waiting, hearing])

  useEffect(() => {
    open.current = true
    window.launcher
      .buddyCanListen()
      .then((ok) => open.current && setMicAvailable(ok))
      .catch(() => undefined)
    void voice(GREETING)
    return () => {
      open.current = false
      stopSpeaking()
      phaseRef.current('idle')
    }
    // Greets once per opening; voice() reads its settings through refs.
  }, [])

  /** Buddy says a line: reads it aloud if allowed, and he gestures while it lasts. */
  async function voice(text: string): Promise<void> {
    const mine = setPhase('speaking')
    if (voiceRef.current) {
      await speak(text)
    } else {
      await new Promise((resolve) => setTimeout(resolve, silentTalkMs(text)))
    }
    if (open.current && phaseGen.current === mine) setPhase('idle')
  }

  function say(text: string): void {
    setMessages((prev) => [...prev, { from: 'buddy', text }])
    void voice(text)
  }

  async function sendText(raw: string): Promise<void> {
    const text = raw.trim()
    if (!text || waiting) return
    stopSpeaking()
    const next: Message[] = [...messagesRef.current, { from: 'user', text }]
    setMessages(next)
    setDraft('')
    setWaiting(true)
    setPhase('thinking')
    let reply: string
    try {
      reply = (await window.launcher.buddyChat(toTurns(next))).reply
    } catch {
      reply = LINES.trouble
    }
    if (!open.current) return
    setWaiting(false)
    say(reply)
  }

  async function listen(): Promise<void> {
    if (waiting || hearing) return
    stopSpeaking()
    setHearing(true)
    setPhase('hearing')
    let result: Awaited<ReturnType<typeof window.launcher.buddyListen>>
    try {
      result = await window.launcher.buddyListen()
    } catch {
      result = { ok: false, reason: 'unavailable' }
    }
    if (!open.current) return
    setHearing(false)
    setPhase('idle')
    if (result.ok) {
      await sendText(result.text)
    } else if (result.reason === 'no-mic') {
      setMicAvailable(false)
      say(LINES.noMic)
    } else {
      say(LINES.notHeard)
    }
  }

  const busy = waiting || hearing
  const bigText = 'calc(18px * var(--font-scale, 1))'
  const accent = 'linear-gradient(180deg, var(--a1,#A6EBD0), var(--a2,#7FD6B4))'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: zLayers.buddyChat,
        background: 'rgba(46,46,44,.35)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        padding: '0 0 22px 64px'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 800,
          maxHeight: 620,
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
              background: accent,
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
                fontSize: bigText,
                background: m.from === 'buddy' ? 'var(--s3,#E8E6E1)' : accent,
                color: m.from === 'buddy' ? 'var(--ink,#2E2E2C)' : 'var(--ai,#1F5A45)'
              }}
            >
              {m.text}
            </div>
          ))}
          {(waiting || hearing) && (
            <div
              aria-live="polite"
              style={{
                alignSelf: hearing ? 'flex-end' : 'flex-start',
                padding: '12px 18px',
                borderRadius: 18,
                fontSize: bigText,
                background: 'var(--s3,#E8E6E1)',
                color: 'var(--ink2,#5E5D59)',
                fontStyle: 'italic'
              }}
            >
              {hearing ? "I'm listening… go ahead and talk." : 'Buddy is thinking…'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, padding: 20, borderTop: '1px solid var(--s3,#E8E6E1)' }}>
          {micAvailable && (
            <button
              onClick={() => void listen()}
              disabled={busy}
              aria-label="Talk to Buddy out loud"
              style={{
                opacity: busy && !hearing ? 0.6 : 1,
                fontSize: bigText,
                fontWeight: 700,
                padding: '12px 22px',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: hearing ? 'linear-gradient(180deg,#F3B8A6,#E48E78)' : accent,
                color: hearing ? '#5A2418' : 'var(--ai,#1F5A45)'
              }}
            >
              {hearing ? '🎤 Listening…' : '🎤 Talk'}
            </button>
          )}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendText(draft)}
            placeholder="Say something..."
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: bigText,
              padding: '12px 18px',
              borderRadius: 999,
              border: '1px solid var(--s3,#E8E6E1)',
              background: 'var(--s1,#FBFAF7)',
              color: 'var(--ink,#2E2E2C)'
            }}
          />
          <button
            onClick={() => void sendText(draft)}
            disabled={busy}
            style={{
              opacity: busy ? 0.6 : 1,
              fontSize: bigText,
              fontWeight: 700,
              padding: '12px 24px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: accent,
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
