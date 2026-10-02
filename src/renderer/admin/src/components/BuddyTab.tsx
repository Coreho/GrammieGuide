import { useEffect, useState } from 'react'
import { useConfigStore } from '../state/useConfigStore'
import { BuddyCommands } from './BuddyCommands'

// Edge neural voices. Aria first: it's the voice the old app used, so it's the one she knows.
const VOICES: { id: string; label: string }[] = [
  { id: 'en-US-AriaNeural', label: "Aria - warm, clear (the old launcher's voice)" },
  { id: 'en-US-JennyNeural', label: 'Jenny - friendly, soft' },
  { id: 'en-US-EmmaNeural', label: 'Emma - cheerful' },
  { id: 'en-US-AndrewNeural', label: 'Andrew - warm, male' },
  { id: 'en-US-GuyNeural', label: 'Guy - calm, male' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia - British' }
]

const PREVIEW_LINE = "Hi there! It's so nice to see you today."

const MODELS: { id: string; label: string }[] = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 - gentlest with confused statements (recommended)' },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5 - fastest, lowest cost, more likely to play along with confused statements'
  },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 - more thoughtful, slower' },
  { id: 'claude-opus-5', label: 'Claude Opus 5 - most capable, highest cost' }
]

/**
 * The API key field is write-only: the admin renderer can learn whether a
 * key is set (admin:hasApiKey) but never read it back, matching the old
 * app's security model. Saving other Buddy settings can't wipe the key -
 * config:set carries secrets forward (see mergeAdminPatch).
 */
export function BuddyTab() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [status, setStatus] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')

  useEffect(() => {
    window.admin.hasApiKey().then(setHasKey)
  }, [])

  if (!config) return null
  const { buddy } = config
  const models = MODELS.some((m) => m.id === buddy.model)
    ? MODELS
    : [...MODELS, { id: buddy.model, label: buddy.model }]
  const voices = VOICES.some((v) => v.id === buddy.ttsVoice)
    ? VOICES
    : [...VOICES, { id: buddy.ttsVoice, label: buddy.ttsVoice }]
  const saveBuddy = (patch: Partial<typeof buddy>): void =>
    void save({ buddy: { ...buddy, ...patch } })

  const previewVoice = async (): Promise<void> => {
    setVoiceStatus('Playing…')
    const result = await window.admin.previewVoice(PREVIEW_LINE, buddy.ttsVoice)
    if (!result.ok) {
      setVoiceStatus(
        result.reason === 'disabled'
          ? 'The online voice is switched off, so Buddy uses the Windows voice instead.'
          : "Couldn't reach the online voice right now (no internet?). Buddy falls back to the Windows voice."
      )
      return
    }
    const bytes = Uint8Array.from(atob(result.audioBase64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: result.mime }))
    const audio = new Audio(url)
    audio.onended = () => URL.revokeObjectURL(url)
    await audio.play().catch(() => undefined)
    setVoiceStatus('')
  }

  const saveKey = async (value: string): Promise<void> => {
    await window.admin.setApiKey(value)
    setHasKey(await window.admin.hasApiKey())
    setKeyDraft('')
    setStatus(
      value ? 'API key saved.' : 'API key removed - Buddy will say chatting is not set up yet.'
    )
  }

  return (
    <div>
      <h2>Buddy (AI companion)</h2>
      <label>
        <input
          type="checkbox"
          checked={buddy.chatEnabled}
          onChange={(e) => saveBuddy({ chatEnabled: e.target.checked })}
        />
        Allow Buddy chat
      </label>
      <p>
        Turn this off if chatting confuses or upsets her. Buddy stays on Home with friendly tap
        reactions. Changes take effect right away, including closing an open chat.
      </p>
      <h3>Anthropic API key</h3>
      <p>
        Status:{' '}
        {hasKey === null ? '…' : hasKey ? 'A key is set.' : 'No key set - Buddy cannot chat yet.'}
      </p>
      <input
        type="password"
        autoComplete="off"
        placeholder={hasKey ? 'Enter a new key to replace the current one' : 'sk-ant-...'}
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        style={{ width: 420 }}
      />{' '}
      <button onClick={() => saveKey(keyDraft)} disabled={!keyDraft.trim()}>
        Save key
      </button>{' '}
      {hasKey && <button onClick={() => saveKey('')}>Remove key</button>}
      {status && <p>{status}</p>}
      <h3>Model</h3>
      <select
        value={buddy.model}
        onChange={(e) => save({ buddy: { ...buddy, model: e.target.value } })}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <h3>On the Home screen</h3>
      <label>
        When she taps Buddy{' '}
        <select
          value={buddy.tapAction}
          onChange={(e) => saveBuddy({ tapAction: e.target.value as typeof buddy.tapAction })}
        >
          <option value="reaction">
            {buddy.chatEnabled
              ? "A friendly reaction, then a Let's chat button"
              : 'A friendly reaction'}
          </option>
          <option value="chat">
            {buddy.chatEnabled ? 'Open chat right away' : 'A friendly reaction (chat is off)'}
          </option>
        </select>
      </label>
      <br />
      <label>
        How Buddy moves{' '}
        <select
          value={buddy.motion}
          onChange={(e) => saveBuddy({ motion: e.target.value as typeof buddy.motion })}
        >
          <option value="still">Stays put (with his usual gestures)</option>
          <option value="roam">Walks now and then</option>
          <option value="reduced">Reduced motion (fewer, gentler gestures)</option>
        </select>
      </label>
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        Choose by watching what she enjoys and what distracts her. Reduced motion keeps him in place
        with no fidgeting on his own. Changes take effect right away. He never walks over the tiles
        or wanders on his own between 9 PM and 6 AM. You can still ask him to walk or play any
        gesture yourself.
      </p>
      <h3>Voice</h3>
      <label>
        <input
          type="checkbox"
          checked={buddy.voiceEnabled}
          onChange={(e) => saveBuddy({ voiceEnabled: e.target.checked })}
        />
        Read Buddy&apos;s replies out loud
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={buddy.cloudTtsEnabled}
          onChange={(e) => saveBuddy({ cloudTtsEnabled: e.target.checked })}
        />
        Use the natural online voice (needs internet; otherwise the Windows voice is used)
      </label>
      <br />
      <select value={buddy.ttsVoice} onChange={(e) => saveBuddy({ ttsVoice: e.target.value })}>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>{' '}
      <button onClick={() => void previewVoice()}>Try this voice</button>
      {voiceStatus && <p>{voiceStatus}</p>}
      <p style={{ fontSize: '.85rem', color: '#666' }}>
        She can also talk to Buddy instead of typing (the Talk button in the chat), using this
        computer&apos;s microphone. The button only appears when a microphone is found.
      </p>
      <h3>Chattiness</h3>
      <p>
        Whether Buddy ever speaks up on his own, in a speech bubble (never out loud). Off means
        Buddy only talks when tapped.
      </p>
      <select
        value={buddy.chattiness}
        onChange={(e) =>
          save({ buddy: { ...buddy, chattiness: e.target.value as typeof buddy.chattiness } })
        }
      >
        <option value="off">Off (recommended)</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
      </select>
      <BuddyCommands />
    </div>
  )
}
