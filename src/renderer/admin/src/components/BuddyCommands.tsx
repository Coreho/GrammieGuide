import { useState } from 'react'
import { BUDDY_CLIPS, type BuddyCommand, type ClipName } from '@shared/buddy/commands'
import { useConfigStore } from '../state/useConfigStore'
import type { PublicConfig } from '@shared/configSchema'

export function BuddyCommands() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [text, setText] = useState('')
  const [clip, setClip] = useState<ClipName>('talk')
  const [readAloud, setReadAloud] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  if (!config) return null

  async function send(command: BuddyCommand): Promise<void> {
    try {
      const result = await window.admin.commandBuddy(command)
      setStatus(
        result.ok
          ? 'Command sent. Buddy responds on Home when not chatting.'
          : 'Could not send the command. Try again on Home.'
      )
    } catch {
      setStatus('Could not send the command. Unlock the caregiver panel and try again.')
    }
  }

  async function saveMessages(messages: PublicConfig['buddy']['quickMessages']): Promise<void> {
    setBusy(true)
    try {
      // Read the latest settings so a voice change is never overwritten by a saved message.
      const latest = useConfigStore.getState().config!
      await save({ buddy: { ...latest.buddy, quickMessages: messages } })
      setStatus('Quick messages saved.')
    } catch {
      setStatus('Could not save quick messages. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="Command Buddy"
      style={{ marginTop: 32, borderTop: '1px solid #ccc', paddingTop: 16 }}
    >
      <h3>Command Buddy</h3>
      <p>
        Open Home to see him respond. Commands are ignored while she is chatting, and work at night
        too.
      </p>
      <div
        role="group"
        aria-label="Animations"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      >
        <button onClick={() => void send({ walk: true })}>Take a walk</button>
        {BUDDY_CLIPS.map((name) => (
          <button key={name} onClick={() => void send({ clip: name })}>
            {name.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send({ text: text.trim(), clip, speak: readAloud })
        }}
        style={{ display: 'grid', gap: 12, marginTop: 20 }}
      >
        <label>
          Say this{' '}
          <textarea
            required
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </label>
        <label>
          Gesture{' '}
          <select
            aria-label="Gesture"
            value={clip}
            onChange={(e) => setClip(e.target.value as ClipName)}
          >
            {BUDDY_CLIPS.map((name) => (
              <option key={name} value={name}>
                {name.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={readAloud}
            onChange={(e) => setReadAloud(e.target.checked)}
          />{' '}
          Read this message aloud
        </label>
        <div>
          <button disabled={!text.trim()} type="submit">
            Say it now
          </button>{' '}
          <button
            type="button"
            disabled={busy || !text.trim() || config.buddy.quickMessages.length >= 50}
            onClick={() =>
              void saveMessages([
                ...config.buddy.quickMessages,
                { id: crypto.randomUUID(), text: text.trim(), clip, speak: readAloud }
              ])
            }
          >
            Save quick message
          </button>
        </div>
      </form>
      <h4>Quick messages</h4>
      {config.buddy.quickMessages.length === 0 && <p>No saved messages yet.</p>}
      <ul>
        {config.buddy.quickMessages.map((message) => (
          <li key={message.id} style={{ marginBottom: 12, overflowWrap: 'anywhere' }}>
            <span>{message.text}</span>{' '}
            <button
              onClick={() =>
                void send({ text: message.text, clip: message.clip, speak: message.speak })
              }
            >
              Say message
            </button>{' '}
            <button
              disabled={busy}
              onClick={() =>
                void saveMessages(config.buddy.quickMessages.filter((m) => m.id !== message.id))
              }
            >
              Remove message
            </button>
          </li>
        ))}
      </ul>
      {status && <p role="status">{status}</p>}
    </section>
  )
}
