import { afterEach, describe, expect, it, vi } from 'vitest'
import { steerCallMedia } from '../../src/shared/whatsAppMedia'

afterEach(() => vi.unstubAllGlobals())

type Device = { kind: string; deviceId: string; getCapabilities?: () => { facingMode?: unknown } }
const builtIn: Device = {
  kind: 'videoinput',
  deviceId: 'laptop-cam',
  getCapabilities: () => ({ facingMode: ['user'] })
}
const webcam: Device = {
  kind: 'videoinput',
  deviceId: 'usb-cam',
  getCapabilities: () => ({ facingMode: [] })
}
const mics: Device[] = [
  { kind: 'audioinput', deviceId: 'default' },
  { kind: 'audioinput', deviceId: 'laptop-mic' },
  { kind: 'audioinput', deviceId: 'usb-mic' }
]

interface FakePage {
  asked: unknown[]
  enumerate: ReturnType<typeof vi.fn>
  getUserMedia: (constraints?: unknown) => Promise<unknown>
}

/** A fresh MediaDevices whose original getUserMedia records what it was asked for. */
function page(devices: Device[], fail?: (constraints: unknown) => boolean): FakePage {
  const asked: unknown[] = []
  const enumerate = vi.fn(async () => devices)
  class FakeMediaDevices {
    enumerateDevices = enumerate
    async getUserMedia(constraints?: unknown): Promise<unknown> {
      asked.push(constraints)
      if (fail?.(constraints)) throw new Error('OverconstrainedError')
      return { stream: constraints }
    }
  }
  vi.stubGlobal('MediaDevices', FakeMediaDevices)
  const media = new FakeMediaDevices()
  // WhatsApp calls it on navigator.mediaDevices, so through the patched prototype.
  const getUserMedia = (constraints?: unknown): Promise<unknown> =>
    (FakeMediaDevices.prototype.getUserMedia as (c?: unknown) => Promise<unknown>).call(
      media,
      constraints
    )
  return { asked, enumerate, getUserMedia }
}

describe('steering WhatsApp call media to the plugged-in webcam', () => {
  it("gives a video call the camera that isn't built in, and Windows' default microphone", async () => {
    const p = page([builtIn, webcam, ...mics])
    expect(steerCallMedia()).toBe(true)
    await p.getUserMedia({
      audio: { deviceId: { exact: 'laptop-mic' }, echoCancellation: true },
      video: { facingMode: 'user', width: { ideal: 1280 } }
    })
    expect(p.asked).toEqual([
      {
        audio: { deviceId: { exact: 'default' }, echoCancellation: true },
        video: { width: { ideal: 1280 }, deviceId: { exact: 'usb-cam' } }
      }
    ])
  })

  it('leaves the camera alone when only the built-in one is there', async () => {
    const p = page([builtIn, ...mics])
    steerCallMedia()
    await p.getUserMedia({ audio: true, video: { facingMode: 'user' } })
    expect(p.asked).toEqual([
      { audio: { deviceId: { exact: 'default' } }, video: { facingMode: 'user' } }
    ])
  })

  it('leaves the camera alone without camera details', async () => {
    const hidden: Device[] = [
      { kind: 'videoinput', deviceId: 'a', getCapabilities: () => ({}) },
      {
        kind: 'videoinput',
        deviceId: 'b',
        getCapabilities: () => {
          throw new Error('no access')
        }
      },
      { kind: 'videoinput', deviceId: '' }
    ]
    const p = page(hidden)
    steerCallMedia()
    await p.getUserMedia({ video: true })
    expect(p.asked).toEqual([{ video: true }])
  })

  it('steers a voice call to the default microphone without looking at cameras', async () => {
    const p = page([builtIn, webcam, ...mics])
    steerCallMedia()
    await p.getUserMedia({ audio: { deviceId: 'laptop-mic' } })
    expect(p.asked).toEqual([{ audio: { deviceId: { exact: 'default' } } }])
    expect(p.enumerate).not.toHaveBeenCalled()
  })

  it("falls back to WhatsApp's own request when the chosen device can't open", async () => {
    const p = page([builtIn, webcam], (c) => JSON.stringify(c).includes('usb-cam'))
    steerCallMedia()
    const request = { audio: true, video: { facingMode: 'user' } }
    await expect(p.getUserMedia(request)).resolves.toEqual({ stream: request })
    expect(p.asked).toHaveLength(2)
    expect(p.asked[1]).toBe(request)
  })

  it('installs once, passes non-media requests through, and does nothing without MediaDevices', async () => {
    const p = page([webcam])
    expect(steerCallMedia()).toBe(true)
    expect(steerCallMedia()).toBe(false)
    await p.getUserMedia({ audio: true })
    expect(p.asked).toHaveLength(1)
    await p.getUserMedia(undefined)
    await p.getUserMedia({})
    expect(p.asked.slice(1)).toEqual([undefined, {}])
    vi.unstubAllGlobals()
    vi.stubGlobal('MediaDevices', undefined)
    expect(steerCallMedia()).toBe(false)
  })
})
