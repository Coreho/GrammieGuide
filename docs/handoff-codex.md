# Handoff for Codex

Read `CLAUDE.md` first. It covers the architecture, the IPC contract, config migrations, z-layers, and the Buddy sections. Verify every change with `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and then `npm run test:e2e`.

## State of the repo

- `main` has M4, the finished Buddy (PR #1).
- The working tree has **uncommitted** kiosk-install work:
  - reliability wiring (`services/reliability/kioskServices.ts`, `scheduledTasks.ts`, `wifiWatch.ts`)
  - installer config (the `build` block in `package.json`, plus `build/`)
  - `scripts/kiosk/`
  - `docs/kiosk-install.md`
  - a settings-only importer (`config/importOldLauncher.ts`)
  - a fix in the migration runner for an empty `{}` store

  All of it is tested (114 unit, 10 e2e). **Commit it on a branch first** (e.g. `feat/kiosk-install`), before starting the work below.
- Leave the six deleted files under `UI Screenshots/` out of your commits. Nobody knows who deleted them.
- Config schema is at **v2**. Each schema change bumps the version and adds one migration file (`003-...`, `004-...`), as described in CLAUDE.md.

## 1. Tiles: redo them from scratch

The owner wants Home's tiles done completely new. Don't copy anything from the old launcher. The importer deliberately skips tiles, so leave it that way.

- **Current code:**
  - `shared/configSchema.ts` `tileSchema`: web, app and builtin types; the only builtin key is `weather`
  - `renderer/launcher/src/components/TileGrid.tsx` and `Tile.tsx`: the clay look from `clay.ts`
  - `renderer/admin/src/components/TilesTab.tsx`: a bare add/remove list
  - `App.tsx` `activateTile()`
- **Design reference:** `UI Screenshots/clay-launcher-design/` (especially `GrammieGuide Home.dc.html`).
- **Constraints:**
  - Big touch targets.
  - Labels never truncate.
  - The grid must not collapse with 5 to 8 tiles; see the `517fe4d` commit message for how it broke before.
  - Keep the footer row 150px tall.
- **Admin:** the caregiver needs a proper editor. Add, edit and reorder tiles, pick an icon, and choose a type. Add the "size" field (`normal`/`wide`) and the `BUILTIN_TILE_KEYS` from the V2 specs if useful. Those specs are on the remote branch `claude/grammie-guide-v2-features-l8bgq7`, under `docs/specs/00-overview.md` section 3/4. Their migration numbering is stale: start at 003.
- **Tests:** e2e coverage for adding, editing and reordering tiles, and for opening a web tile.

## 2. Buddy command menu (two audiences)

Build two parts:

1. **Caregiver: admin → Buddy tab → "Command Buddy".**
   - One button per animation clip. The clip names are in `renderer/launcher/src/buddy/clips.ts` and match `assets/buddy.glb`.
   - A "say this" text box with a read-aloud checkbox and a gesture picker.
   - Saved quick messages the caregiver can add and remove. These need a config field, so add migration 003 (or 004).
2. **Grandma: on Home.**
   - Tapping Buddy opens a big, simple menu (for example: Let's chat, Dance, Wave, Say something nice) instead of going straight to chat.
   - Keep it at most 4 to 5 huge options.
   - Close it by tapping outside it or on an ✕.
   - Keep "Talk to your companion" working. The e2e tests click it and then expect the chat panel, so update those tests if the flow changes.

**Wiring:**

- **Command path:** add an IPC invoke channel from admin to main, e.g. `buddy:command` `{ clip?, text?, speak? }`, gated by `requireAdminUnlocked()`. Main then pushes an `IpcEvents` event `buddy:command` to the launcher window, the same way `config:changed` is sent in `ipc/configIpc.ts`.
- **Behavior machine:** in `shared/buddy/buddyMachine.ts`, add a `COMMAND` event and a `commanded` state.
  - Entry sets the `bubble` text and the requested clip.
  - It ends on `CLIP_DONE`, with the existing 20s `clipTimeout` safety net.
  - It's ignored while chatting, or queued.
  - It isn't blocked at night: a command is deliberate.
- **Clip choice:** `CatModel.tsx` currently picks clips with `pickClip(activity)`. Let the machine context carry a forced clip name for `commanded`, and make sure `loopsFor('commanded')` is false.
- **Speech:** use `buddy/speech.ts` `speak()`. It already falls back to the Windows voice.
- **Tests:** unit tests for the new machine states (pattern: `tests/unit/buddyMachine.test.ts` with `SimulatedClock`), and an e2e test that sends a command and checks `[data-buddy-activity]` plus the bubble.

## 3. Let Buddy walk the whole bottom of the screen

Today his floor is only the footer area to the right of the text-size control (`BuddyFloor.tsx` is `flex: 1` inside the footer, in `components/HomeView.tsx`). The owner wants him to walk the full width of the app's bottom.

- **Make the floor span the whole footer width.** One way: position the floor layer absolutely across the Stage's bottom (left 0 to right 0, inside the 1440x900 stage) instead of as a flex child. The canvas already has `pointer-events: none` and only his invisible hit button takes taps, so the text-size control stays usable when he walks in front of it.
- **Keep him from blocking the text-size buttons.**
  - Either keep his z-index below the control while he passes it, or treat the control's rect as a no-stop zone: `pickStrollTarget` should never *end* a stroll in front of it.
  - Positions are fractions 0..1 of the floor (`FLOOR_MIN`/`FLOOR_MAX`/`CHAT_SPOT` in `buddyMachine.ts`), so re-tune `CHAT_SPOT`. The chat panel sits on the left, 800px wide from x=64, and he must stand to its right.
- **Keep the tap target and bubble following him.** The per-frame projection code in `BuddyFloor.tsx` does this and should keep working once the layer's width changes.
- **Check it** in the running app: at 2 PM he strolls every 30 to 75 seconds; at night (9 PM to 6 AM) he stays put. To fake the time, use Playwright's `page.clock.install({ time })` + `resume()` + `reload()`.

## Other rules

- **No error text on her screen.** Failures stay calm and in character.
- **z-index:** every value comes from `shared/zLayers.ts`.
- **Logging:** never log chat or spoken content.
- **Comments:** explain *why*, matching the existing density.
- **README:** update it (keep `_Last updated: YYYY-MM-DD_` under the title) when a feature is done.
