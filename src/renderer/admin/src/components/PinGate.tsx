import { useState } from 'react'
import type { AdminApi } from '../../../../preload/admin'

declare global {
  interface Window {
    admin: AdminApi
  }
}

export function PinGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    const result = await window.admin.unlock(pin)
    if (!result.ok) {
      setError(result.reason ?? 'incorrect PIN')
      setPin('')
      return
    }
    onUnlocked()
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>GrammieGuide Admin</h1>
      <input
        type="password"
        inputMode="numeric"
        placeholder="Enter PIN"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{ display: 'block', width: '100%', padding: 10, marginBottom: 12, fontSize: '1rem' }}
        autoFocus
      />
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      <button onClick={submit} style={{ padding: '10px 20px', fontSize: '1rem', cursor: 'pointer' }}>
        Unlock
      </button>
    </div>
  )
}
