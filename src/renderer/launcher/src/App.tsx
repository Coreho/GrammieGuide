import { useEffect, useState } from 'react'
import type { LauncherApi } from '../../../preload/launcher'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}

/**
 * M1 placeholder: proves the renderer boots and can round-trip to the main
 * process's config store over the typed IPC contract. Home screen/tile
 * grid/kiosk lockdown land in M2.
 */
export default function App() {
  const [status, setStatus] = useState('loading...')

  useEffect(() => {
    window.launcher
      .getConfig()
      .then((cfg) => setStatus(`config loaded, schemaVersion ${cfg.schemaVersion}`))
      .catch((err) => setStatus(`config load failed: ${String(err)}`))
  }, [])

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 32 }}>
      <h1>GrammieGuide</h1>
      <p>M1 scaffold - Home screen lands in M2.</p>
      <p>{status}</p>
    </div>
  )
}
