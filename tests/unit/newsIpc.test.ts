import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerNewsIpc } from '../../src/main/ipc/newsIpc'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  sender: {},
  preview: vi.fn(async () => ({})),
  destination: vi.fn(() => 'https://www.bbc.com/news'),
  open: vi.fn(() => ({ ok: true })),
  log: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('../../src/main/windows/windowManager', () => ({
  getLauncherWindow: () => ({ webContents: mocks.sender })
}))
vi.mock('../../src/main/services/news/news', () => ({
  newsService: { get: vi.fn(), destination: mocks.destination },
  newsPreviews: { get: mocks.preview }
}))
vi.mock('../../src/main/services/browser/embeddedBrowser', () => ({ openUrl: mocks.open }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({ logActivity: mocks.log }))

beforeEach(() => {
  vi.clearAllMocks()
  registerNewsIpc()
})

describe('News IPC source boundary', () => {
  it('refuses preview and source-open requests from a web page or malformed caller', async () => {
    const preview = mocks.handlers.get('news:preview')!
    const open = mocks.handlers.get('news:open')!
    for (const req of [undefined, {}, { tileId: 'news', sourceId: 42 }]) {
      expect(await preview({ sender: mocks.sender }, req)).toEqual({})
      expect(open({ sender: mocks.sender }, req)).toEqual({ ok: false })
    }
    expect(await preview({ sender: {} }, { tileId: 'news', sourceId: 'bbc' })).toEqual({})
    expect(open({ sender: {} }, { tileId: 'news', sourceId: 'bbc' })).toEqual({ ok: false })
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('resolves source IDs in main and keeps source navigation private with a shelf return', () => {
    const result = mocks.handlers.get('news:open')!(
      { sender: mocks.sender },
      { tileId: 'news', sourceId: 'bbc' }
    )
    expect(result).toEqual({ ok: true })
    expect(mocks.destination).toHaveBeenCalledWith('news', undefined, 'bbc')
    expect(mocks.open).toHaveBeenCalledWith('https://www.bbc.com/news', {
      privateNavigation: true,
      trustedInitialPage: false,
      returnToNewsTileId: 'news'
    })
    expect(mocks.log).toHaveBeenCalledWith('news-site-opened')
  })
})
