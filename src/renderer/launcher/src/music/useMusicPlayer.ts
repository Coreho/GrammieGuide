import { useSyncExternalStore } from 'react'
import { getMusicPlayer, type MusicPlayerSnapshot } from './musicPlayer'

export function useMusicPlayer(): {
  player: ReturnType<typeof getMusicPlayer>
  state: MusicPlayerSnapshot
} {
  const player = getMusicPlayer()
  const state = useSyncExternalStore(player.subscribe, player.snapshot)
  return { player, state }
}
