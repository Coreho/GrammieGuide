import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  realpath: vi.fn(),
  open: vi.fn(),
  logActivity: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => '/media-test-user-data' },
  protocol: { handle: mocks.handle, registerSchemesAsPrivileged: vi.fn() }
}))
vi.mock('node:fs/promises', () => ({ realpath: mocks.realpath, open: mocks.open }))
vi.mock('../../src/main/services/activityLog/activityLog', () => ({
  logActivity: mocks.logActivity
}))

import { installMediaProtocol } from '../../src/main/services/media/mediaProtocol'

describe('media protocol filesystem boundary', () => {
  let handler: (request: Request) => Promise<Response>
  beforeEach(() => {
    vi.resetAllMocks()
    installMediaProtocol()
    handler = mocks.handle.mock.calls[0]![1]
  })

  it.each([
    'grammie-media://photos/',
    'grammie-media://photos/a%2fb.png',
    'grammie-media://photos/CON.png',
    'grammie-media://other/a.png',
    'grammie-media://photos/private.html',
    'grammie-media://photos/a/../b.png'
  ])('rejects %s before filesystem calls', async (url) => {
    // Request also normalizes dot segments, so pass the original handler input.
    const response = await handler({ url, method: 'GET' } as Request)
    expect(response.status).toBe(404)
    expect(mocks.realpath).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.logActivity.mock.calls)).not.toContain(url)
  })

  it('rejects a symlink or junction resolving outside the library before opening', async () => {
    mocks.realpath.mockResolvedValue(
      resolve('/media-test-user-data/media/photos-other/private.png')
    )
    const response = await handler(new Request('grammie-media://photos/private.png'))
    expect(response.status).toBe(404)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.logActivity.mock.calls)).not.toContain('private')
  })

  it('returns a private 404 when the folder or file is missing', async () => {
    mocks.realpath.mockRejectedValue(new Error('ENOENT: private.png'))
    const response = await handler(new Request('grammie-media://photos/private.png'))
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
    expect(mocks.open).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.logActivity.mock.calls)).not.toContain('private.png')
  })
})
