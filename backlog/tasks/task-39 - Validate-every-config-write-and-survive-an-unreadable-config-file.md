---
id: TASK-39
title: Validate every config write and survive an unreadable config file
status: To Do
assignee: []
created_date: '2026-10-01 12:18'
updated_date: '2026-10-01 12:20'
labels:
  - autopilot
  - needs-human
dependencies: []
priority: medium
type: bug
ordinal: 30
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This task closes two gaps in src/main/config/store.ts, the persistence layer that every admin save goes through.

1. Writes aren't validated. config:set validates only tiles (tileSchema). Display, weather, confusion, buddy and even schemaVersion reach setConfig unchecked, and setConfig does no validation. No known admin UI path writes an invalid value today: the numeric inputs are bounded range sliders (ConfusionTab min 1 max 60, DisplayTab), quick messages are capped at 300 characters and 50 entries, and every setConfig caller sends full nested objects. So this is defense in depth against a malformed config:set from a renderer bug, a future form or devtools. One bad write is costly, though. On the next boot runMigrations fails zod validation and falls back to defaultConfig(), which wipes her tiles, the Anthropic key and the PIN hash. With no PIN stored, admin:setPin then accepts a new PIN from anyone at the kiosk.

2. An unreadable file crash-loops the kiosk. store.ts builds `new Store()` at module load. electron-store 11.0.2 (conf 15.1.0) defaults clearInvalidConfig to false, and the constructor reads the file and rethrows JSON SyntaxError. index.ts imports store.ts at the top, before app.whenReady. So a truncated, zero-length or hand-edited config file crashes the main process before the documented backup-and-defaults fallback can run, and the watchdog relaunches it into the same crash. Conf writes atomically, so truncation is rare, but a crash loop is the worst outcome on a kiosk. Resets are also silent today: the runner builds a `reason` that nothing logs.

Fix:
- A pure applyConfigPatch (one-level merge plus configSchema validation) runs inside setConfig before the cache or the disk changes.
- The Store is created lazily inside loadConfig. On a SyntaxError, copy the raw file byte-for-byte to config.corrupt-<ts>.json and reopen with clearInvalidConfig.
- Every reset to defaults records one 'config-reset' reliability event that never contains config values. The detail never includes a SyntaxError message (V8 quotes file contents in it) or a migration's thrown message (V8 TypeErrors can quote values).

Tradeoff to state plainly in the PR body: after an unreadable-file reset, the kiosk boots with no PIN, so anyone at the keyboard could set one. Without the fix it crash-loops instead. The README tells the caregiver to set the PIN again straight away.

Behavior change to mention in the PR body: setConfig now saves the zod-parsed result. Unknown keys are stripped, defaults are filled (for example tile size), and quickMessage text is trimmed on every write. This is harmless for current callers.

Leave configSchema.ts, src/main/config/migrations/* (including runner.ts) and tests/unit/migrationsRunner.test.ts alone; open PRs #16 (migration 006) and #7 edit them. Once either merges, this validation applies their schema automatically.

Out of scope:
- A config written by a newer build (downgrade or rollback): needs an owner decision.
- Non-SyntaxError read failures (EPERM, EBUSY): rethrown as today.
- Valid JSON that isn't an object (null, 0, []): conf's Object.assign turns it into {}, which boots as a fresh install with no event, exactly as today.
- Backup/restore UI (TASK-19).
- An admin error message for a rejected save. Recorded as a Backlog draft. Today the admin store keeps its last good config, so controlled inputs snap back and the renderer sees an unhandled rejection from useConfigStore.save.

## Approach
Harness facts (the same for every task):
- Create the worktree and branch exactly as the harness's Setup line says (it branches from the previous task's branch). Don't create or switch other branches and don't touch the main checkout. Its local `main` is stale, so diff against origin/main or the PR base, never `main`.
- Run `npm ci` in the worktree. If node_modules/electron/dist is missing afterwards (npm 11 can skip install scripts, see README Setup), run `node node_modules/electron/install.js`.
- The previous task's review may run while you build, so two agents may run Electron e2e at once. Run every Playwright command through the shared lock wrapper: `node C:/Users/koreo/.grammieguide-e2e-run.cjs <spec paths>`. Never call `npx playwright test` or `npm run test:e2e` directly. If the wrapper file is missing, create it first with exactly the content at the end of this approach. It waits up to 60 minutes for the lock directory ~/.grammieguide-e2e.lock, runs `npx playwright test <args>`, and always removes the lock; a lock whose owner process has died is cleared automatically. Pass spec paths only, because arguments are joined with spaces. Waiting can exceed the Bash tool's 10-minute foreground limit, so start multi-spec runs with run_in_background.
- Run `npm run build` before any e2e; Playwright launches this worktree's out/main/index.js.
- If a spec fails on a network-dependent step (example.com in m2-smoke, the Anthropic call in m4-buddy-chat), rerun that spec once through the wrapper before treating it as a regression.
- Do NOT run config-recovery.spec.ts until the lazy-Store change in store.ts is built. Without it, the corrupt file makes the main process throw at import, and Electron shows a blocking 'A JavaScript error occurred in the main process' box that hangs an unattended run. If that happens, close it by stopping this worktree's Electron in PowerShell: `Get-Process electron | Where-Object { $_.Path -like '<this worktree>*' } | Stop-Process -Force`.
- Read `backlog instructions task-execution` before adding notes to this task's Backlog entry.

1. New pure src/main/config/applyConfigPatch.ts:
- `export class ConfigValidationError extends Error { constructor(readonly paths: string[]) }`.
- `export function applyConfigPatch(current: Config, patch: Partial<Config>): Config` runs configSchema.safeParse({ ...current, ...patch }).
- On failure it throws ConfigValidationError with the message `Config change rejected: invalid ${paths.join(', ')}`, where each path is issue.path.join('.') || '(root)'. Never include issue input, issue messages or the patch.
- On success it returns parsed.data.

2. src/main/config/store.ts:
- Replace the module-level Store with `let raw: Store<Record<string, unknown>> | null = null`.
- openStore(): try `new Store({ name: 'grammieguide-config' })`.
  - On an error with name === 'SyntaxError': best-effort copyFileSync from join(app.getPath('userData'), 'grammieguide-config.json') to join(userData, `config.corrupt-${Date.now()}.json`), recording the basename or null. Then return `new Store({ name: 'grammieguide-config', clearInvalidConfig: true })` with an `unreadable` marker.
  - Rethrow any other error.
- backupCorrupt() now returns the basename it wrote, or null.
- resetReason(reason): if it starts with 'migration v', return the text up to and including 'threw' (match /^migration v\d+ threw/), dropping the thrown message. Otherwise collapse whitespace and cut to 300 characters.
- loadConfig():
  - Open the store and run runMigrations(raw.store).
  - Unreadable case: runMigrations sees {} and returns ok:true, so log from the marker: logReliabilityEvent({ op: 'config-reset', ok: false, detail: `config file was not valid JSON; backup: ${name ?? 'backup failed'}` }).
  - Otherwise, on ok:false, back up as today and log `${resetReason(result.reason)}; backup: ${name ?? 'backup failed'}`.
  - Then cache and raw.set the result as today. Log exactly once and back up exactly once.
- setConfig(): `const next = applyConfigPatch(getConfig(), patch)` comes first, so a throw changes nothing. Then raw!.set(next), then cached = next.
- Update the why-comments: the old app had no safety net, and unreadable JSON is now covered too instead of crash-looping under the watchdog.

3. src/main/ipc/configIpc.ts: move logActivity('config-updated', ...) after setConfig succeeds. Change nothing else; the store is the single enforcement point.

4. Unit tests:
- New tests/unit/configStore.test.ts. Put mocks in vi.hoisted({ userData: '', stores: [], throwSyntax: false, initial: {}, logReliability: vi.fn() }).
  - vi.mock('electron', () => ({ app: { getPath: () => mocks.userData } })).
  - vi.mock('electron-store', () => ({ default: class FakeStore { ... } })). Its constructor pushes itself to mocks.stores and throws new SyntaxError('Unexpected token') when mocks.throwSyntax && !opts.clearInvalidConfig. It exposes `store` (returning {} when cleared, else a structuredClone of mocks.initial) and records set() payloads.
  - vi.mock('../../src/main/services/reliability/reliabilityLog', () => ({ logReliabilityEvent: mocks.logReliability })). Use this hoisted spy, NOT the real module: after vi.resetModules() a statically imported reliabilityLog would be a different instance from the one store.ts logs to.
  - In each test: vi.resetModules(), then `await import('../../src/main/config/store')`. Use a mkdtempSync dir for userData.
  - For the migration-throw detail test, vi.doMock('../../src/main/config/migrations/runner', ...) before the dynamic import, returning { ok: false, config: defaultConfig(), reason: 'migration v3 threw: TypeError: Cannot create property x on string sk-ant-SECRET', corruptBackup: {} }.
- tests/unit/configIpc.test.ts: change the activityLog mock to a hoisted `mocks.logActivity` so it can be asserted. Add a describe block whose setConfig mock does `config = applyConfigPatch(config, patch); return config` with the real applyConfigPatch.

5. New tests/e2e/config-recovery.spec.ts:
- mkdtemp a user-data-dir and write '{"tiles":[' to <udd>/grammieguide-config.json before launch. Launch the built app with GRAMMIEGUIDE_E2E=1.
- Expect 'No tiles configured yet' on Home. Read the dir: exactly one config.corrupt-*.json with identical bytes, and grammieguide-config.json parses with tiles [].
- Open admin through __e2e__.createAdminWindow and set PIN 2468 through the Set PIN form ('4-8 digit PIN', 'Confirm PIN', button 'Set PIN', wait for heading 'Home Screen Tiles'), which also unlocks admin. Calling window.admin.setPin alone would not unlock it.
- admin.evaluate(() => window.admin.getReliabilityLog(50)) has exactly one op 'config-reset' entry whose detail contains the backup file name and not '{"tiles"'.

6. Docs and Backlog:
- README: add a '## Settings safety' section before '## Setup' and set the date line to today (it may already be today's from an earlier task).
- CLAUDE.md: add a '**Validation:**' bullet directly after 'Secrets'. Don't edit the 'Schema' or 'Schema changes' bullets.
- Read `backlog instructions task-creation`, then create one draft with `backlog task create --draft --priority low ...`: show the caregiver a message when a settings save is rejected (today the input snaps back and the renderer gets an unhandled rejection from useConfigStore.save).

7. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Then run config-recovery on its own: `node C:/Users/koreo/.grammieguide-e2e-run.cjs tests/e2e/config-recovery.spec.ts`. Then run in the background `node C:/Users/koreo/.grammieguide-e2e-run.cjs tests/e2e/browser-close.spec.ts tests/e2e/handoff.spec.ts tests/e2e/m2-smoke.spec.ts tests/e2e/m4-buddy-chat.spec.ts tests/e2e/m4-buddy-presence.spec.ts tests/e2e/news.spec.ts tests/e2e/sandbox.spec.ts tests/e2e/tile-colors.spec.ts`. Specs added by the tasks stacked below (buddy-canvas-size, browser-hardening) are those tasks' responsibility and are not part of this AC.

8. Put in your summary for the PR body:
- this is defense in depth, not a fix for a live UI bug;
- the unreadable-file path ends a crash loop, at the cost of booting with no PIN until the caregiver sets one;
- writes now save the zod-parsed result (unknown keys stripped, defaults filled, quick message text trimmed);
- the rejected-save message is a follow-up draft;
- the README date line conflicts with every open PR, and #16/#7 also edit configSchema and the migrations, which this validation then picks up.

Wrapper content for C:/Users/koreo/.grammieguide-e2e-run.cjs (create only if missing):
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
- AC1: configStore.test.ts calls setConfig({ display: { ...d.display, theme: 'nope' } }) and expects ConfigValidationError whose message contains 'display.theme' and not 'nope'. It checks that getConfig() deep-equals the snapshot from before the call and that FakeStore.set got no new calls. A direct applyConfigPatch test covers the '(root)' path.
- AC2: configIpc.test.ts runs it.each over the four patches and expects invoke() to throw, the config unchanged, mocks.send not called, and mocks.logActivity not called with 'config-updated'.
- AC3: configStore.test.ts sends each caller-shaped patch through the real setConfig and checks the returned config and the last FakeStore.set payload, including wifiAdapterName returning to undefined. configIpc.test.ts checks that a theme patch resolves and sends config:changed. The existing configIpc, adminAuth, tileIpc, mergeAdminPatch and migrationsRunner tests stay unchanged and green.
- AC4: the unit test checks mocks.stores.length === 0 after import. With throwSyntax and a real '{"tiles":[' file in the temp dir, loadConfig() equals defaultConfig(), exactly one config.corrupt-*.json exists with identical bytes, the second FakeStore had clearInvalidConfig true, and its set received the defaults. config-recovery.spec.ts proves the same against the real electron-store and the real boot.
- AC5: the unreadable case gets one logReliability call with op 'config-reset' and a detail containing the backup name and not 'Unexpected token' or the file text. The seeded runner-validation case gets one call whose detail contains 'tiles' and none of 'sk-ant-SECRET', 'HASHSECRET' or 'not-an-array'. The mocked migration-throw case gets a detail starting 'migration v3 threw;' without 'sk-ant-SECRET'. The e2e reads the event through the admin API after the Set PIN form.
- AC6: review the doc diff; `backlog draft list --plain` shows the new draft.
- AC7: the lint, typecheck and unit commands, then the build, the solo config-recovery run, and the wrapper run of the eight origin/main specs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 setConfig validates the merged config with a new pure applyConfigPatch(current, patch) (src/main/config/applyConfigPatch.ts, no electron imports) against configSchema and saves the parsed result; an invalid patch throws ConfigValidationError, whose message names only the failing field paths and never values, and neither the in-memory cache nor the stored data changes (new tests/unit/configStore.test.ts with mocked electron-store, electron and reliabilityLog).
- [ ] #2 config:set rejects each of these patches built from defaultConfig() d: {display:{...d.display, theme:'nope'}}, {confusion:{...d.confusion, inactivityTimeoutMinutes:0}}, {weather:{units:'metric'}} (no locations) and {schemaVersion:1}; for each, getConfig() is unchanged, no config:changed is sent, and logActivity is never called with 'config-updated', because that log now runs only after a successful setConfig (tests/unit/configIpc.test.ts, with the mocked setConfig delegating to the real applyConfigPatch).
- [ ] #3 Valid writes from every existing caller still succeed and persist through the real setConfig: a tile array edit, an admin:setApiKey-style buddy patch, an adminAuth setPin-style reliability patch (hash and salt), an old-launcher-import-style weather/display/confusion patch, and kioskServices' wifiAdapterName set and then cleared to undefined (configStore.test.ts); a valid non-tile config:set (a theme change) resolves and sends config:changed (configIpc.test.ts); all existing unit tests stay green.
- [ ] #4 Importing store.ts never constructs the Store. When the Store constructor throws a JSON SyntaxError, loadConfig copies <userData>/grammieguide-config.json byte-for-byte to <userData>/config.corrupt-<timestamp>.json, reopens with clearInvalidConfig: true, writes defaultConfig() and returns it, and writes no second backup (unit test). End to end, launching the built app with '{"tiles":[' as the config file boots to Home showing 'No tiles configured yet', leaves exactly one config.corrupt-*.json with identical bytes, and rewrites grammieguide-config.json as valid JSON with an empty tiles array (new tests/e2e/config-recovery.spec.ts).
- [ ] #5 Every fallback to defaults, from a runner ok:false or from an unreadable file, records exactly one reliability event {op:'config-reset', ok:false} whose detail holds a reason and the backup file name (or 'backup failed'). The reason is 'config file was not valid JSON' for an unreadable file, just 'migration vN threw' (nothing after it) when a migration throws, and otherwise the runner's validation reason with whitespace collapsed and cut to 300 characters. Unit tests: seeding buddy.anthropicApiKey 'sk-ant-SECRET', reliability.adminPinHash 'HASHSECRET' and tiles 'not-an-array' over defaultConfig() gives a detail containing 'tiles' and none of the three seeded strings, and a mocked runner whose reason is 'migration v3 threw: TypeError: Cannot create property x on string sk-ant-SECRET' gives a detail without 'sk-ant-SECRET'. The e2e finds the event through window.admin.getReliabilityLog(50) after setting a new PIN through the Set PIN form.
- [ ] #6 Docs and Backlog: the README gets a new '## Settings safety' section placed before '## Setup' saying that every settings change is checked before it is saved, that an unreadable or invalid settings file is backed up beside the config, reset to defaults and noted in admin -> Reliability, and that after such a reset the PIN is cleared so the caregiver should set it again straight away; the README date line is today's; CLAUDE.md gets a new '**Validation:**' bullet directly after the 'Secrets' bullet in the Config section, with the 'Schema' and 'Schema changes' bullets unchanged; and one Backlog draft (created through the CLI) covers showing the caregiver a message when a settings save is rejected.
- [ ] #7 npm run lint, npm run typecheck and npm test pass. After npm run build, tests/e2e/config-recovery.spec.ts plus the eight specs on origin/main (browser-close, handoff, m2-smoke, m4-buddy-chat, m4-buddy-presence, news, sandbox, tile-colors) pass when run through the shared e2e lock wrapper (node C:/Users/koreo/.grammieguide-e2e-run.cjs <spec paths>, which holds ~/.grammieguide-e2e.lock so no two worktrees run Electron e2e at once); a spec that fails on a network-dependent step may be rerun once through the wrapper.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs a human: plan confidence 65% (< 95%): Verified with conf 15.1.0: the constructor (#initializeStore) reads `this.store`, which rethrows the JSON.parse SyntaxError unless clearInvalidConfig is set. With the flag it returns {} and writes nothing, so the explicit raw.set(defaults) is needed and works. electron-store 11's constructor is safe to call twice because initDataListener is idempotent.; Verified with zod 4.6.5 (probe from the repo root): error.message lists only paths, codes, expected types and enum options, never input values. So the seeded runner-validation case contains 'tiles' and none of 'sk-ant-SECRET', 'HASHSECRET' or 'not-an-array', and collapsing whitespace keeps it well under 300 characters.; Verified that the current callers stay valid. Every admin renderer save sends full nested objects (Display, Confusion, Weather, Buddy, Tiles), the e2e setConfig calls in handoff.spec spread full objects, and quickMessageSchema only trims, with no generated ids. Parse-on-write therefore doesn't churn data. conf's set() checks undefined only for top-level keys, so clearing wifiAdapterName to undefined is fine.; The unit tests carry some risk: hoisted FakeStore and spies combined with vi.resetModules, a dynamic import, and vi.doMock of the runner. It works as described but is easy to get subtly wrong, for example by statically importing reliabilityLog, which the plan already warns against.; AC7 runs browser-close, sandbox, m2-smoke and news on a branch stacked on T1 and T3. A T1 regression there would fail T2's check through no fault of T2's own.; The README's 'admin -> Reliability' wording is accurate: ReliabilityTab exists and loads getReliabilityLog(50).; There is no code dependency on T3 or T1. store.ts, configIpc.ts and applyConfigPatch.ts are disjoint from both. I checked that every setConfig caller (admin tabs, adminIpc, adminAuth, kioskServices, WeatherTab add/remove) sends full nested objects that already satisfy configSchema, so the new validation doesn't regress a current UI path. The weather locations array has no default, so the {weather:{units:'metric'}} rejection case holds. reliabilityLog.ts imports nothing from config, so store.ts can import it without creating an import cycle.; There is a stack-integrity gap in AC7. T2 sits on top of T1 and T3 and changes how every config write is persisted. Its AC7 runs only the eight origin/main specs and explicitly excludes browser-hardening.spec.ts, whose relaunch test depends on tiles persisting through config:set → setConfig. A T2 regression there would go unseen until merge. Suggest: 'plus browser-hardening.spec.ts and buddy-canvas-size.spec.ts if present on the branch after rebase', with the network-flake rerun rule. The cost is that a flaky lower spec could fail T2, but in this stack a real break matters more.; The README date-line rebase hazard is worse here. T2 is built on T1, which is built on T3, so its diff won't touch the date line. If either lower task is dropped, the date line falls back to 2026-09-30 and AC6 fails. The approach already says the date 'may already be today's from an earlier task'; it should also say to recheck after the lane's rebase.; The doc insertions merge cleanly against open PRs. The CLAUDE.md bullet after Secrets (line 51) is separated from #16's 'Schema changes' rewrite (line 53) by the unchanged Old-launcher-import line, and from #12's Reliability bullet. The '## Settings safety' section before '## Setup' (line 58) isn't adjacent to any open PR's README hunk.; Any validation change in #16 or #7 (migration 006, the new buddy fields) is picked up automatically, as the plan says. But T2's configStore.test.ts builds patches from defaultConfig() and hard-codes {schemaVersion:1} as the invalid case. Both stay valid after #16 bumps the version to 6, so this is fine. Still, whoever merges #16 second should rerun configStore and configIpc tests, and the PR body should list them alongside the e2e reruns.; The wrapper cwd problem applies here too: seven of the eight regression specs exist in the stale main checkout and would run against its out/.; Size is about 500-600 lines (applyConfigPatch, the store rewrite, a FakeStore-based unit suite with vi.resetModules and doMock, the configIpc additions, the e2e, docs and a draft). That is borderline but reviewable as one PR, because it is all one concern (config persistence).; Safe to run unattended. Tests use fake secrets, every profile is a temp --user-data-dir, and configSchema, migrations and runner stay untouched. I verified the claims: conf 15.1.0's store getter rethrows SyntaxError unless clearInvalidConfig is set, in which case it returns {} without writing. electron-store 11.0.2 reads the file in its constructor. store.ts builds the Store at import, and index.ts imports it before whenReady. Every admin caller sends full nested objects, and quickMessageSchema's trim is idempotent, so re-parsing the saved config is safe.; The no-PIN-after-reset tradeoff matches the fallback CLAUDE.md already documents for invalid configs (back up, then defaults, which also clears the PIN and API key). Stating it in the PR body and README is the right handling; it isn't a new owner decision.; Inaccurate PR-body claim: 'unknown keys stripped' holds only for nested objects. conf.set(object) merges top-level keys into the existing store, so unknown top-level keys stay on disk after raw.set(next). The wording should be corrected.; AC7 runs handoff.spec, whose roaming test needs R3F rendering. Under the hidden-window state I reproduced (no ResizeObserver, rAF about 0fps) it can fail for reasons unrelated to this change, and the plan allows a rerun only for network failures. The new config-recovery spec only checks the DOM and file system, so it should not be affected.; Minor: kioskServices calls setConfig inside an async timer path with try/finally and no catch, so a validation throw there would become an unhandled rejection. Its patches are always valid today, so this is a note, not a blocker.

Autopilot run 20260930-2212 (2026-10-01): blocked at planning, not implemented. The plan reached 65% confidence (95% needed), so no branch or PR holds code for this task. The core approach checked out: clearInvalidConfig plus an explicit reset to defaults, parsing every write against configSchema, and logging resets to the reliability log. What held it back was stacking on TASK-38 and TASK-01: it has no code dependency on either, but its e2e regression set inherited their risk and the unattended-window e2e problem. To unblock: build it on its own from origin/main and run its regression specs together with any spec present on the branch. The PR body should state the tradeoff that a reset clears the PIN, so anyone at the kiosk can set a new one (this matches the documented fallback). It should also say that conf.set keeps unknown top-level keys, so they are not stripped.
<!-- SECTION:NOTES:END -->
