# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GrammieGuide is a dementia-friendly Windows kiosk launcher for an elderly user, plus a PIN-gated caregiver admin panel. Built with Electron, React 19, TypeScript and electron-vite. It is a clean rewrite of the older `grandmas-launcher` repo, which keeps running on the real device as the safety net. Code from that repo is referenced for patterns only; never merge between the two. Many comments explain what an old-app pattern was replaced with and why, so keep that context when editing.

Work is organized into milestones (M1 reliability spine, M2 Home + admin, M3 3D Buddy, …) from an external plan doc (`i-kinda-wanna-overhaul-moonlit-prism.md`, not in this repo). The README's Status section tracks which milestones are done.

Planned work lives in Backlog.md (`backlog task list --plain`; the CLI is not an npm dependency, so install it once with `npm i -g backlog.md`), grouped into milestones such as Predictable Home, Contact family and Protected browsing. The older V2 feature specs in `docs/specs/` (read `00-overview.md` first) are background for some tasks. They predate M4 and the News tile, and their scam scoring, photo games and presence features are on hold as drafts. Where a task and its spec disagree, the task wins.

`@ghostery/adblocker-electron` is installed, but nothing in `src/` imports it yet; it is there for planned work, so don't assume it is wired up. (`msedge-tts` and `xstate` are now used by Buddy's voice and behavior machine.)

## Commands

- `npm run dev`: run the app with HMR. Kiosk lockdown is **off** in dev (`KIOSK_ENABLED = !is.dev` in `windowManager.ts`).
- `npm run build`: typecheck, then `electron-vite build` into `out/`
- `npm run typecheck`: runs both `tsconfig.node.json` (main/preload/shared) and `tsconfig.web.json` (renderers)
- `npm run lint`
- `npm test`: Vitest unit tests (`tests/unit/**/*.test.ts`, node environment)
- Single test file: `npx vitest run tests/unit/urlPolicy.test.ts`, or filter by test name with `-t "<name>"`
- `npm run test:e2e`: Playwright against the **built** app (`electron .` launches `out/main/index.js`). Run `npm run build` first. It uses a fresh temp `--user-data-dir` and sets `GRAMMIEGUIDE_E2E=1`, which exposes `globalThis.__e2e__.createAdminWindow` because Playwright can't send the Ctrl+Shift+A shortcut to a kiosk window.
- `sh scripts/blender/buildBuddy.sh`: rebuilds Buddy's model (`src/renderer/launcher/src/buddy/assets/buddy.glb`) from the Meshy downloads in the gitignored `CatModel/meshy/`. Needs Blender 5.2 (override the path with `BLENDER=`); takes about 70s. See "Buddy's model" below.
- `npx tsx scripts/debugReliability.ts`: manual real-hardware check of the Wi-Fi, volume and scheduled-task code. It registers both tasks, runs the watchdog once against a throwaway folder to prove it executes, then removes them. Safe to re-run on a dev machine; not on a kiosk where GrammieGuide is installed, since it replaces and then removes the real tasks.
- `npm run package`: Windows NSIS installer into `dist/` (config is the `build` block in `package.json`; icon and uninstall hook in `build/`). Installing it for real is documented in `docs/kiosk-install.md`, with the switch/rollback scripts in `scripts/kiosk/`.

Shortcuts: `Ctrl+Shift+Q` always quits. `Ctrl+Shift+A` opens the admin window, and so does `Ctrl+Shift+Esc` in kiosk mode. `Ctrl+Shift+B` toggles the caregiver Buddy menu on Home (outside chat, weather and confusion overlays).

## Architecture

Three processes, each with its own electron-vite entry. The `@shared` alias resolves to `src/shared` in the main process, the preloads, the renderers and Vitest.

- **Main** (`src/main`): `index.ts` is a deliberately thin bootstrap. It loads config, registers IPC, creates the launcher window, starts the embedded browser and inactivity watch, and starts the watchdog heartbeat. Put logic in `services/`, not in `index.ts`.
- **Preloads** (`src/preload`): `launcher.ts` and `admin.ts` expose typed APIs through `contextBridge` (`window.launcher`, admin equivalent). `browserView.ts` runs inside embedded web pages and reports user activity for the inactivity timeout.
- **Renderers** (`src/renderer/launcher`, `src/renderer/admin`): two separate React apps. The launcher is the kiosk Home screen, which includes tiles, weather, help and confusion overlays, and the Three.js Buddy cat in `buddy/`. The admin app is a tabbed caregiver panel behind `PinGate`, using a zustand store.

### IPC contract

`src/shared/ipcContract.ts` is the single source of truth for every channel. `IpcApi` holds invoke channels with request and response types; `IpcEvents` holds main-to-renderer push events. To add a channel:

1. Add it to `IpcApi` or `IpcEvents`.
2. Add the handler in the matching `src/main/ipc/<domain>Ipc.ts`. Each domain is registered from `ipc/index.ts`.
3. Expose it in the relevant preload.

Handlers that only a caregiver may use must call `requireAdminUnlocked()` first. This is enforced in the main process, not just by the UI gate. The unlock flag lives in memory in `services/auth/adminAuth.ts`, so it resets when the app restarts. The PIN is 4–8 digits, hashed with scrypt, and locks out for 30s after 5 failed tries.

### Config

- **Schema:** `src/shared/configSchema.ts` defines a zod schema, versioned by `CURRENT_SCHEMA_VERSION`. It is persisted through electron-store in `src/main/config/store.ts`.
- **Secrets:** `toPublicConfig()` strips secrets (the Anthropic API key and the admin PIN hash and salt) before anything reaches a renderer. `setConfig` merges only one level deep, so `config:set` runs patches through `mergeAdminPatch()`, which always carries the current secrets forward. Secrets change only through `admin:setPin` / `admin:setApiKey`.
- **Old launcher import:** `config/importOldLauncher.ts` maps grandmas-launcher's `%APPDATA%\grandmas-launcher\config.json` (read-only) to weather, display and confusion settings. Tiles are deliberately not imported (Home's tiles are set up fresh), behind `admin:previewOldLauncherImport` / `admin:applyOldLauncherImport`. It never carries secrets.
- **Schema changes:** bump `CURRENT_SCHEMA_VERSION`, then add a numbered pure migration file under `src/main/config/migrations/` (named `NNN-description.ts`) and list it in `migrations/index.ts`. The schema is at version 5: 003 adds tile sizes, 004 adds Buddy quick messages, and 005 gives each tile a saved `colorIndex`, seeded from its old position so upgrading doesn't repaint Home. Existing values win over defaults. `runner.ts` applies the migrations in order and validates the final result against the current schema. If validation fails, it backs up the corrupt config and falls back to defaults so the kiosk still boots.

### Reliability (Windows-specific)

- **PowerShell:** every PowerShell call goes through `services/reliability/shellExec.ts` `runPowerShell()`. It uses `execFile` with a UTF-16LE base64 `-EncodedCommand`, never string-interpolates into a command line, and takes an injectable `execFileImpl` for tests.
- **Logging:** results are recorded with `logReliabilityEvent`.
- **Startup wiring:** `services/reliability/kioskServices.ts` (`startKioskServices()`, called from `index.ts`) turns everything on: volume ceiling every 30s (quiet unless it changes something), the Wi-Fi watch every 10s (`wifiWatch.ts`: restart the adapter after 60s offline, then a 5-minute cooldown), and, in the installed app only (`app.isPackaged` and not `GRAMMIEGUIDE_E2E`), registration of the scheduled tasks. Use `resourcesDir()` for anything under `resources/`: in the installed app it's `process.resourcesPath` (electron-builder `extraResources`), not inside the asar.
- **Scheduled tasks:** all registration goes through `scheduledTasks.ts`. `GrammieGuide` starts the app at her logon with no execution time limit (Task Scheduler's 72h default would kill the kiosk). `GrammieGuideWatchdog` runs `watchdog.ps1` every minute with `-ExecutionPolicy Bypass` (the default policy blocks `-File`). Both try the highest run level and fall back to limited. They're re-registered on every start, but a task someone disabled (the rollback script does) is left disabled; only the admin "Re-register" button forces it back on.
- **Watchdog:** the app writes a heartbeat file every 15s; the watchdog relaunches the app if it's over 90s stale. Ctrl+Shift+Q writes `quit-flag.txt` so a deliberate quit stays quit; the next start clears it. Keep `resources/watchdog/watchdog.ps1` ASCII-only and saved as UTF-8 with BOM (the same goes for `scripts/kiosk/*.ps1`, which must run on Windows PowerShell 5.1).
- **Volume:** the volume ceiling uses the `loudness` native module, with a C# fallback (`resources/reliability/VolumeHelper.cs`; the compiled DLL is gitignored).
- **Wi-Fi:** `wifiHealer.ts` handles adapter discovery and self-healing.

### Buddy chat

- **Main process only:** `buddy:chat` → `services/ai/buddyChatService.ts`. The API key, the client (`anthropicClient.ts`) and the frozen system prompt (`buddyPrompt.ts`) all live in main.
- **History:** the renderer keeps the on-screen history and sends it every turn; the service sanitizes it (`toApiMessages`).
- **Replies:** every result carries a `reply` that is safe to show her, including on failure. Technical detail goes to the activity log, and chat content is never logged. The activity log (`services/activityLog/activityLog.ts`) keeps only the last 1000 events in memory and is not saved to disk.
- **Model:** the default is Haiku 4.5, which rejects `effort`; other models get `effort: 'low'`.

### Buddy on Home

- **Behavior:** `src/shared/buddy/buddyMachine.ts` is an xstate machine (greeting, resting, fidgeting, strolling, remarking, chat.*, farewell), pure and tested with a `SimulatedClock`. Positions are fractions of his floor (0..1), never pixels. Night (9 PM-6 AM) means no unprompted strolls or remarks. Every one-shot state has a 20s `clipTimeout` so a missing clip can't freeze him. Remark lines live in `remarks.ts`: never a question she must answer, never a claim that might be false.
- **Rendering:** `renderer/launcher/src/buddy/BuddyFloor.tsx` spans the Stage's full width above its bottom padding; the footer reserves 150px. Its orthographic canvas takes no pointer events; the invisible tap button and bubble follow him per frame. Text-size controls use `zLayers.fontControl` above his normal floor, so they stay usable when he walks behind them. `useBuddyBrain.ts` runs the actor (created in an effect because of StrictMode). `CatModel.tsx` crossfades clips and slides him at the walk clip's stride speed. Tapping him sends a friendly line and matching happy gesture from the pure `shared/buddy/tapReactions.ts` pool, avoiding the previous tap's line and clip; `buddy.voiceEnabled` controls tap read-aloud through the existing speech path. Rapid pats restart the command and are excluded from confusion detection; tapping during chat stays a pet. Her tap also shows a large 💬 Let's chat button in the moving bubble for eight seconds, independent of the gesture ending; another tap restarts it, then it fades. It works at night, and opens the chat panel without another reaction or confusion-detection tap. Opening chat, the caregiver menu or leaving Home dismisses it immediately. `Ctrl+Shift+B` opens a compact translucent `BuddyMenu` above his live tap target, captured in scaled Stage coordinates and clamped inside the Stage. The shortcut, Esc or an outside click closes it; arrow keys and Tab cycle rows and focus returns on close. It is available only on unobscured Home.
- **Commands:** `shared/buddy/commands.ts` owns the 24 clip names and command validation. Admin invokes `buddy:command`, gated by `requireAdminUnlocked()`, and main pushes the validated command to Home. The machine's `commanded` state carries a forced clip and sequence (so repeated clips restart), ends on `CLIP_DONE` or the 20s timeout, and is ignored while chatting. Deliberate commands work at night. The shared `walk` command (also in admin) enters `strolling` directly, choosing a destination at least a third of the floor from his live rendered position even with roaming off, then rests on `ARRIVED`. Walks are ignored during chat and cancel earlier command speech. Optional read-aloud may outlast the gesture, but stops on another command, chat, or leaving Home. Saved messages live in `buddy.quickMessages`; never log their content.
- **Chat panel:** rendered inside the Stage (not over the window) so his floor can sit above its backdrop at `zLayers.buddyInChat`. It reports a `ChatPhase` (idle/hearing/thinking/speaking) that drives his chat states.
- **Voice:** `buddy:speak` → `services/speech/ttsService.ts` (Edge neural voices via `msedge-tts`, XML-escaped, 10s timeout). On any `ok:false` the renderer (`buddy/speech.ts`) falls back to `speechSynthesis`. Chat lines, tap reactions (when read-aloud is enabled) and explicitly requested caregiver messages can be spoken; unprompted remarks are bubble-only.
- **Listening:** `buddy:listen` → `services/speech/sttService.ts`, Windows' offline System.Speech dictation through `runPowerShell`, one phrase per call. `buddy:canListen` gates the Talk button. Log that she spoke, never what she said.
- **CSP:** the launcher allows `blob:` for img/media/connect (GLB textures, voice audio). `useGLTF` must be called with Draco and Meshopt off: one fetches from a CDN, the other compiles WebAssembly, which `script-src 'self'` blocks.

### Buddy's model

`scripts/blender/fixCatRig.py` (run by `buildBuddy.sh`) turns Meshy's humanoid auto-rig into something that fits a round cat: it lowers the hip/knee joints along their original bone directions (so clip rotations still mean the same thing), re-weights legs and belly with bone heat against a joint-to-joint copy of the skeleton, pushes hanging arms out of the belly, re-grounds each clip to Meshy's own foot-height profile, makes the material matte, and exports every clip into one GLB. Clips come from Meshy's animation library (`meshy animate create --rig-task-id 01a0dcaf-4f10-746b-86fa-75e22623504f --action-id N -o CatModel/meshy/anims/<name>`); clip names in `buildBuddy.sh` must match `clips.ts`. The rig task expires on Meshy's side; after that, new clips need a re-rig.

### Built-in tiles and News

- **Registry:** each built-in tile kind is one entry in `renderer/launcher/src/tiles/builtins.tsx` (its well icon and the view it opens), keyed by `BUILTIN_TILE_KEYS` in `configSchema.ts`. `App.tsx` holds whichever built-in view is open (`openBuiltin`), so a new kind adds an entry there, not another branch in App.
- **News:** a `builtin` tile with `builtinKey: 'news'`, its feed in `feedUrl` and optional site in `url`. `feedUrl` is optional in the schema, so version-4 configs stay valid without a migration. Fetching is main-only (`services/news/newsService.ts`): 10s timeout, 2 MB cap, 15-minute cache per tile, and the last good stories (marked stale) if a refresh fails. Feeds are decoded in their declared charset (BOM, then HTTP `charset`, then the XML declaration, then UTF-8). Thumbnails are fetched in main (raster types only, 300 KB cap) and sent as `data:` URLs, so the launcher CSP doesn't loosen. The feed publisher chooses thumbnail URLs, so every DNS result and every redirect hop (at most 3, followed manually) must be a public address (`publicAddress.ts`); the caregiver-chosen feed itself isn't restricted. Known gap: fetch resolves the name again, so DNS rebinding isn't pinned. `shared/news/parseFeed.ts` is a dependency-free RSS/Atom reader that outputs plain text only and fails closed on DTDs or broken markup. Never render feed content as HTML.
- **IPC:** `news:get` and `news:open` take a tile id (and story id), never a URL: main fetches only the saved feed and opens only the saved site or a story it served. Story browsing is opened with `privateNavigation`, so the logs record `news-story-opened` but not the article address.

### Embedded browser

Web tiles open in a `WebContentsView` (not the deprecated `BrowserView`) overlaid below a 72px nav bar (`services/browser/embeddedBrowser.ts`). `urlPolicy.ts` holds the protocol allow-list. Navigation guards and popup blocking stop the user from escaping the kiosk, and blocked navigations emit `browser:blocked`. The browser closes after `confusion.inactivityTimeoutMinutes` of idle time.

### UI conventions

- **Stacking order:** every z-index comes from `src/shared/zLayers.ts`. Never hardcode z-index values.
- **Tile colors:** a tile's color is its saved `colorIndex` (a palette slot 0-3, `shared/tileColors.ts`), never its position, so reordering can't repaint Home. `config:set` keeps a tile's saved color when a patch omits it and gives new tiles the least-used slot.
- **Themes and fonts:** these live in `src/shared/theme.ts`. Font size is a discrete step index (`FONT_STEPS`, used by the A-/A+ control), not a raw scale.
- **Visual style:** the "clay" look (`renderer/launcher/src/clay.ts`) is ported from the design files in `UI Screenshots/clay-launcher-design/`, especially `GrammieGuide Home.dc.html`. Treat those files as the visual reference.
- **Confusion detection:** the rapid-tap detector is pure logic in `src/shared/confusionDetector.ts`, which is unit tested.

## Style

Prettier (`.prettierrc.yaml`) and `.editorconfig` define the formatting. Code comments explain *why*, often by contrasting with the old app. Match that density when adding non-obvious logic.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.53.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**At the beginning of each conversation in this project, run `backlog instructions overview` before answering or taking action. Re-read it only if you have not read it yet in the current conversation.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
