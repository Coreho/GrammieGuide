import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('a lost submission recovers as unknown and saved outcomes stay behind the caregiver gate', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'grammie-contact-e2e-'))
  const createdAt = Date.now()
  const contact = { id: 'primary', phone: '+15551111111' }
  const path = join(folder, 'contact-requests.json')
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      requests: [
        {
          id: 'lost-request',
          purpose: 'real',
          status: 'sending',
          createdAt,
          updatedAt: createdAt,
          expiresAt: createdAt + 600_000,
          fallbackAfterMs: 60_000,
          contacts: [contact],
          attempts: [{ ...contact, startedAt: createdAt, status: 'sending' }]
        }
      ]
    })
  )
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  try {
    const home = await app.firstWindow()
    await expect(home.getByText(/No tiles configured yet/i)).toBeVisible({ timeout: 15_000 })
    const newWindow = app.waitForEvent('window')
    await app.evaluate(() => {
      ;(
        globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
      ).__e2e__.createAdminWindow()
    })
    const admin = await newWindow
    await admin.waitForLoadState('domcontentloaded')
    expect(
      await admin.evaluate(() =>
        window.admin.listContactRequests().then(
          () => 'unexpected success',
          (error: Error) => error.message
        )
      )
    ).toContain('admin unlock required')
    await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
    await admin.getByPlaceholder('Confirm PIN').fill('2468')
    await admin.getByRole('button', { name: 'Set PIN' }).click()
    await expect(admin.getByRole('button', { name: 'Lock', exact: true })).toBeVisible()
    const result = await admin.evaluate(() => window.admin.listContactRequests())
    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('unknown')
    expect(result[0]?.attempts).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain(contact.phone)
    const saved = JSON.parse(await readFile(path, 'utf8'))
    expect(saved.requests[0].status).toBe('unknown')
    expect(saved.requests[0].attempts).toHaveLength(1)
    expect(saved.requests[0].attempts[0].sid).toBeUndefined()
    await admin.getByRole('button', { name: 'Lock', exact: true }).click()
    expect(
      await admin.evaluate(() =>
        window.admin.listContactRequests().then(
          () => 'unexpected success',
          (error: Error) => error.message
        )
      )
    ).toContain('admin unlock required')
  } finally {
    await app.close()
    await rm(folder, { recursive: true, force: true })
  }
})
