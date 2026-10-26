export type WhatsAppVideoRequest =
  | { type: 'prepare'; name: string }
  | { type: 'close'; name: string }
  | { type: 'sync'; name: string; callId: string }

/** Serialized into the owned provider page. Only our blank canvas document is visible. */
export function whatsAppVideoRuntime(request: WhatsAppVideoRequest): boolean {
  type Obj = Record<string, unknown>
  type VideoState = {
    name: string
    child: Window
    remote: HTMLCanvasElement
    self: HTMLCanvasElement
    remoteLabel: HTMLElement
    selfLabel: HTMLElement
    registry: Obj
    source: Obj
    stream: unknown
    remoteSource?: unknown
    selfSource?: unknown
    resize: () => void
  }
  const scope = globalThis as unknown as {
    location: { origin: string }
    require?: (name: string) => unknown
    open: (url: string, name: string) => Window | null
    __grammieGuideVideo?: VideoState
  }
  const object = (value: unknown): Obj => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) throw new Error()
    return value as Obj
  }
  const load = (name: string): Obj => object(scope.require!(name))
  const invoke = (target: Obj, name: string, ...args: unknown[]): unknown => {
    if (typeof target[name] !== 'function') throw new Error()
    return Reflect.apply(target[name], target, args)
  }
  const clean = (state: VideoState): void => {
    try {
      state.child.removeEventListener('resize', state.resize)
    } catch {
      /* Already closed. */
    }
    for (const canvas of [state.remote, state.self]) {
      try {
        invoke(state.registry, 'unregisterVideoCanvas', canvas)
      } catch {
        /* Teardown continues. */
      }
    }
    try {
      state.child.close()
    } catch {
      /* Main also destroys the owned WebContents. */
    }
    delete scope.__grammieGuideVideo
  }
  if (scope.location?.origin !== 'https://web.whatsapp.com' || typeof scope.require !== 'function')
    return false
  const previous = scope.__grammieGuideVideo
  if (request.type === 'close') {
    if (previous?.name === request.name) clean(previous)
    return true
  }
  try {
    if (request.type === 'prepare') {
      if (previous) return previous.name === request.name && !previous.child.closed
      const registry = object(load('WAWebVoipVideoRendererRegistry').videoRendererRegistry)
      const sources = load('WAWebVoipVideoRenderSource')
      const source = object(sources.WAWebVoipVideoRenderSource)
      const stream = object(sources.WAWebVoipVideoRenderStream).CAMERA
      if (stream == null || invoke(registry, 'getRendererType') == null) return false
      for (const name of [
        'registerVideoCanvas',
        'assignSourceToCanvas',
        'unregisterVideoCanvas',
        'onCanvasResize',
        'setCoverFit'
      ])
        if (typeof registry[name] !== 'function') return false
      if (typeof source.self !== 'function' || typeof source.peer !== 'function') return false
      // Main arms exactly this one blank document and returns a WebContentsView,
      // so this never opens an independent provider window or copies chat HTML.
      const child = scope.open('about:blank', request.name)
      if (!child) return false
      const doc = child.document
      doc.title = 'Family video call'
      doc.documentElement.style.cssText = 'height:100%;overflow:hidden;background:#18201e'
      const body = doc.body
      body.replaceChildren()
      body.style.cssText =
        'margin:0;height:100%;overflow:hidden;position:relative;background:#18201e;color:#fff;font:22px system-ui;user-select:none;pointer-events:none'
      const panel = (local: boolean): { canvas: HTMLCanvasElement; label: HTMLElement } => {
        const box = doc.createElement('div')
        box.style.cssText = local
          ? 'position:absolute;right:16px;bottom:16px;width:25%;height:28%;background:#2b3532;border:2px solid #fff;border-radius:12px;overflow:hidden'
          : 'position:absolute;inset:0;overflow:hidden'
        const label = doc.createElement('div')
        label.textContent = local ? 'Your camera' : 'Waiting for video…'
        label.style.cssText =
          'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;box-sizing:border-box'
        const canvas = doc.createElement('canvas')
        canvas.setAttribute('aria-label', local ? 'Your camera preview' : 'Family video')
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;visibility:hidden'
        box.append(canvas, label)
        body.append(box)
        return { canvas, label }
      }
      const remote = panel(false)
      const self = panel(true)
      const resize = (): void => {
        for (const canvas of [remote.canvas, self.canvas]) {
          const rect = canvas.getBoundingClientRect()
          const ratio = child.devicePixelRatio || 1
          if (rect.width > 0 && rect.height > 0)
            invoke(
              registry,
              'onCanvasResize',
              canvas,
              Math.round(rect.width * ratio),
              Math.round(rect.height * ratio)
            )
        }
      }
      const state: VideoState = {
        name: request.name,
        child,
        remote: remote.canvas,
        self: self.canvas,
        remoteLabel: remote.label,
        selfLabel: self.label,
        registry,
        source,
        stream,
        resize
      }
      scope.__grammieGuideVideo = state
      for (const canvas of [state.remote, state.self]) {
        // The registry's portal mode explicitly supports canvases in a child document.
        invoke(registry, 'registerVideoCanvas', canvas, true)
        invoke(registry, 'setCoverFit', canvas, false)
      }
      child.addEventListener('resize', resize)
      resize()
      return true
    }
    const state = previous
    if (!state || state.name !== request.name || state.child.closed) return false
    const raw = load('WAWebCallCollection')
    const calls = object(raw.default ?? raw)
    const call = object(calls.activeCall)
    if (call.id !== request.callId || call.isVideo !== true) return false
    const peer = call.peerVideoJid ?? call.peerJid
    if (!peer) return false
    const remoteSource = invoke(state.source, 'peer', peer, state.stream)
    const selfSource = invoke(state.source, 'self', state.stream)
    if (!remoteSource || !selfSource) return false
    // The registry requests keyframes and alters A/V-sync membership on assign.
    // Its source factories are memoized, so repeated state polls need no rebind.
    if (state.remoteSource !== remoteSource) {
      state.remote.style.visibility = 'hidden'
      invoke(state.registry, 'assignSourceToCanvas', {
        canvas: state.remote,
        mirror: false,
        source: remoteSource
      })
      state.remoteSource = remoteSource
    }
    if (state.selfSource !== selfSource) {
      state.self.style.visibility = 'hidden'
      invoke(state.registry, 'assignSourceToCanvas', {
        canvas: state.self,
        mirror: true,
        source: selfSource
      })
      state.selfSource = selfSource
    }
    let muted: Obj | null = null
    try {
      muted = load('WAWebVoipVideoStateUtils')
    } catch {
      /* Optional on older Web builds. */
    }
    for (const [canvas, label, videoState, local] of [
      [state.remote, state.remoteLabel, call.peerVideoState, false],
      [state.self, state.selfLabel, call.selfVideoState, true]
    ] as const) {
      const off =
        !!muted &&
        typeof muted.isVideoMuted === 'function' &&
        invoke(muted, 'isVideoMuted', videoState) === true
      const rendered =
        typeof state.registry.hasRenderedFirstFrameForCanvas === 'function'
          ? invoke(state.registry, 'hasRenderedFirstFrameForCanvas', canvas) === true
          : true
      canvas.style.visibility = !off && rendered ? 'visible' : 'hidden'
      label.style.display = !off && rendered ? 'none' : 'flex'
      label.textContent = off
        ? local
          ? 'Your camera is off'
          : 'Camera is off'
        : local
          ? 'Your camera'
          : 'Waiting for video…'
    }
    state.resize()
    return true
  } catch {
    const state = scope.__grammieGuideVideo
    if (state?.name === request.name) clean(state)
    return false
  }
}
