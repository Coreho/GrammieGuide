import { useState } from 'react'
import { useConfigStore } from '../state/useConfigStore'

export function BackupSection() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run(restore: boolean): Promise<void> {
    setBusy(true)
    setMessage('')
    try {
      if (restore) {
        const result = await window.admin.restoreBackup()
        if (result.ok) {
          useConfigStore.setState({ config: result.config })
          setMessage(
            'Settings restored. Photo and music files are not included; import them separately on another device.'
          )
        } else {
          setMessage(
            'canceled' in result
              ? 'Restore canceled. Your settings have not changed.'
              : result.message
          )
        }
      } else {
        const result = await window.admin.saveBackup()
        setMessage(
          result.ok ? 'Backup saved.' : 'canceled' in result ? 'Backup canceled.' : result.message
        )
      }
    } catch {
      setMessage('Could not complete this action. Check that admin is unlocked and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="backup-heading" style={{ marginTop: 24 }}>
      <h3 id="backup-heading">Settings backup and restore</h3>
      <p>Save all settings and tiles to use on this or another device.</p>
      <p>Photo and music files are not included. Import them separately on another device.</p>
      <p>
        The API key and caregiver PIN are not included. Restore keeps this device&apos;s secrets.
      </p>
      <p>
        Restore replaces all current settings and tiles. Save a backup first if you want to keep
        them.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button disabled={busy} onClick={() => void run(false)}>
          Save backup
        </button>
        <button disabled={busy} onClick={() => void run(true)}>
          Restore backup
        </button>
      </div>
      <p role="status" aria-live="polite">
        {busy ? 'Working...' : message}
      </p>
    </section>
  )
}
