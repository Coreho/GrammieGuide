import { useState } from 'react'
import type { AdminApi } from '../../../preload/admin'
import type { ReliabilityEvent } from '../../../shared/ipcContract'

declare global {
  interface Window {
    admin: AdminApi
  }
}

/**
 * M1 debug harness for the reliability layer: lets a developer trigger
 * volume enforcement / Wi-Fi adapter discovery / (later) watchdog
 * registration by hand on real hardware and see the structured result,
 * instead of the old app's console.warn-only visibility. Full admin
 * panel (Tile CRUD, Display, Confusion tuning, PIN gate) lands in M2.
 */
export default function App() {
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
    <div style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>GrammieGuide Admin - Reliability Debug (M1)</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <button onClick={() => run(() => window.admin.testVolume())}>Test volume enforcement</button>
        <button onClick={() => run(() => window.admin.testWifiDiscovery())}>
          Test Wi-Fi adapter discovery
        </button>
        <button onClick={refreshLog}>Refresh log</button>
      </div>
      {lastAction && (
        <p>
          Last action: <code>{JSON.stringify(lastAction)}</code>
        </p>
      )}
      <h2>Reliability log</h2>
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
