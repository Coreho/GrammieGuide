import { useEffect, useState } from 'react'
import type { AdminApi } from '../../../../preload/admin'
import type { ActivityEvent } from '@shared/ipcContract'

declare global {
  interface Window {
    admin: AdminApi
  }
}

export function ActivityTab() {
  const [log, setLog] = useState<ActivityEvent[]>([])

  useEffect(() => {
    window.admin.getActivityLog(200).then(setLog)
  }, [])

  return (
    <div>
      <h2>Activity Log</h2>
      <button onClick={() => window.admin.getActivityLog(200).then(setLog)}>Refresh</button>
      <ul>
        {log
          .slice()
          .reverse()
          .map((e, i) => (
            <li key={i}>
              {e.ts} - {e.type} {e.detail ? `- ${e.detail}` : ''}
            </li>
          ))}
      </ul>
    </div>
  )
}
