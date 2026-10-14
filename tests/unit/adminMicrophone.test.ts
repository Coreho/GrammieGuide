import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  request: vi.fn(),
  unlocked: true,
  admin: { getURL: () => 'file:///C:/app/admin/index.html' }
}))
vi.mock('electron', () => ({
  session: {
    defaultSession: {
      setPermissionCheckHandler: mocks.check,
      setPermissionRequestHandler: mocks.request
    }
  }
}))
vi.mock('../../src/main/services/auth/adminAuth', () => ({ isAdminUnlocked: () => mocks.unlocked }))
vi.mock('../../src/main/windows/windowManager', () => ({
  getAdminWindow: () => ({ webContents: mocks.admin })
}))
import { installAdminMicrophonePermissions } from '../../src/main/services/photos/adminMicrophone'
describe('admin microphone permission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.unlocked = true
    installAdminMicrophonePermissions()
  })
  const details = { requestingUrl: 'file:///C:/app/admin/index.html', isMainFrame: true }
  it('allows only audio from the exact unlocked admin document', () => {
    const check = mocks.check.mock.calls[0]![0]
    expect(check(mocks.admin, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(true)
    for (const changed of [
      { mediaType: 'video' },
      { isMainFrame: false },
      { requestingUrl: 'file:///C:/app/launcher/index.html' },
      { requestingUrl: undefined }
    ]) {
      expect(
        check(mocks.admin, 'media', 'file://', { ...details, mediaType: 'audio', ...changed })
      ).toBe(false)
    }
    expect(check(null, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(false)
    expect(check({}, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(false)
    mocks.unlocked = false
    expect(check(mocks.admin, 'media', 'file://', { ...details, mediaType: 'audio' })).toBe(false)
  })
  it('rejects camera, mixed capture, screen capture, other permissions and locked requests', () => {
    const request = mocks.request.mock.calls[0]![0]
    const callback = vi.fn()
    request(mocks.admin, 'media', callback, { ...details, mediaTypes: ['audio'] })
    expect(callback).toHaveBeenLastCalledWith(true)
    for (const mediaTypes of [[], ['video'], ['audio', 'video'], undefined]) {
      request(mocks.admin, 'media', callback, { ...details, mediaTypes })
      expect(callback).toHaveBeenLastCalledWith(false)
    }
    for (const permission of ['display-capture', 'notifications']) {
      request(mocks.admin, permission, callback, { ...details, mediaTypes: ['audio'] })
      expect(callback).toHaveBeenLastCalledWith(false)
    }
    mocks.unlocked = false
    request(mocks.admin, 'media', callback, { ...details, mediaTypes: ['audio'] })
    expect(callback).toHaveBeenLastCalledWith(false)
  })
})
