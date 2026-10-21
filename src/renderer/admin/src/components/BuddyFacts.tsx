import { useState } from 'react'
import { useConfigStore } from '../state/useConfigStore'
import { personalFactSchema, type PersonalFact } from '@shared/buddy/personalFacts'

const KINDS = {
  family: 'Family',
  home: 'Home',
  routine: 'Routine',
  favorite: 'Favorite things',
  plan: 'Plan or appointment'
}
const blank = (): PersonalFact & { date: string } => ({
  id: crypto.randomUUID(),
  kind: 'family',
  text: '',
  date: '',
  cancelled: false
})

export function BuddyFacts() {
  const config = useConfigStore((s) => s.config)
  const save = useConfigStore((s) => s.save)
  const [draft, setDraft] = useState(blank)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  if (!config) return null
  const facts = config.buddy.personalFacts
  const persist = async (next: PersonalFact[]): Promise<boolean> => {
    setBusy(true)
    try {
      await save({ buddy: { ...config.buddy, personalFacts: next } })
      setStatus('Saved. Buddy uses these details from his next reply.')
      return true
    } catch {
      setStatus('These details could not be saved. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const submit = async (): Promise<void> => {
    const parsed = personalFactSchema.safeParse({
      ...draft,
      date: draft.kind === 'plan' ? draft.date : undefined,
      cancelled: draft.kind === 'plan' && draft.cancelled
    })
    if (!parsed.success) {
      setStatus('Add a detail (up to 500 characters) and a valid date for a plan.')
      return
    }
    const next = editing
      ? facts.map((f) => (f.id === draft.id ? parsed.data : f))
      : [...facts, parsed.data]
    if (await persist(next)) {
      setDraft(blank())
      setEditing(false)
    }
  }
  return (
    <section aria-label="Buddy personal facts">
      <h3>Personal facts and plans</h3>
      <p>
        Only add details you want Buddy to use. These details are sent to the selected chat provider
        when she chats, and are included in settings backups. They are never added to the activity
        log.
      </p>
      <p>
        Plans stay available through their saved date in this computer&apos;s local time zone (
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). Cancel or remove a plan when it
        changes. A saved plan is not a promise that it will happen.
      </p>
      <ul>
        {facts.map((fact) => (
          <li key={fact.id} style={{ marginBottom: 12 }}>
            <strong>{KINDS[fact.kind]}: </strong>
            {fact.text}
            {fact.kind === 'plan' && (
              <>
                {' '}
                — {fact.date}
                {fact.cancelled ? ' (cancelled)' : ''}
              </>
            )}{' '}
            <button
              disabled={busy}
              onClick={() => {
                setDraft({ ...fact, date: fact.date ?? '' })
                setEditing(true)
                setStatus('')
              }}
              aria-label={`Edit fact: ${fact.text}`}
            >
              Edit
            </button>{' '}
            <button
              disabled={busy}
              onClick={() => void persist(facts.filter((f) => f.id !== fact.id))}
              aria-label={`Remove fact: ${fact.text}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <fieldset disabled={busy} style={{ display: 'grid', gap: 12 }}>
          <legend>{editing ? 'Edit personal detail' : 'Add a personal detail'}</legend>
          <label>
            Detail type{' '}
            <select
              value={draft.kind}
              onChange={(event) =>
                setDraft({ ...draft, kind: event.target.value as PersonalFact['kind'] })
              }
            >
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="buddy-personal-detail">Personal detail</label>
          <textarea
            id="buddy-personal-detail"
            maxLength={500}
            rows={3}
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          />
          {draft.kind === 'plan' && (
            <>
              <label>
                Plan date{' '}
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.cancelled}
                  onChange={(event) => setDraft({ ...draft, cancelled: event.target.checked })}
                />{' '}
                Plan cancelled
              </label>
            </>
          )}
          <div>
            <button type="submit" disabled={!editing && facts.length >= 50}>
              {editing ? 'Save personal detail' : 'Add personal detail'}
            </button>{' '}
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setDraft(blank())
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {facts.length >= 50 && <p>All 50 personal detail spaces are in use.</p>}
      <p role="status">{status}</p>
    </section>
  )
}
