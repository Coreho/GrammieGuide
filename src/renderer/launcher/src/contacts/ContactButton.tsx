import { useState } from 'react'
import { PhoneIcon } from '../icons'
import { useLabelFit } from '../components/useLabelFit'
import './contacts.css'
import { zLayers } from '@shared/zLayers'

export function ContactPicture({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="contact-picture" aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <PhoneIcon color="currentColor" size={44} />
      )}
    </span>
  )
}

export function ContactButton({
  name,
  photoUrl,
  onClick
}: {
  name: string
  photoUrl?: string
  onClick: () => void
}) {
  const label = `Ask ${name} to call`
  const ref = useLabelFit<HTMLSpanElement>(label, 'contact')
  return (
    <button
      className="contact-button"
      data-contact-control
      aria-label={label}
      onClick={onClick}
      style={{ zIndex: zLayers.contactControl }}
    >
      <ContactPicture key={photoUrl ?? 'phone'} url={photoUrl} />
      <span ref={ref} className="contact-button-label">
        Ask {name} to call
      </span>
    </button>
  )
}
