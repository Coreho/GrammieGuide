import { toPublicConfig } from '@shared/configSchema'
import { getConfig, setConfig } from '../../config/store'
import { getLauncherWindow } from '../../windows/windowManager'
import type { MusicSettings } from '@shared/music/musicSchema'

export function saveMusicSettings(music: MusicSettings): MusicSettings {
  const config = setConfig({ music })
  getLauncherWindow()?.webContents.send('config:changed', toPublicConfig(config))
  return config.music
}

/** Save the reference removal first: a rejected config write must never delete a referenced file. */
export function removeTrackReferences(id: string): void {
  const music = getConfig().music
  if (!music.playlists.some((list) => list.trackIds.includes(id))) return
  saveMusicSettings({
    ...music,
    playlists: music.playlists.map((list) => ({
      ...list,
      trackIds: list.trackIds.filter((track) => track !== id)
    }))
  })
}
