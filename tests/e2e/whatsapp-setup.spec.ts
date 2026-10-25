import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

async function removeProfile(folder: string): Promise<void> {
  const target = resolve(folder)
  if (
    !target.startsWith(resolve(tmpdir()) + sep) ||
    !basename(target).startsWith('grammie-whatsapp-')
  )
    throw new Error('Unexpected test profile path')
  await rm(target, { recursive: true, force: true, maxRetries: 3 })
}

test('isolated in-app WhatsApp setup links, closes and cannot enable calling from a sign-in marker', async () => {
  const folder = await test.step('Create a fresh profile', () =>
    mkdtemp(join(tmpdir(), 'grammie-whatsapp-')))
  const app = await test.step('Launch the built app', () =>
    electron.launch({
      args: ['.', `--user-data-dir=${folder}`],
      cwd: process.cwd(),
      env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
    }))
  try {
    const home = await test.step('Find Home', async () =>
      app.context().pages()[0] ?? (await app.context().waitForEvent('page')))
    await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
    // A fresh test-only profile intercepts this partition's network. No request
    // reaches WhatsApp, and no real account, phone number, or media device is used.
    await app.evaluate(({ session }) => {
      session
        .fromPartition('persist:whatsapp')
        .protocol.handle(
          'https',
          () =>
            new Response(
              '<!doctype html><title>Fixture setup</title><div data-ref="fixture"><canvas width="120" height="120"></canvas></div>',
              { headers: { 'content-type': 'text/html' } }
            )
        )
    })
    const opened = app.context().waitForEvent('page')
    await app.evaluate(() => {
      ;(
        globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
      ).__e2e__.createAdminWindow()
    })
    const admin = await opened
    await admin.getByPlaceholder('4-8 digit PIN').fill('1234')
    await admin.getByPlaceholder('Confirm PIN').fill('1234')
    await admin.getByRole('button', { name: 'Set PIN' }).click()
    await admin.getByRole('button', { name: 'Contacts', exact: true }).click()
    await admin.getByRole('button', { name: 'Open WhatsApp setup', exact: true }).click()
    await expect
      .poll(() => admin.evaluate(() => window.admin.getWhatsAppSetup()))
      .toEqual({ open: true, phase: 'link-required' })
    expect(
      await app.evaluate(
        ({ webContents }) =>
          webContents
            .getAllWebContents()
            .filter((contents) => contents.getURL() === 'https://web.whatsapp.com/').length
      )
    ).toBe(1)
    await app.evaluate(async ({ webContents, session }) => {
      const page = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'https://web.whatsapp.com/')!
      await page.executeJavaScript(
        'document.body.innerHTML = \'<div id="pane-side">Fixture signed-in shell</div>\''
      )
      await session.fromPartition('persist:whatsapp').cookies.set({
        url: 'https://web.whatsapp.com/',
        name: 'fixture-link',
        value: 'not-a-credential'
      })
    })
    await expect
      .poll(() => admin.evaluate(() => window.admin.getWhatsAppSetup()))
      .toEqual({ open: true, phase: 'linked' })
    expect(await admin.evaluate(() => window.admin.getWhatsAppState())).toMatchObject({
      connection: 'unavailable',
      availableActions: []
    })
    await admin.getByRole('button', { name: 'Close WhatsApp setup', exact: true }).click()
    await expect
      .poll(() =>
        app.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((contents) => contents.getURL() === 'https://web.whatsapp.com/').length
        )
      )
      .toBe(0)
    expect(
      await app.evaluate(async ({ session }) => ({
        own: (await session.fromPartition('persist:whatsapp').cookies.get({ name: 'fixture-link' }))
          .length,
        web: (await session.fromPartition('persist:web').cookies.get({ name: 'fixture-link' }))
          .length,
        home: (await session.defaultSession.cookies.get({ name: 'fixture-link' })).length
      }))
    ).toEqual({ own: 1, web: 0, home: 0 })
  } finally {
    await app.close()
    await removeProfile(folder)
  }
})
