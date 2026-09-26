# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GrammieGuide is a dementia-friendly Windows kiosk launcher for an elderly user, plus a PIN-gated caregiver admin panel. Built with Electron, React 19, TypeScript and electron-vite. It is a clean rewrite of the older `grandmas-launcher` repo, which keeps running on the real device as the safety net. Code from that repo is referenced for patterns only; never merge between the two. Many comments explain what an old-app pattern was replaced with and why, so keep that context when editing.

Work is organized into milestones (M1 reliability spine, M2 Home + admin, M3 3D Buddy, …) from an external plan doc (`i-kinda-wanna-overhaul-moonlit-prism.md`, not in this repo). The README's Status section tracks which milestones are done.

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

Shortcuts: `Ctrl+Shift+Q` always quits. `Ctrl+Shift+A` opens the admin window, and so does `Ctrl+Shift+Esc` in kiosk mode.

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
- **Schema changes:** bump `CURRENT_SCHEMA_VERSION`, then add a numbered pure migration file under `src/main/config/migrations/` (named `NNN-description.ts`) and list it in `migrations/index.ts`. The schema is at version 2; `002-buddy-voice-and-roaming.ts` is the pattern to copy (existing values win over the new defaults). Port each migration from the old app's `store.js` as exactly one file. `runner.ts` applies the migrations in order and re-validates after each one. If validation fails, it backs up the corrupt config and falls back to defaults so the kiosk still boots.

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

- **Behavior:** `src/shared/buddy/buddyMachine.ts` is an xstate machine (greeting, resting, fidgeting, strolling, remarking, chat.*, farewell), pure and tested with a `SimulatedClock`. Positions are fractions of his floor (0..1), never pixels. Night (9 PM-6 AM) means no strolls or remarks. Every one-shot state has a 20s `clipTimeout` so a missing clip can't freeze him. Remark lines live in `remarks.ts`: never a question she must answer, never a claim that might be false.
- **Rendering:** `renderer/launcher/src/buddy/BuddyFloor.tsx` owns the footer strip right of the text-size control: an orthographic canvas that overhangs the 150px footer row upward and takes no pointer events, plus an invisible tap button and speech bubble moved per frame. `useBuddyBrain.ts` runs the actor (created in an effect because of StrictMode). `CatModel.tsx` maps activities to clips (`clips.ts`), crossfades them, and slides him at the walk clip's stride speed; whether a clip loops is decided by the activity (`loopsFor`), not the clip. Tapping him opens chat; tapping him during chat is a pet.
- **Chat panel:** rendered inside the Stage (not over the window) so his floor can sit above its backdrop at `zLayers.buddyInChat`. It reports a `ChatPhase` (idle/hearing/thinking/speaking) that drives his chat states.
- **Voice:** `buddy:speak` → `services/speech/ttsService.ts` (Edge neural voices via `msedge-tts`, XML-escaped, 10s timeout). On any `ok:false` the renderer (`buddy/speech.ts`) falls back to `speechSynthesis`. Only chat lines are spoken; unprompted remarks are bubble-only.
- **Listening:** `buddy:listen` → `services/speech/sttService.ts`, Windows' offline System.Speech dictation through `runPowerShell`, one phrase per call. `buddy:canListen` gates the Talk button. Log that she spoke, never what she said.
- **CSP:** the launcher allows `blob:` for img/media/connect (GLB textures, voice audio). `useGLTF` must be called with Draco and Meshopt off: one fetches from a CDN, the other compiles WebAssembly, which `script-src 'self'` blocks.

### Buddy's model

`scripts/blender/fixCatRig.py` (run by `buildBuddy.sh`) turns Meshy's humanoid auto-rig into something that fits a round cat: it lowers the hip/knee joints along their original bone directions (so clip rotations still mean the same thing), re-weights legs and belly with bone heat against a joint-to-joint copy of the skeleton, pushes hanging arms out of the belly, re-grounds each clip to Meshy's own foot-height profile, makes the material matte, and exports every clip into one GLB. Clips come from Meshy's animation library (`meshy animate create --rig-task-id 01a0dcaf-4f10-746b-86fa-75e22623504f --action-id N -o CatModel/meshy/anims/<name>`); clip names in `buildBuddy.sh` must match `clips.ts`. The rig task expires on Meshy's side; after that, new clips need a re-rig.

### Embedded browser

Web tiles open in a `WebContentsView` (not the deprecated `BrowserView`) overlaid below a 72px nav bar (`services/browser/embeddedBrowser.ts`). `urlPolicy.ts` holds the protocol allow-list. Navigation guards and popup blocking stop the user from escaping the kiosk, and blocked navigations emit `browser:blocked`. The browser closes after `confusion.inactivityTimeoutMinutes` of idle time.

### UI conventions

- **Stacking order:** every z-index comes from `src/shared/zLayers.ts`. Never hardcode z-index values.
- **Themes and fonts:** these live in `src/shared/theme.ts`. Font size is a discrete step index (`FONT_STEPS`, used by the A-/A+ control), not a raw scale.
- **Visual style:** the "clay" look (`renderer/launcher/src/clay.ts`) is ported from the design files in `UI Screenshots/clay-launcher-design/`, especially `GrammieGuide Home.dc.html`. Treat those files as the visual reference.
- **Confusion detection:** the rapid-tap detector is pure logic in `src/shared/confusionDetector.ts`, which is unit tested.

## Style

Prettier (`.prettierrc.yaml`) and `.editorconfig` define the formatting. Code comments explain *why*, often by contrasting with the old app. Match that density when adding non-obvious logic.
