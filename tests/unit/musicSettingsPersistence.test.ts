import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/shared/configSchema'
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), send: vi.fn() }))
vi.mock('../../src/main/config/store', () => ({ getConfig: mocks.get, setConfig: mocks.set }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: () => ({ webContents: { send: mocks.send } })
}))
import { removeTrackReferences } from '../../src/main/services/music/musicSettings'

describe('track references', () => {
  beforeEach(() => vi.resetAllMocks())
  it('removes a track from every playlist while retaining other tracks, order and settings', () => {
    const cfg = defaultConfig()
    cfg.reliability.adminPinHash = 'private'
    cfg.music.playlists = [
      { id: 'one', label: 'One', shuffle: false, trackIds: ['keep', 'removed', 'last'] },
      { id: 'two', label: 'Two', shuffle: true, trackIds: ['removed'] }
    ]
    mocks.get.mockReturnValue(cfg)
    mocks.set.mockImplementation(({ music }) => ({ ...cfg, music }))
    removeTrackReferences('removed')
    const music = mocks.set.mock.calls[0]![0].music
    expect(music.playlists.map((list: { trackIds: string[] }) => list.trackIds)).toEqual([
      ['keep', 'last'],
      []
    ])
    expect(music).toMatchObject({ autoStopMinutes: 90, showNowPlayingChip: true })
    expect(mocks.send).toHaveBeenCalledOnce()
    expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('private')
    expect(cfg.music.playlists[0]!.trackIds).toEqual(['keep', 'removed', 'last'])
  })
  it('does not write config for an unreferenced track', () => {
    mocks.get.mockReturnValue(defaultConfig())
    removeTrackReferences('removed')
    expect(mocks.set).not.toHaveBeenCalled()
  })
})
