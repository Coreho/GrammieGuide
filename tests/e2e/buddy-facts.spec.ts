import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('caregiver adds, edits, cancels and removes Buddy facts without logging content', async () => {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'gg-facts-'))}`],
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const opened = app.waitForEvent('window')
    await app.evaluate(() =>
      (
        globalThis as unknown as { __e2e__: { createAdminWindow(): void } }
      ).__e2e__.createAdminWindow()
    )
    const admin = await opened
    await admin.getByPlaceholder('4-8 digit PIN').fill('2468')
    await admin.getByPlaceholder('Confirm PIN').fill('2468')
    await admin.getByRole('button', { name: 'Set PIN', exact: true }).click()
    await admin.getByRole('button', { name: 'Buddy', exact: true }).click()
    const facts = admin.getByRole('region', { name: 'Buddy personal facts' })
    await facts.getByLabel('Personal detail', { exact: true }).fill('Sarah is her granddaughter.')
    await facts.getByRole('button', { name: 'Add personal detail', exact: true }).click()
    await expect(
      facts.getByRole('button', { name: 'Edit fact: Sarah is her granddaughter.' })
    ).toBeVisible()
    await facts.getByRole('button', { name: 'Edit fact: Sarah is her granddaughter.' }).click()
    await facts.getByLabel('Personal detail', { exact: true }).fill('Sarah loves gardening.')
    await facts.getByRole('button', { name: 'Save personal detail', exact: true }).click()
    await expect(
      facts.getByRole('button', { name: 'Edit fact: Sarah loves gardening.' })
    ).toBeVisible()
    await facts.getByLabel('Detail type').selectOption('plan')
    await facts.getByLabel('Personal detail', { exact: true }).fill('Sarah plans to visit for tea.')
    await facts.getByLabel('Plan date').fill('2026-12-25')
    await facts.getByLabel('Plan cancelled').check()
    await facts.getByRole('button', { name: 'Add personal detail', exact: true }).click()
    await expect(facts.getByText(/2026-12-25 \(cancelled\)/)).toBeVisible()
    await facts.getByRole('button', { name: 'Edit fact: Sarah plans to visit for tea.' }).click()
    await facts.getByLabel('Detail type').selectOption('family')
    await facts.getByRole('button', { name: 'Save personal detail', exact: true }).click()
    await expect
      .poll(() =>
        admin.evaluate(() =>
          window.admin.getConfig().then((c) => c.buddy.personalFacts[1]?.cancelled)
        )
      )
      .toBe(false)
    await facts.screenshot({ path: 'test-results/buddy-facts.png' })
    await facts.getByRole('button', { name: 'Remove fact: Sarah loves gardening.' }).click()
    await expect(
      facts.getByRole('button', { name: 'Edit fact: Sarah loves gardening.' })
    ).toHaveCount(0)
    const config = await admin.evaluate(() => window.admin.getConfig())
    expect(config.buddy.personalFacts).toHaveLength(1)
    expect(config.buddy.personalFacts[0]?.cancelled).toBe(false)
    const log = await admin.evaluate(() => window.admin.getActivityLog())
    expect(JSON.stringify(log)).not.toContain('Sarah')
  } finally {
    await app.close()
  }
})
