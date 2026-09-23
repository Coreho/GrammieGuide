import { useState } from 'react'
import type { AdminApi } from '../../../../preload/admin'
import type { ReliabilityEvent } from '@shared/ipcContract'

declare global {
  interface Window {
    admin: AdminApi
  }
}

export function ReliabilityTab() {
  const [log, setLog] = useState<ReliabilityEvent[]>([])
  const [lastAction, setLastAction] = useState<ReliabilityEvent | null>(null)

  async function refreshLog(): Promise<void> {
    setLog(await window.admin.getReliabilityLog(50))
  }

  async function run(action: () => Promise<ReliabilityEvent>): Promise<void> {
    const result = await action()
    setLastAction(result)
    await refreshLog()
  }

  return (
    <div>
      <h2>Reliability</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button onClick={() => run(() => window.admin.testVolume())}>Test volume enforcement</button>
        <button onClick={() => run(() => window.admin.testWifiDiscovery())}>Test Wi-Fi adapter discovery</button>
        <button onClick={refreshLog}>Refresh log</button>
      </div>
      {lastAction && (
        <p>
          Last action: <code>{JSON.stringify(lastAction)}</code>
        </p>
      )}
      <ul>
        {log.map((e, i) => (
          <li key={i}>
            <code>
              {e.ts} - {e.op} - {e.ok ? 'ok' : 'FAILED'} {e.detail ? `- ${e.detail}` : ''}
            </code>
          </li>
        ))}
      </ul>
    </div>
  )
}
