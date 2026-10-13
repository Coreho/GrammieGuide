import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { isDestroyed: () => false, send: mocks.send } }]
  }
}))
import {
  clearAudioOwner,
  dispatchClientAudio,
  getAudioCoordinator
} from '../../src/main/services/audio/audioRuntime'

class Contents extends EventEmitter {
  constructor(readonly id: number) {
    super()
  }
}
const hold = '4c5fe7c6-76c4-4d8b-b19c-598d109fbccf'
describe('audio source ownership and recovery', () => {
  let home: Contents, admin: Contents
  const dispatch = (
    contents: Contents,
    event: Parameters<typeof dispatchClientAudio>[1]
  ): ReturnType<typeof dispatchClientAudio> =>
    dispatchClientAudio(contents as unknown as WebContents, event)
  beforeEach(() => {
    home = new Contents(1)
    admin = new Contents(2)
    mocks.send.mockClear()
  })
  afterEach(() => {
    clearAudioOwner(1)
    clearAudioOwner(2)
    home.emit('destroyed')
    admin.emit('destroyed')
  })
  it('does not let another renderer end or reuse an owned sound', () => {
    dispatch(home, { type: 'start', source: 'buddyVoice', id: hold })
    expect(dispatch(admin, { type: 'end', id: hold }).decision.muteWebPage).toBe(true)
    expect(() => dispatch(admin, { type: 'start', source: 'narration', id: hold })).toThrow(
      'Invalid audio'
    )
    expect(dispatch(home, { type: 'end', id: hold }).decision.muteWebPage).toBe(false)
  })
  it('a renderer crash ends its voice and music, while preserving other windows’ holds', () => {
    dispatch(home, { type: 'musicPlay' })
    dispatch(home, { type: 'start', source: 'buddyVoice', id: hold })
    dispatch(admin, {
      type: 'start',
      source: 'listening',
      id: 'd75ba57b-1b49-4225-9219-93086c99a16a'
    })
    home.emit('render-process-gone')
    expect(getAudioCoordinator().snapshot().decision).toMatchObject({
      music: 'off',
      showStopMusic: false,
      muteWebPage: true
    })
    clearAudioOwner(2)
    expect(getAudioCoordinator().snapshot().decision.muteWebPage).toBe(false)
  })
  it('publishes only decisions and opaque stop IDs, with increasing revisions', () => {
    const first = dispatch(home, { type: 'musicPlay' })
    const second = dispatch(home, { type: 'musicPause' })
    expect(second.revision).toBeGreaterThan(first.revision)
    expect(Object.keys(second).sort()).toEqual(['decision', 'revision', 'stop'])
    expect(mocks.send).toHaveBeenLastCalledWith('audio:changed', second)
  })
  it('ends only the reloaded document’s audio, preserving subframe and same-document holds', () => {
    dispatch(home, { type: 'musicPlay' })
    dispatch(admin, { type: 'start', source: 'buddyVoice', id: hold })
    admin.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    admin.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    expect(getAudioCoordinator().snapshot().decision.muteWebPage).toBe(true)
    admin.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(getAudioCoordinator().snapshot().decision).toMatchObject({
      music: 'lowered',
      showStopMusic: true,
      muteWebPage: false
    })
    home.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(getAudioCoordinator().snapshot().decision.music).toBe('off')
  })
})
