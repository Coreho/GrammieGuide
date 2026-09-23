import { useState } from 'react'
import type { AdminApi } from '../../../../preload/admin'

declare global {
  interface Window {
    admin: AdminApi
  }
}

/**
 * First-run only: the old app's admin panel had no PIN at all
 * (Ctrl+Shift+A opened it instantly). This is the one-time setup screen
 * that closes that gap before any caregiver settings are reachable.
 */
export function PinSetup({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }
    const result = await window.admin.setPin(pin)
    if (!result.ok) {
      setError(result.reason ?? 'could not set PIN')
      return
    }
    // Setting the PIN does not itself unlock the session - unlock
    // explicitly with the PIN just entered, otherwise every IPC call that
    // requires an unlocked admin session (config:set, etc.) would silently
    // reject right after setup.
    await window.admin.unlock(pin)
    onDone()
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>Set up a caregiver PIN</h1>
      <p>This protects the admin panel - it&apos;s asked for every time this panel opens.</p>
      <input
        type="password"
        inputMode="numeric"
        placeholder="4-8 digit PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        inputMode="numeric"
        placeholder="Confirm PIN"
        value={confirmPin}
        onChange={(e) => setConfirmPin(e.target.value)}
        style={inputStyle}
      />
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      <button onClick={submit} style={buttonStyle}>
        Set PIN
      </button>
    </div>
  )
}

const inputStyle = { display: 'block', width: '100%', padding: 10, marginBottom: 12, fontSize: '1rem' }
const buttonStyle = { padding: '10px 20px', fontSize: '1rem', cursor: 'pointer' }
