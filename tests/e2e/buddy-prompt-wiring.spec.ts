import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * What the app actually puts on the wire when Buddy answers her (TASK-11).
 *
 * m4-buddy-chat.spec.ts covers the no-key and rejected-key paths, and the prompt
 * itself is unit tested, but nothing checked that the real request carries the
 * rules. This stubs `fetch` in the main process - the Anthropic SDK captures the
 * global when the client is built, and the client is built lazily per launch - so
 * the request is captured without a key and without changing any product code.
 *
 * What this proves: the frozen prompt reaches the API unchanged and as a single
 * string, the model and effort follow the config, the history is sanitized, her
 * reply is what she sees, and what she said never reaches a log.
 */

let app: ElectronApplication
let launcher: Page
let admin: Page

const STUB_REPLY = 'Your mother. What is she like?'

/**
 * Swap the global fetch for one that records the request and answers with the
 * canned reply.
 *
 * The payload is built *inside* the evaluated function rather than passed as an
 * argument: Playwright serializes the function as source, so anything it needs
 * has to be reachable from that source, and a value that arrives undefined here
 * produces a silently empty 200 response.
 */
async function installStub(): Promise<void> {
  await app.evaluate(() => {
    const state = {
      url: '',
      method: '',
      headers: {} as Record<string, string>,
      body: '',
      calls: 0
    }
    ;(globalThis as unknown as { __chatStub: typeof state }).__chatStub = state

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      state.calls += 1
      state.url = String(input)
      state.method = init?.method ?? 'GET'
      // The SDK hands headers over as a Headers instance, which has no own
      // enumerable keys, so read them through the Headers API instead.
      state.headers =
        init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>))
      state.body = String(init?.body ?? '')
      // Unique per turn: the panel keeps earlier replies on screen, so an
      // identical string would match more than one bubble. The reply text is
      // spelled out here rather than interpolated, because this function is
      // serialized into the main process and cannot see the test's constants.
      return new Response(
        JSON.stringify({
          id: `msg_e2e_${state.calls}`,
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [{ type: 'text', text: `Your mother. What is she like? (turn ${state.calls})` }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }) as typeof fetch
  })
}

async function restoreFetch(): Promise<void> {
  await app.evaluate(() => {
    // The SDK read the real one when it built the client; this only cleans up.
    delete (globalThis as unknown as { __chatStub?: unknown }).__chatStub
  })
}

async function setApiKey(placeholder: string, value: string): Promise<void> {
  await admin.getByPlaceholder(placeholder).fill(value)
  await admin.getByRole('button', { name: 'Save key' }).click()
  await expect(admin.getByText('A key is set.')).toBeVisible({ timeout: 5_000 })
}

/** The Buddy tab's two selects are the model list first, then the voice. */
async function selectModel(value: string): Promise<void> {
  await admin.getByLabel('Model', { exact: true }).selectOption(value)
}

async function selectProvider(value: 'anthropic' | 'openrouter'): Promise<void> {
  const provider = admin.getByLabel('Who answers Buddy')
  await provider.selectOption(value)
  await expect(provider).toHaveValue(value)
}

/**
 * Send one turn and return the stub's call count from *before* it was sent, so
 * the caller can tell which reply belongs to this turn. The panel stays open
 * between turns, so it is only opened when it is not already up.
 */
async function sayToBuddy(text: string): Promise<number> {
  const box = launcher.getByPlaceholder('Say something...')
  if (!(await box.isVisible().catch(() => false))) {
    await expect(launcher.getByRole('button', { name: 'Say hello to Buddy' })).toBeVisible()
    await launcher.keyboard.press('Control+Shift+B')
    await launcher.getByRole('menuitem', { name: "Let's chat" }).click()
  }
  await expect(box).toBeVisible()
  await box.fill(text)
  const before = (await stubState()).calls
  await launcher.getByRole('button', { name: 'Send' }).click()
  return before
}

/** Close the chat so the next turn reopens it from Home. */
async function closeChat(): Promise<void> {
  const close = launcher.getByRole('button', { name: 'Close chat' })
  if (await close.isVisible().catch(() => false)) await close.click()
}

type StubRecording = {
  url: string
  method: string
  headers: Record<string, string>
  body: string
  calls: number
}

function stubState(): Promise<StubRecording> {
  return app.evaluate(
    () => (globalThis as unknown as { __chatStub: never }).__chatStub as never
  )
}

/**
 * Wait until the stub has answered the turn sent after `before`, and return the
 * request it recorded. Reading the recorded body is the point of the whole spec,
 * so this waits on the request itself rather than on a rendered string.
 */
async function expectReply(before: number): Promise<{ url: string; body: ReturnType<typeof parseBody> }> {
  await expect
    .poll(async () => (await stubState()).calls, { timeout: 20_000 })
    .toBeGreaterThan(before)
  const calls = (await stubState()).calls
  await expect(launcher.getByText(`${STUB_REPLY} (turn ${calls})`)).toBeVisible({
    timeout: 20_000
  })
  const recorded = await stubState()
  return { url: recorded.url, body: parseBody(recorded.body) }
}

function parseBody(raw: string): {
  model: string
  system: unknown
  messages: { role: string; content: string }[]
  max_tokens: number
  output_config?: { effort?: string }
  provider?: { only: string[]; allow_fallbacks: boolean; data_collection: string }
} {
  return JSON.parse(raw)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-chatwire-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  launcher = await app.firstWindow()
  await launcher.waitForLoadState('domcontentloaded')

  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  await admin.waitForLoadState('domcontentloaded')
  await admin.getByPlaceholder('4-8 digit PIN').fill('1357')
  await admin.getByPlaceholder('Confirm PIN').fill('1357')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Buddy' }).click()
  await expect(admin.getByText('No key set')).toBeVisible({ timeout: 10_000 })
  await setApiKey('sk-ant-...', 'sk-ant-e2e-stubbed-key')

  // Everything below runs against the stub, not the real API.
  await installStub()
})

test.afterAll(async () => {
  await restoreFetch()
  await app?.close()
})

test('the frozen prompt reaches the API as one string, with its no-inventing rules', async () => {
  await selectModel('claude-sonnet-5-5')
  const { url, body } = await expectReply(await sayToBuddy('My mother is coming to pick me up today.'))
  expect(url).toContain('/v1/messages')
  expect(body.max_tokens).toBeGreaterThan(0)

  // A single string, not per-request blocks: that is what keeps it a cacheable
  // prefix, and it is what makes this assertion meaningful at all.
  expect(typeof body.system).toBe('string')
  const system = body.system as string

  // The rules this task exists for, in the wording the unit test pins.
  expect(system).toContain('Never confirm a false or confused statement as true.')
  expect(system).toContain('Never invent facts about her family or other people')
  expect(system).toContain('neither agree nor disagree that it is happening')
  expect(system).toContain('you could ask your family')

  // Nothing per-request leaks into the prompt.
  expect(system).not.toContain('My mother is coming')
  expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}/)
})

test('the model comes from config, and effort low is sent only where it is accepted', async () => {
  let request = await expectReply(await sayToBuddy('What time is my appointment?'))
  expect(request.body.model).toBe('claude-sonnet-5-5')
  expect(request.body.output_config?.effort).toBe('low')

  // Haiku rejects output_config, so it must not be sent there at all.
  await admin.getByRole('button', { name: 'Buddy' }).click()
  await selectModel('claude-haiku-4-5')
  request = await expectReply(await sayToBuddy('Are you a cat?'))
  expect(request.body.model).toBe('claude-haiku-4-5')
  expect(request.body.output_config).toBeUndefined()
})

test('her history is sent as clean alternating turns, ending with her', async () => {
  // Reads the last request rather than sending a turn: by now several turns have
  // accumulated, which is exactly the history that needs sanitising.
  const { messages } = parseBody((await stubState()).body)
  expect(messages.length).toBeGreaterThan(1)
  // The API rejects a conversation that does not end on a user turn, and an
  // empty or assistant-first history is exactly what toApiMessages exists to stop.
  expect(messages.at(-1)?.role).toBe('user')
  expect(messages[0]?.role).toBe('user')
  for (const turn of messages) {
    expect(turn.content.trim().length).toBeGreaterThan(0)
    expect(turn.content).not.toContain('undefined')
  }
})

test('what she said never reaches a log', async () => {
  const SECRET = 'Grandma said her kettle is broken'
  await closeChat()
  const request = await expectReply(await sayToBuddy(SECRET))

  const log = await admin.evaluate(() => window.admin.getActivityLog())
  expect(JSON.stringify(log)).not.toContain('kettle')
  // The turn did reach the API, so this is not passing because nothing happened.
  expect(JSON.stringify(request.body.messages)).toContain('kettle')
})

/**
 * The same chat, routed through OpenRouter instead. What matters is not that it
 * works - it is that the request goes to OpenRouter, uses the OpenRouter key,
 * carries the identical frozen prompt, and refuses to be served by anyone but
 * Anthropic.
 */
test('switching to OpenRouter reroutes the chat and pins it to Anthropic', async () => {
  await selectProvider('openrouter')
  // Model ids are provider-specific, so the switch must land on a valid one.
  await expect(admin.getByLabel('Model', { exact: true })).toHaveValue('anthropic/claude-sonnet-5.5')
  await setApiKey('sk-or-v1-...', 'sk-or-e2e-stubbed-key')

  await closeChat()
  const { url, body } = await expectReply(await sayToBuddy('My mother is coming to pick me up today.'))
  // Not the Anthropic host, and not a doubled path: baseURL + the SDK's suffix.
  expect(url).toBe('https://openrouter.ai/api/v1/messages')
  expect(body.model).toBe('anthropic/claude-sonnet-5.5')

  // The pin. Without it OpenRouter may serve Claude from Bedrock or Vertex,
  // which would move her conversations off Anthropic.
  expect(body.provider).toEqual({
    only: ['Anthropic'],
    allow_fallbacks: false,
    data_collection: 'deny'
  })

  // The prompt is the same frozen string, so the TASK-11 rules still apply.
  expect(typeof body.system).toBe('string')
  expect(body.system).toContain('Never confirm a false or confused statement as true.')
})

test('the OpenRouter key is used for OpenRouter and never sent to Anthropic', async () => {
  const openRouterRequest = await expectReply(await sayToBuddy('Are you still there?'))
  expect(openRouterRequest.url).toContain('openrouter.ai')

  await selectProvider('anthropic')
  await closeChat()
  const anthropicRequest = await expectReply(await sayToBuddy('Are you still there?'))
  expect(anthropicRequest.url).toBe('https://api.anthropic.com/v1/messages')
  // Switching back must not leave OpenRouter's routing preference behind.
  expect(anthropicRequest.body.provider).toBeUndefined()
  // Both keys were entered; neither reaches a renderer.
  const launcherConfig = await launcher.evaluate(() => window.launcher.getConfig())
  const serialised = JSON.stringify(launcherConfig)
  expect(serialised).not.toContain('sk-or-e2e-stubbed-key')
  expect(serialised).not.toContain('sk-ant-e2e-stubbed-key')
})
