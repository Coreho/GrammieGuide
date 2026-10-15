import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

// A small hook host lets these event tests run in the project's node environment.
// Both inputs must reach the real panel handler, not duplicate its chat logic here.
const host = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>
}))
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const slot = host.cursor++
    if (!(slot in host.slots)) host.slots[slot] = initial
    return [
      host.slots[slot],
      (value: unknown) => {
        host.slots[slot] = typeof value === 'function' ? value(host.slots[slot]) : value
      }
    ]
  },
  useRef: (initial: unknown) => {
    const slot = host.cursor++
    if (!(slot in host.slots)) host.slots[slot] = { current: initial }
    return host.slots[slot]
  },
  useEffect: (effect: () => void | (() => void)) => {
    host.effects.push(effect)
  }
}))
vi.mock('../../src/renderer/audio/audioBridge', () => ({
  holdAudio: async () => ({ release: vi.fn() })
}))
vi.mock('../../src/renderer/launcher/src/buddy/speech', () => ({
  speak: vi.fn(),
  stopSpeaking: vi.fn()
}))
import { BuddyChatPanel } from '../../src/renderer/launcher/src/buddy/BuddyChatPanel'

type Element = ReactElement<Record<string, unknown>>
function find(
  root: unknown,
  predicate: (props: Record<string, unknown>) => boolean
): Element | undefined {
  if (!root || typeof root !== 'object') return undefined
  if (Array.isArray(root)) return root.map((child) => find(child, predicate)).find(Boolean)
  const element = root as Element
  if (!element.props) return undefined
  return predicate(element.props) ? element : find(element.props.children, predicate)
}
describe('typed and spoken saved-tile panel wiring', () => {
  const onAction = vi.fn(async () => undefined)
  const api = {
    buddyChat: vi.fn(),
    buddyCanListen: vi.fn(async () => true),
    buddyCancelListen: vi.fn(),
    buddyListen: vi.fn(async () => ({ ok: true, text: 'open Family News' }))
  }
  const render = (): ReactElement => {
    host.cursor = 0
    host.effects = []
    return BuddyChatPanel({
      onAction,
      onClose: vi.fn(),
      onPhaseChange: vi.fn(),
      voiceEnabled: false
    })
  }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    host.slots = []
    vi.stubGlobal('window', { launcher: api })
    api.buddyChat.mockResolvedValue({
      ok: true,
      reply: '',
      action: { action: 'openTile', tileId: 'saved' }
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it.each(['typed', 'spoken'])(
    'routes %s input through buddy:chat and the existing action callback',
    async (mode) => {
      let tree = render()
      if (mode === 'typed') {
        const input = find(tree, (props) => props.placeholder === 'Say something...')!
        ;(input.props.onChange as (event: unknown) => void)({
          target: { value: 'open Family News' }
        })
        tree = render()
        ;(find(tree, (props) => props.children === 'Send')!.props.onClick as () => void)()
      } else {
        for (const effect of host.effects) effect()
        await Promise.resolve()
        tree = render()
        ;(
          find(tree, (props) => props['aria-label'] === 'Talk to Buddy out loud')!.props
            .onClick as () => void
        )()
      }
      await vi.advanceTimersByTimeAsync(0)
      expect(api.buddyChat).toHaveBeenCalledWith(
        expect.arrayContaining([{ role: 'user', text: 'open Family News' }])
      )
      expect(onAction).toHaveBeenCalledWith({ action: 'openTile', tileId: 'saved' })
      expect(api.buddyListen).toHaveBeenCalledTimes(mode === 'spoken' ? 1 : 0)
    }
  )
  it('does not listen on opening and cancels on cleanup, ignoring a late recognized request', async () => {
    render()
    const cleanups = host.effects.map((effect) => effect())
    await Promise.resolve()
    expect(api.buddyListen).not.toHaveBeenCalled()
    let finish!: (value: { ok: boolean; text: string }) => void
    api.buddyListen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const tree = render()
    ;(
      find(tree, (props) => props['aria-label'] === 'Talk to Buddy out loud')!.props
        .onClick as () => void
    )()
    await Promise.resolve()
    for (const cleanup of cleanups) cleanup?.()
    finish({ ok: true, text: 'open Family News' })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.buddyCancelListen).toHaveBeenCalled()
    expect(api.buddyChat).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
  })
})
