import { useEffect, useState, type FormEvent } from 'react'
import {
  defaultContactSetup,
  MAX_CONTACTS,
  type AdminContactSetup,
  type ContactPerson,
  type ContactCredentials
} from '@shared/contactSettings'
import { TilePhotoPicker } from './TilePhotoPicker'
import { useConfigStore } from '../state/useConfigStore'
import { WhatsAppControlsPanel } from './WhatsAppControls'
import './ContactsTab.css'

const emptyPerson = (id: ContactPerson['id']): ContactPerson => ({ id, name: '', phone: '' })
const emptyCredentials = (): ContactCredentials => ({
  accountSid: '',
  apiKeySid: '',
  apiKeySecret: '',
  sender: ''
})

export function ContactsTab() {
  const [settings, setSettings] = useState<AdminContactSetup>({
    ...defaultContactSetup(),
    hasCredentials: false
  })
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Loading contact settings…')
  const [credentials, setCredentials] = useState(emptyCredentials)
  const loadConfig = useConfigStore((s) => s.load)
  useEffect(() => {
    let live = true
    window.admin.getContactSettings().then(
      (result) => {
        if (live) {
          setSettings(result)
          setReady(true)
          setMessage('')
        }
      },
      () => {
        if (live) setMessage('Contact settings could not be loaded. Reopen Contacts to try again.')
      }
    )
    return () => {
      live = false
    }
  }, [])

  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true)
    setMessage('Saving…')
    try {
      await work()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save. Try again.')
    } finally {
      setBusy(false)
    }
  }
  function move(index: number, direction: number): void {
    const people = [...settings.people]
    ;[people[index], people[index + direction]] = [people[index + direction]!, people[index]!]
    setSettings({ ...settings, people })
  }
  function saveSettings(event: FormEvent): void {
    event.preventDefault()
    void run(async () => {
      const { hasCredentials: _hasCredentials, ...value } = settings
      setSettings(await window.admin.saveContactSettings(value))
      await loadConfig()
      setMessage('Contact settings saved. No text was sent.')
    })
  }
  function saveCredentials(event: FormEvent): void {
    event.preventDefault()
    void run(async () => {
      await window.admin.setContactCredentials({
        ...credentials,
        messagingServiceSid: credentials.messagingServiceSid || undefined
      })
      setCredentials(emptyCredentials())
      setSettings((value) => ({ ...value, hasCredentials: true }))
      setMessage('SMS credentials saved. No text was sent.')
    })
  }
  return (
    <div className="contacts-admin">
      <h2>Contacts</h2>
      <p>
        Manage the people she can call from Family calls. Choose familiar names and photos so she
        can easily recognize everyone.
      </p>
      {ready && settings.enabled && !settings.hasCredentials && (
        <p>
          SMS credentials are not set. Add them under SMS credentials below before using callback
          requests.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <form onSubmit={saveSettings}>
        <fieldset disabled={!ready || busy}>
          <legend>
            Family contacts ({settings.people.length}/{MAX_CONTACTS})
          </legend>
          <p>
            Add up to six people. This order is used on Family calls. Callback requests go to the
            first person, then the second person if needed. Everyone on this list can call her;
            other callers cannot be answered here.
          </p>
          {settings.people.map((person, index) => (
            <div className="contact-editor" key={person.id}>
              <PersonEditor
                title={`Person ${index + 1}`}
                person={person}
                onChange={(updated) =>
                  setSettings({
                    ...settings,
                    people: settings.people.map((item) => (item.id === person.id ? updated : item))
                  })
                }
              />
              <div role="group" aria-label={`Manage ${person.name || `person ${index + 1}`}`}>
                <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                  Move up
                </button>
                <button
                  type="button"
                  disabled={index === settings.people.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const people = settings.people.filter((item) => item.id !== person.id)
                    setSettings({
                      ...settings,
                      people,
                      enabled: settings.enabled && people.length > 0
                    })
                  }}
                >
                  Remove person
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={settings.people.length >= MAX_CONTACTS}
            onClick={() =>
              setSettings({
                ...settings,
                people: [...settings.people, emptyPerson(crypto.randomUUID())]
              })
            }
          >
            Add person
          </button>
          <h3>Callback requests</h3>
          <p>
            The optional Home button sends a text asking the first person to call her back, then
            tries the second person if needed. It does not start a live call or guarantee a reply.
          </p>
          <label className="contacts-check">
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={!settings.people.length}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
            />
            Show the callback button on Home
          </label>
          <label>
            Minutes to wait before trying the fallback
            <input
              aria-label="Fallback wait in minutes"
              type="number"
              min={1}
              max={30}
              value={settings.fallbackAfterMinutes}
              onChange={(e) =>
                setSettings({ ...settings, fallbackAfterMinutes: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Minutes until a new request is allowed
            <input
              aria-label="Request expiry in minutes"
              type="number"
              min={2}
              max={60}
              value={settings.expiryMinutes}
              onChange={(e) => setSettings({ ...settings, expiryMinutes: Number(e.target.value) })}
            />
          </label>
          <p>
            Repeated taps show the same request until it expires. An unanswered or unconfirmed
            request will point her to the telephone. Contact settings stay fixed while a request is
            active.
          </p>
          <button type="submit">Save contact settings</button>
        </fieldset>
      </form>
      <WhatsAppControlsPanel />
      <details className="contacts-credentials">
        <summary>SMS credentials</summary>
        <p>
          {settings.hasCredentials
            ? 'Credentials are saved on this computer.'
            : 'SMS credentials have not been set.'}{' '}
          Saved credential values are never displayed.
        </p>
        <p>
          Use a registered Twilio SMS sender and an API key with messaging access. A messaging
          service must have a sender that can receive YES replies. Saving these fields does not test
          delivery.
        </p>
        <form onSubmit={saveCredentials} autoComplete="off">
          <fieldset disabled={!ready || busy}>
            <legend>Replace SMS credentials</legend>
            {(
              [
                ['accountSid', 'Twilio Account SID'],
                ['apiKeySid', 'Twilio API Key SID'],
                ['apiKeySecret', 'Twilio API key secret'],
                ['sender', 'Twilio sender number'],
                ['messagingServiceSid', 'Messaging Service SID (optional)']
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="password"
                  autoComplete="new-password"
                  required={key !== 'messagingServiceSid'}
                  value={credentials[key] ?? ''}
                  onChange={(e) => setCredentials({ ...credentials, [key]: e.target.value })}
                />
              </label>
            ))}
            <button type="submit">Save SMS credentials</button>
            <button
              type="button"
              disabled={!settings.hasCredentials}
              onClick={() =>
                void run(async () => {
                  await window.admin.setContactCredentials(null)
                  setCredentials(emptyCredentials())
                  setSettings((value) => ({ ...value, hasCredentials: false }))
                  setMessage('SMS credentials removed.')
                })
              }
            >
              Remove SMS credentials
            </button>
          </fieldset>
        </form>
      </details>
      <p>
        This is a callback request feature, not an emergency service. Complete sender registration
        and verify delivery and YES replies before relying on it.
      </p>
    </div>
  )
}

function PersonEditor({
  title,
  person,
  onChange
}: {
  title: string
  person: ContactPerson
  onChange: (person: ContactPerson) => void
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      <p>Use a short familiar name, up to 12 characters, so it stays readable on Home.</p>
      <label>
        {title} name
        <input
          maxLength={12}
          required
          value={person.name}
          onChange={(e) => onChange({ ...person, name: e.target.value })}
        />
      </label>
      <label>
        {title} phone number
        <input
          type="tel"
          placeholder="+15551234567"
          required
          value={person.phone}
          onChange={(e) => onChange({ ...person, phone: e.target.value })}
        />
      </label>
      <p>
        Use the full international number, including + and the country code. Get this person's
        permission to receive callback texts.
      </p>
      <TilePhotoPicker
        label={`${title} photo`}
        photoId={person.photoId}
        onChange={(photoId) => onChange({ ...person, photoId })}
      />
    </fieldset>
  )
}
