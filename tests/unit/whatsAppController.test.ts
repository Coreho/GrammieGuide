import { describe, expect, it, vi } from 'vitest'
import { WhatsAppController } from '../../src/main/services/whatsapp/whatsAppController'
import type {
  WhatsAppAdapter,
  ProviderCallState
} from '../../src/main/services/whatsapp/whatsAppAdapter'

const preferred = { id: 'preferred' as const, name: 'Sarah', phone: '+15551111111' }
const ready = (revision = 1): ProviderCallState => ({
  revision,
  connection: 'ready',
  capabilities: { voice: true, video: true, answer: true, decline: true, end: true },
  call: null
})
const active = (
  revision = 2,
  phase: 'outgoing' | 'incoming' | 'connected' = 'outgoing'
): ProviderCallState => ({
  ...ready(revision),
  call: { id: 'private-provider-id', phone: preferred.phone, mode: 'voice', phase }
})
function fixture(): {
  controller: WhatsAppController
  adapter: WhatsAppAdapter
  changed: ReturnType<typeof vi.fn>
  set: (value: unknown) => void
  notify: () => void
} {
  let observation: unknown = ready()
  let notify = (): void => {}
  const adapter: WhatsAppAdapter = {
    location: 'embedded',
    read: vi.fn(async () => observation),
    execute: vi.fn(async () => active()),
    subscribe: (listener) => {
      notify = listener
      return () => {
        notify = () => {}
      }
    }
  }
  const changed = vi.fn()
  const controller = new WhatsAppController(adapter, () => [preferred], changed, 50)
  return {
    controller,
    adapter,
    changed,
    set: (value: unknown) => {
      observation = value
    },
    notify: () => notify()
  }
}

describe('WhatsApp control interface', () => {
  it('allows every saved caller by name, blocks outsiders, and dials the sixth saved person', async () => {
    const f = fixture()
    const people = Array.from({ length: 6 }, (_, i) => ({
      id: `person-${i}`,
      name: `Person ${i}`,
      phone: `+1555111111${i}`
    }))
    const controller = new WhatsAppController(f.adapter, () => people)
    for (let i = 0; i < people.length; i++) {
      f.set({
        ...active(i + 1, 'incoming'),
        call: { ...active().call!, phone: people[i]!.phone, phase: 'incoming' }
      })
      const state = await controller.refresh()
      expect(state.call?.contact?.name).toBe(people[i]!.name)
      expect(state.availableActions).toContain('answer')
      expect(JSON.stringify(state)).not.toContain(people[i]!.phone)
    }
    f.set({
      ...active(7, 'incoming'),
      call: { ...active().call!, phone: '+15559999999', phase: 'incoming' }
    })
    const unknown = await controller.refresh()
    expect(unknown.call?.contact).toBeNull()
    expect(unknown.availableActions).not.toContain('answer')
    f.set(ready(8))
    await controller.refresh()
    vi.mocked(f.adapter.execute).mockResolvedValue({
      ...active(9),
      call: { ...active().call!, phone: people[5]!.phone }
    })
    expect(
      (await controller.command({ type: 'start', contactId: people[5]!.id, mode: 'video' })).ok
    ).toBe(true)
    expect(f.adapter.execute).toHaveBeenCalledWith(
      { type: 'start', phone: people[5]!.phone, mode: 'video' },
      expect.any(AbortSignal)
    )
    controller.dispose()
    f.controller.dispose()
  })
  it('answers known video callers only while video capability is available', async () => {
    const f = fixture()
    const incoming = {
      ...active(2, 'incoming'),
      call: { ...active(2, 'incoming').call!, mode: 'video' as const }
    }
    f.set({ ...incoming, capabilities: { ...incoming.capabilities, video: false } })
    expect((await f.controller.refresh()).availableActions).not.toContain('answer')
    f.set({ ...incoming, revision: 3 })
    const enabled = await f.controller.refresh()
    expect(enabled.availableActions).toContain('answer')
    vi.mocked(f.adapter.execute).mockResolvedValue({
      ...active(4, 'connected'),
      call: { ...active(4, 'connected').call!, mode: 'video' }
    })
    expect((await f.controller.command({ type: 'answer', callId: enabled.call!.id })).ok).toBe(true)
    expect(f.adapter.execute).toHaveBeenCalledExactlyOnceWith(
      { type: 'answer', callId: 'private-provider-id' },
      expect.any(AbortSignal)
    )
  })
  it('checks queued authority before performing a side effect', async () => {
    const f = fixture()
    await f.controller.refresh()
    await expect(
      f.controller.command({ type: 'start', contactId: 'preferred', mode: 'voice' }, () => {
        throw new Error('admin unlock required')
      })
    ).rejects.toThrow('admin unlock required')
    expect(f.adapter.execute).not.toHaveBeenCalled()
  })

  it('does not call a disconnected command response successful or claim the call ended', async () => {
    const f = fixture()
    f.set(active())
    const state = await f.controller.refresh()
    vi.mocked(f.adapter.execute).mockResolvedValue({ ...ready(3), connection: 'disconnected' })
    const result = await f.controller.command({ type: 'end', callId: state.call!.id })
    expect(result.ok).toBe(false)
    expect(result.state.call?.phase).toBe('unknown')
  })

  it('revokes answer when the caller is removed from saved contacts', async () => {
    const f = fixture()
    const contacts = [preferred]
    const controller = new WhatsAppController(f.adapter, () => contacts)
    f.set(active(2, 'incoming'))
    expect((await controller.refresh()).availableActions).toContain('answer')
    contacts.length = 0
    expect(controller.state().availableActions).not.toContain('answer')
    controller.dispose()
  })
  it('uses saved contacts, keeps private IDs/numbers in main, and waits for observed connection', async () => {
    const f = fixture()
    await f.controller.refresh()
    const result = await f.controller.command({
      type: 'start',
      contactId: 'preferred',
      mode: 'voice'
    })
    expect(result.ok).toBe(true)
    expect(result.state.call?.phase).toBe('outgoing')
    expect(f.adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'start', phone: preferred.phone, mode: 'voice' }),
      expect.any(AbortSignal)
    )
    expect(JSON.stringify(result)).not.toMatch(/15551111111|private-provider-id/)
    f.set(active(3, 'connected'))
    expect((await f.controller.refresh()).call?.phase).toBe('connected')
  })

  it('serializes rapid starts and never dials twice while a call is present', async () => {
    const f = fixture()
    await f.controller.refresh()
    await Promise.all(
      Array.from({ length: 5 }, () =>
        f.controller.command({ type: 'start', contactId: 'preferred', mode: 'voice' })
      )
    )
    expect(f.adapter.execute).toHaveBeenCalledTimes(1)
  })

  it('requires the current local call ID, and ending only succeeds on observed idle', async () => {
    const f = fixture()
    f.set(active())
    const state = await f.controller.refresh()
    expect((await f.controller.command({ type: 'end', callId: 'stale' })).ok).toBe(false)
    expect(f.adapter.execute).not.toHaveBeenCalled()
    vi.mocked(f.adapter.execute).mockResolvedValue(ready(3))
    const result = await f.controller.command({ type: 'end', callId: state.call!.id })
    expect(result.state.call).toBeNull()
    expect(f.adapter.execute).toHaveBeenCalledWith(
      { type: 'end', callId: 'private-provider-id' },
      expect.any(AbortSignal)
    )
  })

  it('exposes answer/decline for incoming calls and never answers an unknown caller', async () => {
    const f = fixture()
    f.set(active(2, 'incoming'))
    const incoming = await f.controller.refresh()
    expect(incoming.availableActions).toContain('answer')
    vi.mocked(f.adapter.execute).mockResolvedValue(active(3, 'connected'))
    expect(
      (await f.controller.command({ type: 'answer', callId: incoming.call!.id })).state.call?.phase
    ).toBe('connected')
    f.set({
      ...active(4, 'incoming'),
      call: { ...active(4).call!, id: 'other', phone: '+15552222222', phase: 'incoming' }
    })
    const other = await f.controller.refresh()
    expect(other.call?.contact).toBeNull()
    expect(other.availableActions).not.toContain('answer')
    expect(other.availableActions).toContain('decline')
  })

  it('fails closed for unsupported, malformed and non-embedded adapters', async () => {
    const f = fixture()
    f.set({ ...ready(), capabilities: { ...ready().capabilities, video: false } })
    await f.controller.refresh()
    expect(
      (await f.controller.command({ type: 'start', contactId: 'preferred', mode: 'video' })).ok
    ).toBe(false)
    expect(
      (
        await f.controller.command({
          type: 'start',
          contactId: 'preferred',
          mode: 'voice',
          phone: '+15552222222'
        })
      ).ok
    ).toBe(false)
    expect(f.adapter.execute).not.toHaveBeenCalled()
    f.set({ ...ready(2), connection: 'secret +15551111111' })
    expect((await f.controller.refresh()).connection).toBe('unavailable')
    const external = new WhatsAppController(
      { ...f.adapter, location: 'external' } as unknown as WhatsAppAdapter,
      () => [preferred]
    )
    expect((await external.refresh()).connection).toBe('unavailable')
  })

  it('ignores old observations and marks an uncertain command unknown without retrying', async () => {
    const f = fixture()
    await f.controller.refresh()
    vi.mocked(f.adapter.execute).mockResolvedValue(ready(1))
    const result = await f.controller.command({
      type: 'start',
      contactId: 'preferred',
      mode: 'voice'
    })
    expect(result.ok).toBe(false)
    expect(result.state.call?.phase).toBe('unknown')
    expect((await f.controller.refresh()).call?.phase).toBe('unknown')
    await f.controller.command({ type: 'start', contactId: 'preferred', mode: 'voice' })
    expect(f.adapter.execute).toHaveBeenCalledTimes(1)
    f.set(ready(2))
    expect((await f.controller.refresh()).call).toBeNull()
  })

  it('times out a hung transport, aborts it and does not leak provider errors', async () => {
    const f = fixture()
    await f.controller.refresh()
    let signal: AbortSignal | undefined
    vi.mocked(f.adapter.execute).mockImplementation((_command, value) => {
      signal = value
      return new Promise(() => {})
    })
    const result = await f.controller.command({
      type: 'start',
      contactId: 'preferred',
      mode: 'voice'
    })
    expect(result.ok).toBe(false)
    expect(result.state.call?.phase).toBe('unknown')
    expect(signal?.aborted).toBe(true)
    expect(result.state.pending).toBeNull()
  })

  it('processes subscription updates and stops observing when disposed', async () => {
    const f = fixture()
    await f.controller.refresh()
    f.set(active(2, 'incoming'))
    f.notify()
    await vi.waitFor(() => expect(f.controller.state().call?.phase).toBe('incoming'))
    f.controller.dispose()
    f.set(active(3, 'connected'))
    f.notify()
    expect(f.controller.state().call?.phase).toBe('incoming')
    expect(
      (await f.controller.command({ type: 'end', callId: f.controller.state().call!.id })).ok
    ).toBe(false)
  })
})
