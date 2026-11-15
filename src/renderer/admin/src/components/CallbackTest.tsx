import { useEffect, useRef, useState } from 'react'
import type { ContactTestState } from '@shared/contacts'
import { contactTestProblem, describeContactTest } from '@shared/contactTest'

const time = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
const MARK = { yes: '✓', no: '✗', waiting: '…', 'not-reached': '–' } as const

/**
 * Sends one real, clearly marked text through the saved credentials and reports what
 * actually came back. Watching only reads the saved request: leaving or reopening this
 * panel never sends anything, and main refuses a second test while one is open.
 */
export function CallbackTest({ refreshKey }: { refreshKey: unknown }) {
  const [state, setState] = useState<ContactTestState | null>(null)
  const [contactId, setContactId] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const live = useRef(true)

  function read(): void {
    window.admin.getContactTest().then(
      (result) => {
        if (!live.current) return
        setState(result)
        setFailed(false)
      },
      () => {
        if (live.current) setFailed(true)
      }
    )
  }

  useEffect(() => {
    live.current = true
    read()
    return () => {
      live.current = false
    }
    // Saved people or credentials changed in the tab above.
  }, [refreshKey])

  const report = state?.test ? describeContactTest(state.test, state.checkedAt, time) : null
  const open = Boolean(report?.open)
  useEffect(() => {
    if (!open) return
    // Main asks Twilio every 10 seconds; this only reads what it has saved.
    const timer = window.setInterval(read, 3000)
    return () => window.clearInterval(timer)
  }, [open])

  const people = state?.people ?? []
  const chosen = people.some((person) => person.id === contactId) ? contactId : people[0]?.id
  const ready = Boolean(state?.hasCredentials && chosen)
  const problem = state ? contactTestProblem(state) : null

  function send(): void {
    if (!chosen) return
    setBusy(true)
    window.admin
      .startContactTest(chosen)
      .then(
        (result) => {
          if (!live.current) return
          setState(result)
          setFailed(false)
        },
        () => {
          if (live.current) setFailed(true)
        }
      )
      .finally(() => {
        if (live.current) setBusy(false)
      })
  }

  return (
    <section className="contacts-test" aria-labelledby="contacts-test-title">
      <h3 id="contacts-test-title">Test a callback text</h3>
      <p>
        Sends one real text, marked TEST, to the person you choose, and shows whether it was sent,
        delivered and answered. Tell them first, and ask them to reply YES. Nothing appears on her
        Home, and this is kept apart from her own requests.
      </p>
      {state && !ready && (
        <p>
          {people.length
            ? 'Save the SMS credentials above before testing.'
            : 'Save at least one person above before testing.'}
        </p>
      )}
      <label>
        Send the test to
        <select
          value={chosen ?? ''}
          disabled={!ready || busy || open}
          onChange={(event) => setContactId(event.target.value)}
        >
          {people.map((person, index) => (
            <option key={person.id} value={person.id}>
              {person.name} ({index === 0 ? 'first person' : 'second person'})
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={!ready || busy || open} onClick={send}>
        {busy ? 'Sending…' : 'Send test text'}
      </button>
      {failed && (
        <p role="alert">
          The test could not be read. Nothing was sent again. Reopen Contacts to check.
        </p>
      )}
      {problem && <p role="alert">{problem}</p>}
      {report && state && (
        <div className="contacts-test-result" role="status" aria-label="Latest test">
          <p>
            <strong>{report.heading}</strong>
          </p>
          <ul>
            {report.steps.map((step) => (
              <li key={step.label} data-state={step.state}>
                <span aria-hidden="true">{MARK[step.state]}</span> <strong>{step.label}:</strong>{' '}
                {step.text}
              </li>
            ))}
          </ul>
          <p>{report.note}</p>
          <p className="contacts-test-checked">Checked at {time(state.checkedAt)}.</p>
        </div>
      )}
    </section>
  )
}
