import { useEffect, useState } from 'react'
import type { AdminApi } from '../../../preload/admin'
import { PinSetup } from './components/PinSetup'
import { PinGate } from './components/PinGate'
import { TilesTab } from './components/TilesTab'
import { DisplayTab } from './components/DisplayTab'
import { WeatherTab } from './components/WeatherTab'
import { ConfusionTab } from './components/ConfusionTab'
import { BuddyTab } from './components/BuddyTab'
import { ActivityTab } from './components/ActivityTab'
import { ReliabilityTab } from './components/ReliabilityTab'
import { PhotosTab } from './components/PhotosTab'
import { MusicTab } from './components/MusicTab'
import { ChecksTab } from './components/ChecksTab'
import { SitesTab } from './components/SitesTab'
import { useConfigStore } from './state/useConfigStore'

declare global {
  interface Window {
    admin: AdminApi
  }
}

type Stage = 'loading' | 'setup' | 'locked' | 'unlocked'
type Tab =
  | 'tiles'
  | 'photos'
  | 'music'
  | 'display'
  | 'weather'
  | 'buddy'
  | 'confusion'
  | 'activity'
  | 'reliability'
  | 'checks'
  | 'sites'

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')
  const [tab, setTab] = useState<Tab>('tiles')
  const load = useConfigStore((s) => s.load)

  useEffect(() => {
    window.admin.isPinSet().then((isSet) => setStage(isSet ? 'locked' : 'setup'))
  }, [])

  useEffect(() => {
    if (stage === 'unlocked') load()
  }, [stage, load])

  if (stage === 'loading') return null
  if (stage === 'setup') return <PinSetup onDone={() => setStage('unlocked')} />
  if (stage === 'locked') return <PinGate onUnlocked={() => setStage('unlocked')} />

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 200, background: '#1f2d3d', color: '#fff', padding: 16 }}>
        <h2>GrammieGuide</h2>
        {(
          [
            'tiles',
            'photos',
            'music',
            'display',
            'weather',
            'buddy',
            'confusion',
            'activity',
            'reliability',
            'checks',
            'sites'
          ] as Tab[]
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 10,
              marginBottom: 4,
              background: tab === t ? '#3a5f8a' : 'transparent',
              color: '#fff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {t[0]?.toUpperCase()}
            {t.slice(1)}
          </button>
        ))}
        <button
          onClick={async () => {
            await window.admin.lock()
            setStage('locked')
          }}
          style={{ marginTop: 24, width: '100%', padding: 10 }}
        >
          Lock
        </button>
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        {tab === 'tiles' && <TilesTab />}
        {tab === 'photos' && <PhotosTab />}
        {tab === 'music' && <MusicTab />}
        {tab === 'display' && <DisplayTab />}
        {tab === 'weather' && <WeatherTab />}
        {tab === 'buddy' && <BuddyTab />}
        {tab === 'confusion' && <ConfusionTab />}
        {tab === 'activity' && <ActivityTab />}
        {tab === 'reliability' && <ReliabilityTab />}
        {tab === 'checks' && <ChecksTab />}
        {tab === 'sites' && <SitesTab />}
      </main>
    </div>
  )
}
