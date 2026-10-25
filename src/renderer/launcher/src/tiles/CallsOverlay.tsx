import { useEffect, useRef, useState } from 'react'
import type { WhatsAppCallState, WhatsAppCommand } from '@shared/whatsAppCalls'
import { zLayers } from '@shared/zLayers'
import { ContactPicture } from '../contacts/ContactButton'
import { tilesInHome } from '@shared/homeLayout'
import type { BuiltinViewProps } from './builtins'

/** A small, trusted surface; the remote account and chats remain out of sight. */
export function CallsOverlay({ onClose, config }: BuiltinViewProps) {
  const [state, setState] = useState<WhatsAppCallState | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const dialog = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const leaving = useRef(false)
  const call = state?.call
  const name = call?.contact?.name ?? 'Someone'

  useEffect(() => {
    let live = true
    const off = window.launcher.onWhatsAppChanged((next) => {
      if (live) setState(next)
    })
    window.launcher.prepareWhatsApp().then(
      (next) => {
        if (live) setState(next)
      },
      () => {
        if (live) setProblem('Calls are unavailable. Please ask your family for help.')
      }
    )
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const keyboard = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const buttons = [
        ...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      ]
      if (!buttons.length) return
      event.preventDefault()
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
    }
    window.addEventListener('keydown', keyboard)
    return () => {
      live = false
      off()
      window.removeEventListener('keydown', keyboard)
      previous?.focus()
    }
  }, [])

  async function command(value: WhatsAppCommand): Promise<void> {
    setBusy(true)
    setProblem('')
    try {
      const result = await window.launcher.controlWhatsApp(value)
      setState(result.state)
      if (!result.ok) setProblem('call-unconfirmed')
    } catch {
      setProblem('call-unconfirmed')
    } finally {
      setBusy(false)
    }
  }
  async function end(home = false): Promise<void> {
    if (leaving.current) return
    leaving.current = true
    setBusy(true)
    setProblem('')
    try {
      setState(await window.launcher.closeWhatsAppCalls())
      if (home) {
        onClose()
        if (
          tilesInHome(config.display.homeLayout, config.tiles).some(
            (tile) => tile.type === 'builtin' && tile.builtinKey === 'calls'
          )
        )
          void window.launcher.prepareWhatsApp().catch(() => {})
      } else setState(await window.launcher.prepareWhatsApp())
    } catch {
      setProblem('Please ask your family for help ending the call.')
    } finally {
      leaving.current = false
      setBusy(false)
    }
  }
  const title = !call
    ? 'Call your family'
    : call.phase === 'incoming'
      ? `${name} is calling`
      : call.phase === 'connected'
        ? `Talking with ${name}`
        : call.phase === 'ending'
          ? 'Ending the call…'
          : call.phase === 'unknown'
            ? 'Please end this call'
            : `Calling ${name}…`
  const detail = call
    ? call.phase === 'connected'
      ? 'You can talk now.'
      : call.phase === 'incoming'
        ? call.contact && call.mode === 'voice'
          ? 'Press Answer to talk.'
          : 'This call cannot be answered here.'
        : call.phase === 'unknown'
          ? 'We cannot check whether the call is still connected.'
          : 'Please wait a moment.'
    : !state
      ? 'Getting calls ready…'
      : state.connection !== 'ready'
        ? 'Calls are unavailable. Please ask your family for help.'
        : !state.contacts.length
          ? 'Please ask your family to add a contact.'
          : 'Choose who you would like to talk to.'
  return (
    <div
      className="contact-backdrop"
      data-contact-control
      style={{ position: 'fixed', zIndex: zLayers.activeCall }}
    >
      <section
        ref={dialog}
        className="contact-dialog call-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Family calls"
      >
        <ContactPicture />
        <div role="status" aria-live="polite" aria-atomic="true">
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
        <div className="contact-actions">
          {!call &&
            state?.contacts.map((contact) => (
              <button
                key={contact.id}
                className="contact-home call-start"
                disabled={busy || !state.availableActions.includes('voice')}
                onClick={() =>
                  void command({ type: 'start', contactId: contact.id, mode: 'voice' })
                }
              >
                Call {contact.name}
              </button>
            ))}
          {call && state?.availableActions.includes('answer') && (
            <button
              className="contact-home call-start"
              disabled={busy}
              onClick={() => void command({ type: 'answer', callId: call.id })}
            >
              Answer
            </button>
          )}
          {call && (
            <button className="contact-home call-end" onClick={() => void end()}>
              {call.phase === 'incoming' ? 'No, thank you' : 'End call'}
            </button>
          )}
          <button
            ref={closeButton}
            className="contact-home"
            onClick={() => (call || state?.pending ? void end(true) : onClose())}
          >
            {call ? 'End call and go Home' : 'Back to Home'}
          </button>
        </div>
        {problem && (
          <p role="alert">
            {problem === 'call-unconfirmed'
              ? call
                ? 'The call could not be confirmed. Press End call before trying again.'
                : 'The call could not be started. Go Back to Home, then open Family calls to try again.'
              : problem}
          </p>
        )}
      </section>
    </div>
  )
}
