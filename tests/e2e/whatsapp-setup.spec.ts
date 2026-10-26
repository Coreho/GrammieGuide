import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

// Keep an operation trace if an intermittent sign-in wait fails again.
test.use({ trace: 'retain-on-failure' })

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

async function recoveryFixture(failFirstLoad = false): Promise<{
  app: import('@playwright/test').ElectronApplication
  home: import('@playwright/test').Page
  admin: import('@playwright/test').Page
  folder: string
}> {
  const folder = await mkdtemp(join(tmpdir(), 'grammie-whatsapp-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`, '--use-fake-device-for-media-stream'],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  try {
    const home = app.context().pages()[0] ?? (await app.context().waitForEvent('page'))
    await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
    await app.evaluate(
      ({ session }, fixture) => {
        let failed = false
        session.fromPartition('persist:whatsapp').protocol.handle('https', () => {
          if (fixture.failFirstLoad && !failed) {
            failed = true
            return Response.error()
          }
          return new Response(fixture.html, { headers: { 'content-type': 'text/html' } })
        })
      },
      { html: CALL_FIXTURE, failFirstLoad }
    )
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
    await admin.evaluate(async () => {
      await window.admin.saveContactSettings({
        enabled: false,
        preferred: { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
        fallback: null,
        expiryMinutes: 10,
        fallbackAfterMinutes: 2
      })
      await window.admin.setConfig({
        tiles: [
          {
            id: 'family-calls',
            type: 'builtin',
            builtinKey: 'calls',
            label: 'Family calls',
            colorIndex: 0,
            size: 'normal',
            slot: 0
          }
        ]
      })
    })
    return { app, home, admin, folder }
  } catch (error) {
    await app.close()
    await removeProfile(folder)
    throw error
  }
}

test('the isolated linked-account fixture and caregiver PIN survive a full app process restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'grammie-whatsapp-'))
  let current: import('@playwright/test').ElectronApplication | undefined
  try {
    for (const pass of [0, 1]) {
      const app = await electron.launch({
        args: ['.', `--user-data-dir=${folder}`],
        cwd: process.cwd(),
        env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
      })
      current = app
      const home = app.context().pages()[0] ?? (await app.context().waitForEvent('page'))
      await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
      const linked = await app.evaluate(async ({ session }) => {
        const isolated = session.fromPartition('persist:whatsapp')
        const hasFixtureLink = (await isolated.cookies.get({ name: 'fixture-link' })).length === 1
        isolated.protocol.handle(
          'https',
          () =>
            new Response(
              hasFixtureLink
                ? '<!doctype html><div id="pane-side">Fixture signed in</div>'
                : '<!doctype html><div data-ref="fixture"><canvas width="120" height="120"></canvas></div>',
              { headers: { 'content-type': 'text/html' } }
            )
        )
        return hasFixtureLink
      })
      expect(linked).toBe(pass === 1)
      const opened = app.context().waitForEvent('page')
      await app.evaluate(() => {
        ;(
          globalThis as unknown as { __e2e__: { createAdminWindow: () => void } }
        ).__e2e__.createAdminWindow()
      })
      const admin = await opened
      if (pass === 0) {
        await admin.getByPlaceholder('4-8 digit PIN').fill('1234')
        await admin.getByPlaceholder('Confirm PIN').fill('1234')
        await admin.getByRole('button', { name: 'Set PIN' }).click()
      } else {
        await admin.getByPlaceholder('Enter PIN').fill('1234')
        await admin.getByRole('button', { name: 'Unlock', exact: true }).click()
      }
      await admin.evaluate(() => window.admin.openWhatsAppSetup())
      await expect
        .poll(() => admin.evaluate(() => window.admin.getWhatsAppSetup()))
        .toMatchObject({ open: true, phase: pass === 0 ? 'link-required' : 'linked' })
      if (pass === 0) {
        await app.evaluate(async ({ webContents, session }) => {
          const page = webContents
            .getAllWebContents()
            .find((c) => c.getURL() === 'https://web.whatsapp.com/')!
          await page.executeJavaScript(
            'document.body.innerHTML = \'<div id="pane-side">Fixture signed in</div>\''
          )
          const isolated = session.fromPartition('persist:whatsapp')
          await isolated.cookies.set({
            url: 'https://web.whatsapp.com/',
            name: 'fixture-link',
            value: 'not-a-credential',
            expirationDate: Date.now() / 1000 + 3600
          })
          await isolated.cookies.flushStore()
        })
      }
      await admin.evaluate(() => window.admin.closeWhatsAppSetup())
      await app.close()
      current = undefined
    }
  } finally {
    if (current && current.process().exitCode === null) await current.close()
    await removeProfile(folder)
  }
})

test('an enabled listener recovers from failed first load and a peer crash without opening the calling tile', async () => {
  const f = await recoveryFixture(true)
  const ready = async (): Promise<void> => {
    await expect
      .poll(() => f.home.evaluate(() => window.launcher.getWhatsAppState()), { timeout: 15_000 })
      .toMatchObject({
        connection: 'ready',
        call: null,
        pending: null,
        availableActions: ['voice']
      })
  }
  try {
    await test.step('Recover the initial failed load without a user retry', ready)
    const oldPeer = await f.app.evaluate(
      ({ webContents }) =>
        webContents.getAllWebContents().find((c) => c.getURL() === 'https://web.whatsapp.com/')!.id
    )
    await test.step('Crash only the fixture call renderer', async () => {
      await f.app.evaluate(
        ({ webContents }, id) => webContents.fromId(id)!.forcefullyCrashRenderer(),
        oldPeer
      )
      await expect
        .poll(() =>
          f.app.evaluate(
            ({ webContents }) =>
              webContents
                .getAllWebContents()
                .find((c) => c.getURL() === 'https://web.whatsapp.com/')?.id ?? null
          )
        )
        .not.toBe(oldPeer)
      await ready()
    })
    await test.step('Explicit stop disarms recovery', async () => {
      await f.home.evaluate(() => window.launcher.closeWhatsAppCalls())
      await f.admin.evaluate(() => window.admin.openWhatsAppSetup())
      await expect
        .poll(() => f.admin.evaluate(() => window.admin.getWhatsAppSetup()))
        .toMatchObject({ open: true, phase: 'linked' })
      await f.admin.evaluate(() => window.admin.closeWhatsAppSetup())
      expect(await f.home.evaluate(() => window.launcher.getWhatsAppState())).toMatchObject({
        connection: 'unavailable',
        call: null
      })
      expect(
        await f.app.evaluate(
          ({ webContents }) =>
            webContents
              .getAllWebContents()
              .filter((c) => c.getURL() === 'https://web.whatsapp.com/').length
        )
      ).toBe(0)
    })
  } finally {
    await f.app.close()
    await removeProfile(f.folder)
  }
})

test('account setup close and caregiver lock restore an already requested incoming listener', async () => {
  const f = await recoveryFixture()
  const ready = async (): Promise<void> => {
    await expect
      .poll(() => f.home.evaluate(() => window.launcher.getWhatsAppState()), { timeout: 15_000 })
      .toMatchObject({ connection: 'ready', call: null })
  }
  try {
    await ready()
    await test.step('Inspect account setup then restore the existing listener', async () => {
      await f.admin.evaluate(() => window.admin.openWhatsAppSetup())
      await expect
        .poll(() => f.admin.evaluate(() => window.admin.getWhatsAppSetup()))
        .toMatchObject({ open: true, phase: 'linked' })
      await f.admin.evaluate(() => window.admin.closeWhatsAppSetup())
      await ready()
    })
    await test.step('Locking the caregiver panel closes setup and restores Home calling', async () => {
      await f.admin.evaluate(() => window.admin.openWhatsAppSetup())
      await expect
        .poll(() => f.admin.evaluate(() => window.admin.getWhatsAppSetup()))
        .toMatchObject({ open: true, phase: 'linked' })
      await f.admin.evaluate(() => window.admin.lock())
      await ready()
    })
  } finally {
    await f.app.close()
    await removeProfile(f.folder)
  }
})

test('missed, declined and remotely ended calls recover, and idle offline signaling never offers Start', async () => {
  const f = await recoveryFixture()
  const provider = async (script: string): Promise<void> => {
    await f.app.evaluate(async ({ webContents }, code) => {
      const p = webContents
        .getAllWebContents()
        .find((c) => c.getURL() === 'https://web.whatsapp.com/')!
      await p.executeJavaScript(code)
    }, script)
  }
  const idle = async (): Promise<void> => {
    await expect
      .poll(() => f.home.evaluate(() => window.launcher.getWhatsAppState()), { timeout: 15_000 })
      .toMatchObject({
        connection: 'ready',
        call: null,
        pending: null,
        availableActions: ['voice']
      })
  }
  try {
    await idle()
    await test.step('Missed incoming call clears without a new outbound call', async () => {
      await provider('window.fixtureSetCall(3)')
      await expect(f.home.getByRole('heading', { name: 'Sarah is calling' })).toBeVisible()
      await provider('window.fixtureSetCall(0)')
      await idle()
    })
    await test.step('Decline goes through the scoped provider call ID', async () => {
      await provider('window.fixtureSetCall(3)')
      await expect(f.home.getByRole('heading', { name: 'Sarah is calling' })).toBeVisible()
      const state = await f.home.evaluate(() => window.launcher.getWhatsAppState())
      expect(
        (
          await f.home.evaluate(
            (id) => window.launcher.controlWhatsApp({ type: 'decline', callId: id }),
            state.call!.id
          )
        ).ok
      ).toBe(true)
      await idle()
    })
    await test.step('Signaling loss preserves observed media, then remote end clears audio holds', async () => {
      await provider('window.fixtureSetCall(3)')
      await expect(f.home.getByRole('button', { name: 'Answer', exact: true })).toBeVisible()
      await f.home.getByRole('button', { name: 'Answer', exact: true }).click()
      await expect(f.home.getByRole('heading', { name: 'Talking with Sarah' })).toBeVisible()
      await provider('window.fixtureOffline = true')
      expect(await f.home.evaluate(() => window.launcher.getWhatsAppState())).toMatchObject({
        call: { phase: 'connected' }
      })
      await provider('window.fixtureSetCall(0)')
      await idle()
      expect(await f.home.evaluate(() => window.launcher.getAudio())).toMatchObject({
        decision: { hasHold: false }
      })
    })
    await test.step('Idle offline state disables Start and recovers on reconnect', async () => {
      await provider('window.fixtureOffline = true')
      await expect
        .poll(() => f.home.evaluate(() => window.launcher.getWhatsAppState()))
        .toMatchObject({ connection: 'disconnected', call: null, availableActions: [] })
      expect(
        (
          await f.home.evaluate(() =>
            window.launcher.controlWhatsApp({
              type: 'start',
              contactId: 'preferred',
              mode: 'voice'
            })
          )
        ).ok
      ).toBe(false)
      await provider('window.fixtureOffline = false')
      await idle()
    })
  } finally {
    await f.app.close()
    await removeProfile(f.folder)
  }
})

// All calling below is a local protocol fixture. It never contacts WhatsApp or a
// phone, and is deliberately different from the real provider implementation.
const CALL_FIXTURE = `<!doctype html><title>Fixture calls</title><div id="pane-side">Fixture</div><script>
(() => {
  let state = 0, activeCall = null;
  const states = { None:0, Calling:1, ReceivedCall:3, AcceptSent:4, CallActive:6,
    CallActiveElseWhere:7, ReceivedCallWithoutOffer:8, Rejoining:9, ConnectedLonely:11,
    PreCalling:12, CallStateEnding:13 };
  const calls = { get activeCall() { return activeCall; }, getModelsArray: () => [] };
  const set = (next, unknown = false) => {
    state = next;
    activeCall = next ? { id:'fixture-call', peerJid:unknown ? 'unresolved@lid' : '15551111111@c.us',
      isVideo:false, isGroup:false, getState: () => state } : null;
  };
  const stack = { type:'web', acceptCall:async () => set(6), rejectCall:async () => set(0),
    endCall:async () => { if (window.fixtureHangEnd) return new Promise(() => {}); set(0); } };
  const modules = {
    WAComms:{isSocketConnected:()=>!window.fixtureOffline},
    WAWebVoipGatingUtils:{ isCallingEnabled:()=>true, isWebCallingUiEnabled:()=>true, isUnsupportedBrowserForWebCalling:()=>false },
    WAWebVoipStackInterface:{ getCachedVoipStackInterface:()=>stack },
    WAWebCallCollection:calls, WAWebVoipWaCallEnums:{CallState:states},
    WAWebVoipLocalCallStateStore:{getLocalCallState:()=>state},
    WAWebVoipStartCall:{startWAWebVoipCall:async () => {
      if (window.fixtureRejectStart) return false;
      if (!window.fixtureLookupReady) throw new Error('Recipient must be resolved before calling');
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
      stream.getTracks().forEach(track => track.stop());
      state = 12;
      setTimeout(() => set(1), 100);
      return true;
    }},
    WAWebLidMigrationUtils:{toPn:peer=>peer,toLid:peer=>peer},
    WAWebQueryExistsJob:{queryPhoneExists:async () => { window.fixtureLookupReady = true; return {wid:'fixture-peer@lid'}; }},
    WAWebVoipSignalingEnums:{EndCallReason:{Self:2}}
  };
  window.require = name => modules[name];
  window.fixtureSetCall = set;
})();
</script>`

test('Family calls stays in GrammieGuide, observes connected state, handles incoming and tears down a hung call', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'grammie-whatsapp-'))
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${folder}`, '--use-fake-device-for-media-stream'],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  try {
    const home = app.context().pages()[0] ?? (await app.context().waitForEvent('page'))
    await expect(home.getByText(/No tiles configured yet/)).toBeVisible({ timeout: 15_000 })
    await app.evaluate(({ session }, html) => {
      session
        .fromPartition('persist:whatsapp')
        .protocol.handle(
          'https',
          () => new Response(html, { headers: { 'content-type': 'text/html' } })
        )
    }, CALL_FIXTURE)
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
    await admin.evaluate(async () => {
      await window.admin.saveContactSettings({
        enabled: false,
        preferred: { id: 'preferred', name: 'Sarah', phone: '+15551111111' },
        fallback: null,
        expiryMinutes: 10,
        fallbackAfterMinutes: 2
      })
      await window.admin.setConfig({
        tiles: [
          {
            id: 'family-calls',
            type: 'builtin',
            builtinKey: 'calls',
            label: 'Family calls',
            colorIndex: 0,
            size: 'normal',
            slot: 0
          }
        ]
      })
    })
    await home.getByRole('button', { name: 'Family calls', exact: true }).click()
    await expect(home.getByRole('button', { name: 'Call Sarah', exact: true })).toBeEnabled()
    await home.getByRole('button', { name: 'Call Sarah', exact: true }).click()
    await expect(home.getByRole('heading', { name: 'Calling Sarah…' })).toBeVisible()
    await expect
      .poll(() => home.evaluate(() => window.launcher.getWhatsAppState()))
      .toMatchObject({ pending: null, call: { phase: 'outgoing' } })
    const provider = async (script: string): Promise<void> => {
      await app.evaluate(async ({ webContents }, code) => {
        const page = webContents
          .getAllWebContents()
          .find((c) => c.getURL() === 'https://web.whatsapp.com/')!
        await page.executeJavaScript(code)
      }, script)
    }
    await provider('window.fixtureSetCall(11)')
    await expect
      .poll(async () => (await home.evaluate(() => window.launcher.getWhatsAppState())).call?.phase)
      .toBe('connecting')
    await expect(home.getByText('Talking with Sarah', { exact: true })).toHaveCount(0)
    await provider('window.fixtureSetCall(6)')
    await expect(home.getByRole('heading', { name: 'Talking with Sarah' })).toBeVisible()
    const publicState = await home.evaluate(() => window.launcher.getWhatsAppState())
    expect(JSON.stringify(publicState)).not.toContain('15551111111')
    expect(JSON.stringify(publicState)).not.toContain('fixture-call')
    expect(await home.evaluate(() => window.launcher.getAudio())).toMatchObject({
      decision: { hasHold: true, muteWebPage: true }
    })
    await home.screenshot({ path: 'test-results/whatsapp-family-call.png' })
    await home.getByRole('button', { name: 'End call', exact: true }).click()
    await expect(home.getByRole('button', { name: 'Call Sarah', exact: true })).toBeEnabled()
    await home.getByRole('button', { name: 'Back to Home', exact: true }).click()
    await provider('window.fixtureSetCall(3)')
    await expect(home.getByRole('heading', { name: 'Sarah is calling' })).toBeVisible()
    await home.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(home.getByRole('heading', { name: 'Talking with Sarah' })).toBeVisible()
    const hungPeerId = await app.evaluate(
      ({ webContents }) =>
        webContents.getAllWebContents().find((c) => c.getURL() === 'https://web.whatsapp.com/')!.id
    )
    await provider('window.fixtureHangEnd = true')
    await home.getByRole('button', { name: 'End call and go Home', exact: true }).click()
    await expect
      .poll(() => home.evaluate(() => window.launcher.getWhatsAppState()), { timeout: 15_000 })
      .toMatchObject({ call: null, pending: null })
    await expect(home.getByRole('dialog', { name: 'Family calls' })).toHaveCount(0, {
      timeout: 15_000
    })
    // The old hung peer is destroyed; a fresh idle peer may reconnect for future
    // incoming calls because the caregiver has kept the calling tile enabled.
    expect(
      await app.evaluate(
        ({ webContents }, id) => webContents.getAllWebContents().some((c) => c.id === id),
        hungPeerId
      )
    ).toBe(false)
    expect(await home.evaluate(() => window.launcher.getWhatsAppState())).toMatchObject({
      call: null
    })
    expect(await home.evaluate(() => window.launcher.getAudio())).toMatchObject({
      decision: { hasHold: false }
    })
    await home.getByRole('button', { name: 'Family calls', exact: true }).click()
    await expect(home.getByRole('button', { name: 'Call Sarah', exact: true })).toBeEnabled()
    await provider('window.fixtureSetCall(3, true)')
    await expect(home.getByRole('heading', { name: 'Someone is calling' })).toBeVisible()
    await expect(home.getByRole('button', { name: 'Answer', exact: true })).toHaveCount(0)
    await home.getByRole('button', { name: 'No, thank you', exact: true }).click()
    await expect(home.getByRole('button', { name: 'Call Sarah', exact: true })).toBeEnabled()
    await provider('window.fixtureRejectStart = true')
    await home.getByRole('button', { name: 'Call Sarah', exact: true }).click()
    await expect(home.getByRole('alert')).toHaveText(
      'The call could not be started. Go Back to Home, then open Family calls to try again.'
    )
    await expect(home.getByRole('button', { name: 'End call', exact: true })).toHaveCount(0)
  } finally {
    await app.close()
    await removeProfile(folder)
  }
})
