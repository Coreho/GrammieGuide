import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BUDDY_SYSTEM_PROMPT } from '../../src/main/services/ai/buddyPrompt'
let app: ElectronApplication, home: Page, admin: Page
test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammie-chatgpt-prompt-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1', GRAMMIEGUIDE_E2E_CHATGPT: '1' }
  })
  home = await app.firstWindow()
  const opened = app.waitForEvent('window')
  await app.evaluate(() => {
    ;(
      globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
    ).__e2e__.createAdminWindow()
  })
  admin = await opened
  await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
  await admin.getByPlaceholder('Confirm PIN').fill('2468')
  await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
  await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
  await admin.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click()
  await app.evaluate(async () => {
    await (
      globalThis as unknown as { __e2e__: { chatGptFixture: (action: string) => Promise<unknown> } }
    ).__e2e__.chatGptFixture('complete')
  })
  await expect(admin.getByRole('button', { name: 'Got it', exact: true })).toBeVisible()
  await admin.getByRole('button', { name: 'Got it', exact: true }).click()
  await admin.getByRole('button', { name: 'Load ChatGPT models', exact: true }).click()
  await admin.getByRole('button', { name: 'Test ChatGPT reply', exact: true }).click()
  await expect(
    admin.getByRole('button', { name: 'Use this model for Buddy', exact: true })
  ).toBeEnabled()
  await admin.getByRole('button', { name: 'Use this model for Buddy', exact: true }).click()
})
test.afterAll(async () => {
  await app?.close()
})
async function request(): Promise<{
  instructions: string
  model: string
  input: { role: string; content: string }[]
  tools: { type: string; name: string; tools: { name: string }[] }[]
  store: boolean
  stream: boolean
}> {
  return (await app.evaluate(
    async () =>
      await (
        globalThis as unknown as {
          __e2e__: { chatGptFixture: (action: string) => Promise<unknown> }
        }
      ).__e2e__.chatGptFixture('request')
  )) as Awaited<ReturnType<typeof request>>
}
test('ChatGPT receives the frozen prompt, discovered model, full sanitized history and only approved namespaced tools', async () => {
  const reply = await home.evaluate(() =>
    window.launcher.buddyChat([
      { role: 'assistant', text: 'Discard greeting' },
      { role: 'user', text: ' Hello ' },
      { role: 'user', text: ' How are you? ' }
    ])
  )
  expect(reply).toEqual({ ok: true, reply: 'Hello from Buddy.' })
  const body = await request()
  expect(body.instructions).toBe(BUDDY_SYSTEM_PROMPT)
  expect(body.model).toBe('fixture-model')
  expect(body.store).toBe(false)
  expect(body.stream).toBe(true)
  expect(body.input).toHaveLength(1)
  expect(body.input[0]!.role).toBe('user')
  expect(body.input[0]!.content).toContain('Hello\n\nHow are you?')
  expect(JSON.stringify(body)).not.toContain('Discard greeting')
  expect(body.tools[0]).toMatchObject({ type: 'namespace', name: 'buddy' })
  expect(body.tools[0]!.tools.map((tool) => tool.name)).toEqual([
    'play_my_music',
    'show_my_pictures',
    'go_home',
    'open_saved_tile',
    'do_a_gesture'
  ])
  expect(body).not.toHaveProperty('max_output_tokens')
})
test('current caregiver facts reach inference but never the activity log', async () => {
  await admin.evaluate(async () => {
    const cfg = await window.admin.getConfig()
    await window.admin.setConfig({
      buddy: {
        ...cfg.buddy,
        personalFacts: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            kind: 'family',
            text: 'Her sister is named Jean.',
            cancelled: false
          }
        ]
      }
    })
  })
  await home.evaluate(() =>
    window.launcher.buddyChat([{ role: 'user', text: 'What is my sister called?' }])
  )
  expect(JSON.stringify((await request()).input)).toContain('Her sister is named Jean.')
  expect(JSON.stringify(await admin.evaluate(() => window.admin.getActivityLog()))).not.toMatch(
    /sister|Jean/
  )
})
