/**
 * Original integration code, run in WhatsApp's own page (main world) by its preload
 * before WhatsApp's scripts, so every camera or microphone request WhatsApp makes
 * goes through it. It is copied into the page as source text: keep it
 * self-contained, using nothing else from this file or the app.
 *
 * WhatsApp Web chose the laptop's built-in camera and microphone on her kiosk
 * (TASK-90) although the plugged-in webcam is Chromium's first camera and
 * Windows' default microphone. Calls now use:
 * - the first camera that is not built into the screen. A built-in camera reports
 *   which way it faces (facingMode ["user"]); a plugged-in one reports none. With
 *   no such camera, WhatsApp gets the camera it asked for. Camera details are
 *   only visible while the app grants camera access, which is only for video calls.
 * - Windows' default microphone ('default'), the one Buddy listens with, so the
 *   caregiver changes both in one place: Windows' sound settings.
 * If the chosen device cannot be opened, WhatsApp's own request runs instead.
 * Only device choice changes: whether camera or microphone access is allowed at
 * all is still decided by the session's permission handlers in main.
 */
export function steerCallMedia(): boolean {
  type Constraint = boolean | Record<string, unknown> | undefined
  interface Device {
    kind: string
    deviceId: string
    getCapabilities?: () => { facingMode?: unknown }
  }
  interface MediaDevicesLike {
    enumerateDevices(): Promise<Device[]>
    getUserMedia(constraints?: Record<string, unknown>): Promise<unknown>
  }
  const proto = (globalThis as { MediaDevices?: { prototype: MediaDevicesLike } }).MediaDevices
    ?.prototype
  const marker = Symbol.for('grammieguide.steerCallMedia')
  if (!proto || typeof proto.getUserMedia !== 'function' || marker in proto) return false
  const original = proto.getUserMedia

  const pluggedInCamera = async (devices: MediaDevicesLike): Promise<string | null> => {
    for (const device of await devices.enumerateDevices()) {
      if (device.kind !== 'videoinput' || !device.deviceId) continue
      try {
        const facing = device.getCapabilities?.().facingMode
        if (Array.isArray(facing) && facing.length === 0) return device.deviceId
      } catch {
        // No details without camera access: leave WhatsApp's own choice.
      }
    }
    return null
  }
  const steer = (requested: Constraint, deviceId: string | null): Constraint => {
    if (!requested || !deviceId) return requested
    const rest: Record<string, unknown> = typeof requested === 'object' ? { ...requested } : {}
    delete rest.facingMode
    delete rest.groupId
    return { ...rest, deviceId: { exact: deviceId } }
  }

  Object.defineProperty(proto, marker, { value: true })
  Object.defineProperty(proto, 'getUserMedia', {
    configurable: true,
    writable: true,
    value: async function (this: MediaDevicesLike, constraints?: Record<string, unknown>) {
      const audio = constraints?.audio as Constraint
      const video = constraints?.video as Constraint
      if (!constraints || (!audio && !video)) return original.call(this, constraints)
      let camera: string | null = null
      if (video) {
        try {
          camera = await pluggedInCamera(this)
        } catch {
          camera = null
        }
      }
      const steered = {
        ...constraints,
        audio: steer(audio, 'default'),
        video: steer(video, camera)
      }
      try {
        return await original.call(this, steered)
      } catch {
        return original.call(this, constraints)
      }
    }
  })
  return true
}
