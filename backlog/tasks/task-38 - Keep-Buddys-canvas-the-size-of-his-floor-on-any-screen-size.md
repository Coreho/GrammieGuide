---
id: TASK-38
title: Keep Buddy's canvas the size of his floor on any screen size
status: To Do
assignee: []
created_date: '2026-10-01 12:18'
updated_date: '2026-10-01 12:18'
labels:
  - autopilot
  - needs-human
dependencies: []
priority: high
type: bug
ordinal: 10
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Home's Stage is a fixed 1440x900 layout that Stage.tsx scales with a CSS transform. React Three Fiber's Canvas measures its container with react-use-measure's getBoundingClientRect, which already includes that transform, and then sets the canvas's CSS size to that result inside the scaled Stage, so the scale is applied twice. A window resize doesn't correct it either: the Stage's scale changes after the resize event, and transform changes never fire ResizeObserver.

Measured in the built app (planner probes):
- At 1266x763 (scale 0.848) the canvas is 1221x212 inside the 1440x250 floor strip. He roams only 85% of the floor and floats about 38px up, and it stays 1221x212 after a resize to 1440x900.
- On a fresh mount at 1920x1080 (scale 1.2) the canvas is 1728x300 inside the clipped strip. His feet are cut off, strolls past about 0.83 of the floor go off-screen, and his tap target leaves the Stage (about 1623 layout px at target 0.939).

The kiosk runs fullscreen at the device's own resolution, so she sees this every day unless the screen is exactly 1440x900.

The fix is one prop. FloorScene derives the zoom, his walking range and the tap-target and bubble projection from useThree().size, so measuring layout (offset) size fixes all of them: pass resize={{ offsetSize: true }} to Canvas. R3F 9.8.0 spreads it over its own {scroll, debounce} defaults, react-use-measure 2.1.7 swaps in offsetWidth/offsetHeight, and ResizeOptions types offsetSize, so it typechecks.

Test design:
- Sizes are multiples of 4 (1264x760, 1440x900, 1920x1080) because this dev display is 125% and setContentSize(1266,763) gives 1268x763. setContentSize(1920,1080) is not clamped on this screen (reviewer probe). Playwright runs the unpackaged build, so kiosk/fullscreen is off.
- The walk test drives time with Playwright's clock (page.clock.install + runFor), as handoff.spec's roaming test already does. Playwright's clock fakes requestAnimationFrame and performance.now, so his movement advances in fixed 16ms frames regardless of the real frame rate, CPU load from another worktree's e2e, or window occlusion. With the fix his floor is 1440x250, zoom 128.2 and usable 5.066 world units; at walk_casual 0.29 units/s walk 1 (0.78 -> 0.06) takes about 25s and walk 2 (0.06 -> 0.939) about 31s of page time, so the cap is 60s of page time per walk.

Out of scope: dpr stays [1, 1.5]. If he looks soft when scaled up on the kiosk, record a follow-up rather than raising GPU cost here.

Overlap: open PR #16 (TASK-15) edits BuddyFloor.tsx (hunks not adjacent to the Canvas props), the Behavior/Rendering/Commands bullets in CLAUDE.md and every Buddy bullet in the README, and PR #7 adds a README Buddy bullet. The README date line conflicts with every open PR whatever the order. Whoever merges second resolves those mechanical README conflicts and reruns buddy-canvas-size, handoff and m4-buddy-presence.

## Approach
Harness facts (the same for every task):
- Create the worktree and branch exactly as the harness's Setup line says (it branches from the previous task's branch). Don't create or switch other branches and don't touch the main checkout. Its local `main` is stale, so diff against origin/main or the PR base, never `main`.
- Run `npm ci` in the worktree. If node_modules/electron/dist is missing afterwards (npm 11 can skip install scripts, see README Setup), run `node node_modules/electron/install.js`.
- The next task's build starts while this task is in review, so two agents may run Electron e2e at once. Run every Playwright command through the shared lock wrapper: `node C:/Users/koreo/.grammieguide-e2e-run.cjs <spec paths>`. Never call `npx playwright test` or `npm run test:e2e` directly. If the wrapper file is missing, create it first with exactly the content at the end of this approach. It waits up to 60 minutes for the lock directory ~/.grammieguide-e2e.lock, runs `npx playwright test <args>`, and always removes the lock; a lock whose owner process has died is cleared automatically. Pass spec paths only, because arguments are joined with spaces. Waiting can exceed the Bash tool's 10-minute foreground limit, so start multi-spec runs with run_in_background.
- Run `npm run build` before any e2e; Playwright launches this worktree's out/main/index.js.
- If a spec fails on a network-dependent step (example.com in m2-smoke, the Anthropic call in m4-buddy-chat), rerun that spec once through the wrapper before treating it as a regression.
- Read `backlog instructions task-execution` before adding notes to this task's Backlog entry.

1. src/renderer/launcher/src/buddy/BuddyFloor.tsx: add `resize={{ offsetSize: true }}` to <Canvas>, with a why-comment: the Stage is CSS-scaled, getBoundingClientRect includes that scale so R3F would apply it twice, and a transform change never fires ResizeObserver, so the canvas also never recovers on resize. Add one line to the file's header comment. Change nothing else; FloorScene's size-derived zoom, range and projection are correct once size is in layout pixels.

2. New tests/e2e/buddy-canvas-size.spec.ts, modeled on m4-buddy-presence.spec.ts (test.describe.configure({ mode: 'serial' }) or a single describe; one app launch in beforeAll with a fresh mkdtemp --user-data-dir and GRAMMIEGUIDE_E2E=1; a `problems` array fed by pageerror and console 'error').
- setSize(w, h): app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, h); win.moveTop(); win.focus() }, [w, h]). Only the launcher window exists because admin is never opened. Then expect.poll(() => page.evaluate(() => [innerWidth, innerHeight]), { timeout: 10_000 }) until both are within 2px.
- measure(): page.evaluate reading layer = document.querySelector('[data-buddy-activity]'), canvas = layer.querySelector('canvas'), floor = document.querySelector('[data-buddy-floor]'), stage = floor.offsetParent; return offsetWidth/offsetHeight and getBoundingClientRect() (x, y, width, height) for each.
- Size test: for [1264,760], [1440,900], [1920,1080]: setSize, page.reload(), expect the canvas visible, then expect.poll on measure() for AC2's assertions.
- Resize test: setSize(1264,760) and reload, then setSize(1920,1080) with no reload, then poll measure(). End with expect(problems).toEqual([]).
- Walk test, last because init scripts and the clock persist: test.setTimeout(180_000). page.addInitScript(() => { Math.random = () => 0.999 }); await page.clock.install({ time: new Date(2026, 8, 26, 23, 0) }); await page.clock.resume(). Night means no unprompted strolls or remarks between the commands, and deliberate walks still work at night. Then setSize(1920,1080), page.reload(), expect the canvas visible. Record only pageerror from here on. For each expected target in ['0.06' exact, then a value starting with '0.939']: press Control+Shift+B, click getByRole('menuitem', { name: 'Take a walk' }), expect data-buddy-activity 'strolling' and the data-buddy-target value. Then loop up to 240 times: await page.clock.runFor(250); in one page.evaluate read the [data-buddy-tap] and Stage root rects plus data-buddy-activity; assert tap.left >= stage.left - 1, tap.right <= stage.right + 1, tap.top >= stage.top - 1, tap.bottom <= stage.bottom + 1; break when activity is not 'strolling'. After the loop, expect the activity not to be 'strolling' (60s page-time cap) and assert containment once more.
- Expect walk 1 to take about 25s and walk 2 about 31s of page time. If one runs past the cap, debug the speed or target, not the cap.
- Known side effect, not a bug: pinning Math.random also pins three.js's generateUUID, so every AnimationClip gets the same uuid and AnimationMixer.clipAction returns one shared action. He may play the wrong animation while walking. Movement and ARRIVED come from his position in useFrame, so the test is unaffected, and handoff.spec already runs this way. Don't chase odd animation in debug screenshots.

3. Docs, adding text without rewriting existing lines:
- README: update the date line. Add one paragraph between the Buddy bullet list and '### Rebuilding his model', keeping the blank line after the 'Command Buddy' bullet: Buddy fills his floor and stays on screen whatever the screen size.
- CLAUDE.md: add a '**Canvas sizing:**' bullet directly after the CSP bullet in 'Buddy on Home'.

4. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, then in the background `node C:/Users/koreo/.grammieguide-e2e-run.cjs tests/e2e/buddy-canvas-size.spec.ts tests/e2e/handoff.spec.ts tests/e2e/m4-buddy-presence.spec.ts`. Before committing, temporarily revert the one-line fix, rebuild and confirm the size test fails at 1264x760 and 1920x1080 and the walk test's containment check fails on walk 2. Then restore the fix and rebuild.

5. Put in your summary for the PR body: PR #16 touches BuddyFloor.tsx, CLAUDE.md and the README Buddy section and PR #7 adds a README Buddy bullet, so whoever merges second resolves the README conflicts (the date line conflicts with every open PR) and reruns buddy-canvas-size, handoff and m4-buddy-presence; dpr stays [1, 1.5] as a possible follow-up.

Wrapper content for C:/Users/koreo/.grammieguide-e2e-run.cjs (create only if missing; the planner tested it, including waiting, exit codes and clearing a stale lock):
// Runs `npx playwright test <args>` while holding a machine-wide lock, so two
// GrammieGuide worktrees never run Electron e2e at the same time.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process')
const lock = path.join(os.homedir(), '.grammieguide-e2e.lock')
const owner = path.join(lock, 'owner.json')
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const alive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
const deadline = Date.now() + 60 * 60e3
let said = false
for (;;) {
  try { fs.mkdirSync(lock); fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, cwd: process.cwd(), at: Date.now() })); break }
  catch (e) {
    if (e.code !== 'EEXIST') throw e
    let info = null; try { info = JSON.parse(fs.readFileSync(owner, 'utf8')) } catch {}
    let age = 0; try { age = Date.now() - fs.statSync(lock).mtimeMs } catch { continue }
    const stale = info ? !alive(info.pid) || Date.now() - info.at > 45 * 60e3 : age > 60e3
    if (stale) { console.error('removing stale e2e lock'); fs.rmSync(lock, { recursive: true, force: true }); continue }
    if (Date.now() > deadline) { console.error('e2e lock still held after 60 min by ' + (info && info.cwd)); process.exit(3) }
    if (!said) { console.error('waiting for the e2e lock held by ' + (info && info.cwd)); said = true }
    sleep(5000)
  }
}
let status = 1
try { status = cp.spawnSync(['npx playwright test', ...process.argv.slice(2)].join(' '), { stdio: 'inherit', shell: true }).status ?? 1 }
finally { fs.rmSync(lock, { recursive: true, force: true }) }
process.exit(status)

## Test strategy
- AC1: review the BuddyFloor.tsx diff (one prop plus comments).
- AC2: the per-size test in buddy-canvas-size.spec.ts polls innerWidth/innerHeight to within 2px, then asserts canvas offset size 1440x250 equals the layer's, |canvasRect - layerRect| <= 1 for x/y/width/height, and the Stage root's offset size is 1440x900. The step 4 revert check shows it fails without the fix at 1264x760 and 1920x1080.
- AC3: the resize-without-reload test runs the same assertions through expect.poll after the innerWidth poll, then expects the problems collector to be empty.
- AC4: the clock-driven walk test asserts both data-buddy-target values (both floor ends visited), containment after every 250ms page-time step and after arrival, and that activity left 'strolling' within 60s of page time. Without the fix the tap box reaches about 1623 layout px on walk 2, outside the 1440 Stage.
- AC5: the wrapper run of the three specs after npm run build.
- AC6: review the README and CLAUDE.md diff (new paragraph and bullet only, date line updated).
- AC7: the lint, typecheck and unit test commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Buddy's <Canvas> in src/renderer/launcher/src/buddy/BuddyFloor.tsx passes resize={{ offsetSize: true }} with a why-comment (the Stage is CSS-scaled, so getBoundingClientRect would apply the scale twice, and a transform change never fires ResizeObserver); no other logic in the file changes.
- [ ] #2 New tests/e2e/buddy-canvas-size.spec.ts: for each content size 1264x760, 1440x900 and 1920x1080 (BrowserWindow.setContentSize, then page.reload), after polling until window.innerWidth/innerHeight are within 2px of the requested size, the Buddy canvas offsetWidth/offsetHeight equal the floor layer's ([data-buddy-activity], 1440x250 layout px), the canvas bounding box matches the layer's within 1px for x, y, width and height, and the Stage root (the offsetParent of [data-buddy-floor]) has offsetWidth 1440 and offsetHeight 900. Without the fix this fails at 1264x760 (about 1216x211) and at 1920x1080 (1728x300).
- [ ] #3 Same spec: an open launcher resized from 1264x760 to 1920x1080 without a reload again has the canvas offset size and bounding box matching the floor layer once innerWidth/innerHeight reach the new size (every check polled, no fixed waits), and the problem collector (pageerror plus console errors, as in m4-buddy-presence.spec.ts) is empty at the end of this test.
- [ ] #4 Same spec, walk test (last in the file): with Math.random pinned to 0.999 by page.addInitScript, page.clock installed at 23:00 local time and resumed, and the window at 1920x1080 after a reload, two Ctrl+Shift+B -> 'Take a walk' commands send him first to data-buddy-target '0.06' and then to a target starting with '0.939'. Each walk is advanced with page.clock.runFor(250) steps capped at 60 seconds of page time; after every step and once after arrival the [data-buddy-tap] bounding box lies inside the Stage root's bounding box within 1px, the test fails if data-buddy-activity is still 'strolling' at the cap, and no pageerror is recorded.
- [ ] #5 After npm run build, buddy-canvas-size.spec.ts, handoff.spec.ts and m4-buddy-presence.spec.ts pass when run through the shared e2e lock wrapper (node C:/Users/koreo/.grammieguide-e2e-run.cjs <spec paths>, which holds ~/.grammieguide-e2e.lock so no two worktrees run Electron e2e at once).
- [ ] #6 README: the date line reads _Last updated: <today>_ and one new paragraph between the Buddy bullet list and '### Rebuilding his model' says he fills his floor and stays on screen at any screen size, with every existing Buddy bullet unchanged. CLAUDE.md: a new '**Canvas sizing:**' bullet directly after the CSP bullet in 'Buddy on Home' says the Canvas measures layout (offset) size because the Stage is CSS-scaled; the Rendering bullet is unchanged.
- [ ] #7 npm run lint, npm run typecheck and npm test pass.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs a human: plan confidence 55% (< 95%): I checked the fix and found nothing wrong with it. In R3F 9.8.0, CanvasImpl spreads `resize` over {scroll:true, debounce:{scroll:50, resize:0}}. With offsetSize, react-use-measure 2.1.7 swaps in offsetWidth/offsetHeight but still takes left/top from getBoundingClientRect, and its Options type declares offsetSize. Its resize handler runs synchronously inside the same 'resize' dispatch as Stage's setScale, so without the fix it measures the old scale and stays stale. That confirms the resize test is a real regression test.; The numbers check out against the code. With the fix: zoom 250/1.95=128.2 and usable 5.066. pickStrollTarget(0.78, ()=>0.999, 1/3) falls back to FLOOR_MIN 0.06, and from 0.06 it returns 0.93912. Walk times are 25.2s and 30.7s at walk_casual 0.29. Without the fix at 1920x1080 the tap right edge is about 1623 layout px, so walk 2 fails and walk 1 passes. At 1264x760 the canvas comes out 1216x211. The Stage root really is the offsetParent of [data-buddy-floor], because the footer is unpositioned.; I probed sizing on this machine. The screen is 1920x1200 physical at 125%, which is 1536x960 DIP. A show:false/ready-to-show window like the launcher reached innerWidth/innerHeight of exactly 1264x760, 1440x900 and 1920x1080 in about 110ms, with or without moveTop/focus. A window created with show:true never propagated setContentSize to innerWidth within 4s, in every run. Keep the innerWidth poll and let it fail loudly. Don't swap it for fixed waits.; handoff.spec's roaming test already proves the clock pattern: install, resume, reload, then runFor driving the useFrame movement. Playwright 1.63's clock fakes requestAnimationFrame (AnimationFrame timers).; Small risk: AC3's console-error collector covers three reloads plus a live resize. m4-buddy-presence only proves a clean first launch, so an unexpected console.error on reload, such as a WebGL or context message, would fail AC3 for reasons unrelated to the fix.; Small risk: pinning Math.random also pins three.js UUIDs, as the plan notes. The walk test records pageerror only, so warnings won't matter. A thrown error from the shared AnimationAction would, but handoff.spec runs this same configuration.; I checked the code. On origin/main 46d1168 the Canvas at BuddyFloor.tsx:114-121 has no resize prop, the installed versions are R3F 9.8.0 and react-use-measure 2.1.7, and Stage.tsx applies scale(min(w/1440,h/900)) through a CSS transform. The one-prop fix is sound. Sizing FloorScene from useThree().size gives the same world range at every scale (5.066 units), so only the pixel projection is wrong today.; There is no code dependency on T1 or T2. PR #16's BuddyFloor hunks are at lines 6-12, 47-53, 98-104, 124-131 (adding a FloorScene prop), 223 and 263. The Canvas props at 114-121 and the header comment at 17-26 are separated from all of them by unchanged lines, so the merge is clean. The README paragraph goes between line 41 (blank) and line 42 ('### Rebuilding his model'), and #16 rewrites line 40 ('Command Buddy'). One unchanged line separates them, which is enough for a clean merge but fragile: the implementer must keep the existing blank line after the Command Buddy bullet, as the plan says.; PR #16 changes how he moves: `roaming` becomes `motion`, and 'reduced' stops fidgets and changes clip selection. The walk test pins targets 0.06 and 0.939 through Math.random=0.999. After #16 merges, those values or the 60s cap may need adjusting. The plan's 'rerun after the second merge' note covers this, but the PR body should say the walk test's expected targets assume today's machine and may need adjusting after #16.; Every spec launches the app with `electron.launch({ args: ['.'], cwd: process.cwd() })`, and `npx playwright test` finds playwright.config.ts in the current directory. So the wrapper must run with the worktree root as its working directory. The agent's shell starts each call in the main checkout, which is stale local main 565c8cd. If the agent forgets to cd, handoff and m4-buddy-presence run the main checkout's tests against its stale out/ and can pass falsely. Say explicitly: `cd <wt> && node C:/Users/koreo/.grammieguide-e2e-run.cjs ...`.; T3 builds first and alone, so its implementer creates the wrapper. That is the right order, because T3's reviewer only sees the AC's wrapper path, not the wrapper's content.; Size is fine: one prop, about 150-200 lines of e2e, and a few doc lines. This is one reviewable PR.; Safe to run unattended: one renderer prop, a new spec and doc text. No secrets, paid services, production data or owner decisions. I checked the fix myself. R3F 9.8.0 spreads `resize` over {scroll, debounce}, react-use-measure 2.1.7 swaps in offsetWidth/offsetHeight when offsetSize is true, and FloorScene takes zoom, usable, toWorld and the projection from useThree().size. The walk targets are correct too: pickStrollTarget(0.78, ()=>0.999, 1/3) gives 0.06, and from 0.06 it gives 0.93912.; Blocking environment risk, which I reproduced on this machine just now (the user has been idle for about 100 minutes). A plain Electron 44 window started from this session reports document.visibilityState 'hidden' even with isVisible() and isFocused() both true. After setContentSize(1440,900) and (1920,1080), getContentSize() changes but innerWidth/innerHeight stay at 1264x760 through a 10s poll. On the host page ResizeObserver never fired and requestAnimationFrame ran once in 5s. So AC2/AC3's innerWidth poll times out, R3F's useMeasure never gets a size, and the walk test has nothing to move.; handoff.spec's roaming test is part of AC5 and needs R3F to size and render, so in the same state it can fail for environmental reasons, not because of this change.; Calling win.moveTop() and win.focus() in setSize did not change the hidden state in my probe.; Passing `--disable-features=CalculateNativeWinOcclusion` as an Electron command-line argument (as electron.launch args would) fixed it. 1264x760, 1440x900 and 1920x1080 were exact within about 100ms, rAF ran at about 60fps and ResizeObserver fired. The plan should put this arg in the new spec's launch args and say what to do when existing specs fail this way: either one GRAMMIEGUIDE_E2E-gated app.commandLine.appendSwitch in main, or rerun once the display is back. Otherwise the implementer may stall or edit handoff.spec unasked.; Minor: the display is 1536x960 DIP at 125%, so 1920x1080 is bigger than the screen. setContentSize still honored it exactly with the switch, so that part of the plan holds.; PR #16's BuddyFloor hunks (@@ -97 and @@ -124) are not adjacent to the Canvas props at lines 114-121, so a clean merge is likely. The README date-line conflict is mechanical and already stated.
<!-- SECTION:NOTES:END -->
