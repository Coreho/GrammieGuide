import { useEffect, useState } from 'react'
import { useConfigStore } from '../state/useConfigStore'

const MODELS: { id: string; label: string }[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 - fastest, lowest cost (recommended)' },
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

  useEffect(() => {
    window.admin.hasApiKey().then(setHasKey)
  }, [])

  if (!config) return null
  const { buddy } = config
  const models = MODELS.some((m) => m.id === buddy.model) ? MODELS : [...MODELS, { id: buddy.model, label: buddy.model }]

  const saveKey = async (value: string): Promise<void> => {
    await window.admin.setApiKey(value)
    setHasKey(await window.admin.hasApiKey())
    setKeyDraft('')
    setStatus(value ? 'API key saved.' : 'API key removed - Buddy will say chatting is not set up yet.')
  }

  return (
    <div>
      <h2>Buddy (AI companion)</h2>

      <h3>Anthropic API key</h3>
      <p>
        Status: {hasKey === null ? '…' : hasKey ? 'A key is set.' : 'No key set - Buddy cannot chat yet.'}
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
      <select value={buddy.model} onChange={(e) => save({ buddy: { ...buddy, model: e.target.value } })}>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      <h3>Chattiness</h3>
      <p>Whether Buddy ever speaks up on its own. Off means Buddy only talks when tapped.</p>
      <select
        value={buddy.chattiness}
        onChange={(e) => save({ buddy: { ...buddy, chattiness: e.target.value as typeof buddy.chattiness } })}
      >
        <option value="off">Off (recommended)</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
      </select>
    </div>
  )
}
