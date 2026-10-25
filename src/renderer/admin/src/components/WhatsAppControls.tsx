import { useEffect, useState } from 'react'
import type { WhatsAppCallState, WhatsAppCommand } from '@shared/whatsAppCalls'

/** One control surface for observed state; it has no authority to choose destinations or call status. */
export function WhatsAppControls({
  state,
  busy,
  onCommand
}: {
  state: WhatsAppCallState
  busy: boolean
  onCommand: (command: WhatsAppCommand) => void
}) {
  const call = state.call
  const name = call?.contact?.name ?? 'Someone'
  let status = 'Ready for a WhatsApp call.'
  if (call) {
    switch (call.phase) {
      case 'starting':
        status = `Starting a call to ${name}…`
        break
      case 'outgoing':
        status = `Calling ${name}…`
        break
      case 'incoming':
        status = `${name} is calling`
        break
      case 'connecting':
        status = `Connecting with ${name}…`
        break
      case 'connected':
        status = `Talking with ${name}`
        break
      case 'unknown':
        status = 'The call may still be active. Its status cannot be confirmed.'
        break
    }
  } else if (state.connection === 'unavailable') status = 'Live calling is not available yet.'
  else if (state.connection === 'not-linked') status = 'Link WhatsApp before making a call.'
  else if (state.connection === 'disconnected')
    status = 'WhatsApp is disconnected. No call can be started.'
  else if (!state.contacts.length) status = 'Save a family contact below before making a call.'

  const allowed = (action: (typeof state.availableActions)[number]): boolean =>
    !busy && !state.pending && state.availableActions.includes(action)

  return (
    <div>
      <p role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>
      {!call &&
        state.contacts.map((contact) => (
          <div key={contact.id} role="group" aria-label={`WhatsApp calls to ${contact.name}`}>
            <button
              type="button"
              disabled={!allowed('voice')}
              onClick={() => onCommand({ type: 'start', contactId: contact.id, mode: 'voice' })}
            >
              Voice call {contact.name}
            </button>
            <button
              type="button"
              disabled={!allowed('video')}
              onClick={() => onCommand({ type: 'start', contactId: contact.id, mode: 'video' })}
            >
              Video call {contact.name}
            </button>
          </div>
        ))}
      {call &&
        state.availableActions
          .filter((action) => action !== 'voice' && action !== 'video')
          .map((action) => (
            <button
              key={action}
              type="button"
              disabled={!allowed(action)}
              onClick={() => onCommand({ type: action, callId: call.id })}
            >
              {{ answer: 'Answer', decline: 'Decline', end: 'End call' }[action]}
            </button>
          ))}
      {state.pending && <p>Waiting for WhatsApp to confirm…</p>}
    </div>
  )
}

export function WhatsAppControlsPanel() {
  const [state, setState] = useState<WhatsAppCallState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let live = true
    const update = (next: WhatsAppCallState): void => {
      if (live) setState(next)
    }
    const off = window.admin.onWhatsAppChanged(update)
    window.admin.getWhatsAppState().then(update, () => {
      if (live) setMessage('Call status could not be checked. Try Refresh status.')
    })
    return () => {
      live = false
      off()
    }
  }, [])

  async function refresh(): Promise<void> {
    setBusy(true)
    try {
      setState(await window.admin.getWhatsAppState())
      setMessage('')
    } catch {
      setMessage('Call status could not be checked. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function command(value: WhatsAppCommand): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      const result = await window.admin.controlWhatsApp(value)
      setState(result.state)
      if (!result.ok)
        setMessage(
          result.problem === 'unconfirmed'
            ? 'WhatsApp did not confirm the action. Check the call before trying again.'
            : 'That call control is unavailable. Refresh status to check it.'
        )
    } catch {
      setMessage('The action could not be confirmed. Check the call status before trying again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset>
      <legend>WhatsApp call controls</legend>
      <p>
        Calls must stay inside GrammieGuide. The control interface is installed, but its WhatsApp
        connection still needs verification. Calls are disabled until then. Linking the Windows
        WhatsApp app does not link the in-app session.
      </p>
      {state && (
        <WhatsAppControls
          state={state}
          busy={busy}
          onCommand={(value) => {
            void command(value)
          }}
        />
      )}
      {message && <p role="alert">{message}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void refresh()
        }}
      >
        Refresh status
      </button>
    </fieldset>
  )
}
