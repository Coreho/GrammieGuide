import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Buddy fills his floor at any screen size (TASK-38).
 *
 * The bug: Stage scales itself with a CSS transform, and R3F measured the canvas
 * with getBoundingClientRect, which already includes that scale. The canvas was
 * therefore sized in scaled pixels and then scaled again - he roamed only part of
 * his floor, floated, and his tap target left the Stage entirely on a large
 * screen. A transform change also never fires ResizeObserver, so it never recovered
 * on resize. The fix is `resize={{ offsetSize: true }}` on the Canvas, which makes
 * it measure layout pixels.
 */

let app: ElectronApplication
let page: Page
/** Anything the page reported as broken, so a silent WebGL failure cannot pass. */
const problems: string[] = []

/** Only Buddy is on screen here: the admin window is never opened. */
async function setSize(width: number, height: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setContentSize(w as number, h as number)
    win.moveTop()
    win.focus()
  }, [width, height])
  // An occluded window would never report the new size, so poll rather than wait.
  await expect
    .poll(
      () => page.evaluate(() => [window.innerWidth, window.innerHeight]),
      { timeout: 10_000 }
    )
    .toEqual([width, height])
}

type Box = { x: number; y: number; width: number; height: number }

/** The canvas, the floor strip it must fill, and the Stage root they sit in. */
async function measure(): Promise<{
  canvasOffset: [number, number]
  layerOffset: [number, number]
  canvasBox: Box
  layerBox: Box
  stageOffset: [number, number]
}> {
  return page.evaluate(() => {
    const layer = document.querySelector('[data-buddy-activity]') as HTMLElement | null
    const canvas = layer?.querySelector('canvas') ?? null
    const floor = document.querySelector('[data-buddy-floor]') as HTMLElement | null
    const stage = floor?.offsetParent as HTMLElement | null
    if (!layer || !canvas || !floor || !stage) throw new Error('Buddy did not render')
    const rect = (el: Element): Box => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    return {
      canvasOffset: [canvas.offsetWidth, canvas.offsetHeight],
      layerOffset: [layer.offsetWidth, layer.offsetHeight],
      canvasBox: rect(canvas),
      layerBox: rect(layer),
      stageOffset: [stage.offsetWidth, stage.offsetHeight]
    }
  })
}

/** The one assertion set AC2 and AC3 share, polled so nothing depends on timing. */
async function expectCanvasFillsFloor(): Promise<void> {
  await expect
    .poll(async () => {
      const m = await measure()
      return {
        // Same size as the strip it sits in...
        sameOffset: m.canvasOffset[0] === m.layerOffset[0] && m.canvasOffset[1] === m.layerOffset[1],
        floor: m.layerOffset.join('x'),
        // ...filling it exactly, and the Stage is still the fixed design size.
        withinBox:
          Math.abs(m.canvasBox.x - m.layerBox.x) <= 1 &&
          Math.abs(m.canvasBox.y - m.layerBox.y) <= 1 &&
          Math.abs(m.canvasBox.width - m.layerBox.width) <= 1 &&
          Math.abs(m.canvasBox.height - m.layerBox.height) <= 1,
        stage: m.stageOffset.join('x')
      }
    })
    .toEqual({ sameOffset: true, floor: '1440x250', withinBox: true, stage: '1440x900' })
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'grammieguide-canvas-'))}`],
    cwd: process.cwd(),
    env: { ...process.env, GRAMMIEGUIDE_E2E: '1' }
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-buddy-activity]')
})

test.afterAll(async () => {
  await app?.close()
})

// Sizes are multiples of 4 because this display runs at 125%.
for (const [width, height] of [
  [1264, 760],
  [1440, 900],
  [1920, 1080]
]) {
  test(`his canvas fills his floor at ${width}x${height}`, async () => {
    await setSize(width, height)
    await page.reload()
    await page.waitForSelector('[data-buddy-activity]')
    await expectCanvasFillsFloor()
  })
}

test('a resize without a reload corrects the canvas too', async () => {
  await setSize(1264, 760)
  await page.reload()
  await page.waitForSelector('[data-buddy-activity]')
  await expectCanvasFillsFloor()

  // No reload: the old size was measured through the old scale and would have
  // stayed stale, because a transform change fires no ResizeObserver.
  await setSize(1920, 1080)
  await expectCanvasFillsFloor()

  expect(problems).toEqual([])
})

test('he stays on his floor at both ends, at 1920x1080', async () => {
  test.setTimeout(180_000)
  // Pinning the target picker makes both walks deterministic. It also pins
  // three.js's generateUUID, so he may play the wrong animation while walking -
  // movement and arrival come from his position, which is what this is about.
  await page.addInitScript(() => {
    Math.random = () => 0.999
  })
  // 23:00, so no unprompted strolls get in the way; a commanded walk still works.
  await page.clock.install({ time: new Date(2026, 8, 26, 23, 0) })
  await page.clock.resume()

  await setSize(1920, 1080)
  await page.reload()
  await page.waitForSelector('[data-buddy-activity]')
  await expectCanvasFillsFloor()

  // From here on only page errors matter: the pinned randomness above makes
  // three.js noisy on the console.
  const walkErrors: string[] = []
  page.on('pageerror', (error) => walkErrors.push(error.message))

  /** His tap target must never leave the Stage, at any point during a walk. */
  async function expectTapInsideStage(): Promise<void> {
    const boxes = await page.evaluate(() => {
      const tap = document.querySelector('[data-buddy-tap]') as HTMLElement | null
      const floor = document.querySelector('[data-buddy-floor]') as HTMLElement | null
      const stage = floor?.offsetParent as HTMLElement | null
      if (!tap || !stage) throw new Error('Buddy did not render')
      const t = tap.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      return {
        inside:
          t.left >= s.left - 1 &&
          t.right <= s.right + 1 &&
          t.top >= s.top - 1 &&
          t.bottom <= s.bottom + 1,
        activity: document.querySelector('[data-buddy-activity]')?.getAttribute('data-buddy-activity'),
        target: document.querySelector('[data-buddy-activity]')?.getAttribute('data-buddy-target')
      }
    })
    expect(boxes.inside).toBe(true)
    return boxes
  }

  for (const expected of ['0.06', '0.939']) {
    await page.keyboard.press('Control+Shift+B')
    await page.getByRole('menuitem', { name: 'Take a walk' }).click()
    await expect(page.locator('[data-buddy-activity]')).toHaveAttribute(
      'data-buddy-activity',
      'strolling'
    )
    const target = await page
      .locator('[data-buddy-activity]')
      .getAttribute('data-buddy-target')
    expect(target?.startsWith(expected.slice(0, 4))).toBe(true)

    // Advance 250ms of page time at a time, checking containment every step.
    let arrived = false
    for (let step = 0; step < 240 && !arrived; step++) {
      await page.clock.runFor(250)
      arrived = (await expectTapInsideStage()).activity !== 'strolling'
    }
    expect(arrived, `he never arrived at ${expected}`).toBe(true)
    // ...and once more, now that he is standing still.
    await expectTapInsideStage()
  }

  expect(walkErrors).toEqual([])
})