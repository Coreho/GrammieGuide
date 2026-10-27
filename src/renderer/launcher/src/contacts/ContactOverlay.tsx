import { useEffect, useRef } from 'react'
import type { HomeContactState } from '@shared/contacts'
import { contactMessage } from '@shared/contactMessage'
import { zLayers } from '@shared/zLayers'
import { ContactPicture } from './ContactButton'

export function ContactOverlay({
  state,
  busy,
  now,
  onClose,
  onStopMusic
}: {
  state: HomeContactState | null
  busy: boolean
  now: number
  onClose: () => void
  onStopMusic?: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const message = contactMessage(state, busy, now)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const buttons = [...(closeRef.current?.parentElement?.querySelectorAll('button') ?? [])]
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [onClose])
  return (
    <div className="contact-backdrop" data-contact-control style={{ zIndex: zLayers.helpOverlay }}>
      <section
        className="contact-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Callback request"
      >
        <ContactPicture key={message.photoUrl ?? 'phone'} url={message.photoUrl} />
        <div role="status" aria-live="polite" aria-atomic="true">
          <h1>{message.title}</h1>
          <p>{message.detail}</p>
        </div>
        <div className="contact-actions">
          <button ref={closeRef} className="contact-home" onClick={onClose}>
            Back to Home
          </button>
          {onStopMusic && (
            <button className="contact-home" onClick={onStopMusic}>
              Stop music
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
