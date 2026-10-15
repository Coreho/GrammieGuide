import { describe, expect, it, vi } from 'vitest'
import { defaultConfig, type Tile, type Config } from '../../src/shared/configSchema'
import type { BuddyChatResult } from '../../src/shared/ipcContract'
import {
  ACTION_REPLIES,
  actionFromTool,
  explicitBuddyAction,
  type BuddyActionRequest,
  type BuddyActionResult
} from '../../src/shared/buddy/actions'
import { resolveBuddyAction } from '../../src/main/services/ai/buddyActions'
import { buddyChat } from '../../src/main/services/ai/buddyChatService'
import { openBuddyTile } from '../../src/renderer/launcher/src/buddy/openBuddyTile'

const tile = (patch: Partial<Tile> = {}): Tile => ({
  id: 'saved',
  label: 'Family News',
  type: 'builtin',
  builtinKey: 'news',
  size: 'normal',
  slot: 0,
  colorIndex: 0,
  ...patch
})
function setup(tiles = [tile()]): {
  config: Config
  resolveAction: (request: BuddyActionRequest) => Promise<BuddyActionResult>
  chat: (text: string) => Promise<BuddyChatResult>
  list: ReturnType<typeof vi.fn>
} {
  const config = defaultConfig()
  config.tiles = tiles
  config.display.homeLayout = 'simple4'
  const list = vi.fn(),
    exists = vi.fn()
  const resolveAction = (request: BuddyActionRequest): Promise<BuddyActionResult> =>
    resolveBuddyAction(request, config, list, exists)
  const chat = (text: string): Promise<BuddyChatResult> =>
    buddyChat([{ role: 'user', text }], {
      chatEnabled: config.buddy.chatEnabled,
      apiKey: undefined,
      provider: 'anthropic',
      model: 'unused',
      client: null,
      log: vi.fn(),
      resolveAction
    })
  return { config, resolveAction, chat, list }
}

describe('saved tile matching in main', () => {
  it.each([
    'open Family News',
    'GO TO family news!',
    'Show me Family News.',
    'Can you please take me to Family News?',
    'bring me to Family News please',
    'launch Family News'
  ])('resolves %s locally without a key or model', async (text) => {
    const { chat, list } = setup()
    expect(await chat(text)).toEqual({
      ok: true,
      reply: '',
      action: { action: 'openTile', tileId: 'saved' }
    })
    expect(list).not.toHaveBeenCalled()
  })
  it.each([
    'do not open Family News',
    'I used to open Family News',
    'could we talk about Family News'
  ])('does not treat mentions as explicit navigation: %s', (text) => {
    expect(explicitBuddyAction(text)).toBeNull()
  })
  it('uses current labels after rename, not stale labels, and rejects compound instructions', async () => {
    const { config, chat } = setup()
    config.tiles[0]!.label = 'Daily News'
    expect(await chat('open Family News')).toMatchObject({
      ok: false,
      reply: ACTION_REPLIES.tileUnavailable
    })
    expect(await chat('open Daily News')).toMatchObject({ ok: true })
    expect(await chat('open Daily News and delete files')).toMatchObject({ ok: false })
  })
  it.each([
    [],
    [tile({ slot: null })],
    [tile({ slot: 7 })],
    [tile({ slot: 1, size: 'wide' })],
    [tile({ id: 'first', label: 'Other' }), tile()],
    [tile({ type: 'web', url: 'file:///private.exe' })],
    [tile({ type: 'app', appPath: undefined })],
    [tile({ builtinKey: 'unknown' })]
  ])('rejects removed, overflow, hidden, overlapping and unavailable tiles', async (...tiles) => {
    const { chat } = setup(tiles as Tile[])
    expect(await chat('open Family News')).toMatchObject({
      ok: false,
      reply: ACTION_REPLIES.tileUnavailable
    })
  })
  it('asks about duplicate names, keeps slot order, and rechecks chosen labels and visibility', async () => {
    const { config, chat, resolveAction } = setup([tile(), tile({ id: 'second', slot: 3 })])
    const before = structuredClone(config.tiles)
    expect(await chat('open Family News')).toEqual({
      ok: false,
      reason: 'unavailable',
      reply: ACTION_REPLIES.tileAmbiguous,
      choices: [
        { tileId: 'saved', label: 'Family News', position: 'Row 1, position 1' },
        { tileId: 'second', label: 'Family News', position: 'Row 2, position 2' }
      ]
    })
    expect(config.tiles).toEqual(before)
    const choice = { action: 'chooseTile', tileId: 'second', expectedLabel: 'Family News' } as const
    expect(await resolveAction(choice)).toEqual({
      ok: true,
      plan: { action: 'openTile', tileId: 'second' }
    })
    config.tiles[1]!.label = 'Renamed'
    expect((await resolveAction(choice)).ok).toBe(false)
    config.tiles[1]!.label = 'Family News'
    config.tiles[1]!.slot = null
    expect((await resolveAction(choice)).ok).toBe(false)
    config.tiles.pop()
    expect((await resolveAction(choice)).ok).toBe(false)
  })
  it.each(['https://evil.test', 'C:\\evil.exe', 'unknown'])(
    'never treats %s as a target',
    async (target) => {
      const { chat, resolveAction } = setup()
      expect((await chat(`open ${target}`)).ok).toBe(false)
      expect(
        (
          await resolveAction({
            action: 'chooseTile',
            tileId: target,
            expectedLabel: 'Family News'
          })
        ).ok
      ).toBe(false)
    }
  )
  it('rejects forged action objects and unknown tools, including extra tool fields', async () => {
    const { resolveAction } = setup()
    for (const input of [
      { name: 'Family News', url: 'https://evil.test' },
      { name: 'Family News', path: 'C:\\evil.exe' },
      { tileId: 'saved' },
      [],
      null
    ]) {
      expect(actionFromTool('open_saved_tile', input)).toBeNull()
    }
    expect(actionFromTool('open_url', { name: 'Family News' })).toBeNull()
    expect(actionFromTool('open_saved_tile', { name: 'Family News' })).toEqual({
      action: 'openTile',
      name: 'Family News'
    })
    for (const request of [
      'unknown',
      {
        action: 'chooseTile',
        tileId: 'saved',
        expectedLabel: 'Family News',
        url: 'https://evil.test'
      }
    ]) {
      expect((await resolveAction(request as BuddyActionRequest)).ok).toBe(false)
    }
  })
  it('blocks explicit and choice actions when chat is off', async () => {
    const { config, chat, resolveAction } = setup()
    config.buddy.chatEnabled = false
    expect(await chat('open Family News')).toMatchObject({ ok: false, reason: 'disabled' })
    expect(
      (await resolveAction({ action: 'chooseTile', tileId: 'saved', expectedLabel: 'Family News' }))
        .ok
    ).toBe(false)
  })
  it('validates a model proposal against config changed during the API call and discards its claim', async () => {
    const { config, resolveAction } = setup()
    const log = vi.fn()
    const create = vi.fn(async () => {
      config.tiles = []
      return {
        content: [
          { type: 'text', text: 'I opened Family News.' },
          { type: 'tool_use', name: 'open_saved_tile', input: { name: 'Family News' } }
        ],
        stop_reason: 'tool_use'
      }
    })
    const result = await buddyChat(
      [{ role: 'user', text: 'Could we look at Family News together?' }],
      {
        chatEnabled: true,
        apiKey: 'key',
        provider: 'anthropic',
        model: 'unused',
        client: { messages: { create } } as never,
        log,
        resolveAction
      }
    )
    expect(result).toMatchObject({ ok: false, reply: ACTION_REPLIES.tileUnavailable })
    expect(JSON.stringify(log.mock.calls)).not.toContain('Family News')
  })
  it('leaves a request that names no saved tile to chat when chat is available', async () => {
    const { resolveAction } = setup()
    const create = vi.fn(async () => ({
      content: [{ type: 'text', text: 'First, warm the pot.' }],
      stop_reason: 'end_turn'
    }))
    const result = await buddyChat([{ role: 'user', text: 'show me how to make tea' }], {
      chatEnabled: true,
      apiKey: 'key',
      provider: 'anthropic',
      model: 'unused',
      client: { messages: { create } } as never,
      log: vi.fn(),
      resolveAction
    })
    expect(create).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: true, reply: 'First, warm the pot.' })
  })
  it('without chat, an unknown name still gets the calm tile wording, not a chat error', async () => {
    const { chat } = setup()
    expect(await chat('show me how to make tea')).toMatchObject({
      ok: false,
      reply: ACTION_REPLIES.tileUnavailable
    })
  })
  it('a saved but hidden tile is answered as unavailable even when chat is available', async () => {
    const { resolveAction } = setup([tile({ slot: null })])
    const create = vi.fn()
    const result = await buddyChat([{ role: 'user', text: 'open Family News' }], {
      chatEnabled: true,
      apiKey: 'key',
      provider: 'anthropic',
      model: 'unused',
      client: { messages: { create } } as never,
      log: vi.fn(),
      resolveAction
    })
    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false, reply: ACTION_REPLIES.tileUnavailable })
  })
  it('ignores a leading "the" or "my" on either side of the name', async () => {
    const { chat } = setup([tile({ label: 'News' })])
    expect(await chat('open the news')).toMatchObject({ ok: true })
    expect(await chat('go to my News')).toMatchObject({ ok: true })
  })
})

describe('renderer tile execution and acknowledgement', () => {
  it('passes the current saved tile to the tap path and waits for actual success', async () => {
    const { config, resolveAction } = setup()
    let finish!: (ok: boolean) => void
    const activate = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    const reply = vi.fn()
    const pending = openBuddyTile('saved', config, () => config, resolveAction, activate).then(
      reply
    )
    await vi.waitFor(() => expect(activate).toHaveBeenCalledWith(config.tiles[0]))
    expect(reply).not.toHaveBeenCalled()
    finish(true)
    await pending
    expect(reply).toHaveBeenCalledWith(ACTION_REPLIES.tileOpened)
  })
  it.each([false, new Error('private label and path')])(
    'never confirms failed opening %s',
    async (failure) => {
      const { config, resolveAction } = setup()
      const activate = vi.fn(async () => {
        if (failure instanceof Error) throw failure
        return failure
      })
      expect(await openBuddyTile('saved', config, () => config, resolveAction, activate)).toBe(
        ACTION_REPLIES.tileFailed
      )
    }
  )
  it('says nothing while a slow page is still loading', async () => {
    const { config, resolveAction } = setup()
    const activate = vi.fn(async () => null)
    expect(await openBuddyTile('saved', config, () => config, resolveAction, activate)).toBeNull()
  })
  it.each(['renamed', 'removed', 'hidden', 'disabled'])(
    'rechecks config after awaiting main: %s',
    async (change) => {
      const { config } = setup()
      const expected = structuredClone(config)
      const activate = vi.fn()
      const validate = vi.fn(async () => {
        if (change === 'renamed') config.tiles[0]!.label = 'Changed'
        if (change === 'removed') config.tiles = []
        if (change === 'hidden') config.tiles[0]!.slot = null
        if (change === 'disabled') config.buddy.chatEnabled = false
        return { ok: true as const, plan: { action: 'openTile' as const, tileId: 'saved' } }
      })
      expect(await openBuddyTile('saved', expected, () => config, validate, activate)).toBe(
        ACTION_REPLIES.tileUnavailable
      )
      expect(activate).not.toHaveBeenCalled()
    }
  )
})
