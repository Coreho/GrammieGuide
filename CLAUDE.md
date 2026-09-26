# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GrammieGuide is a dementia-friendly Windows kiosk launcher for an elderly user, plus a PIN-gated caregiver admin panel. Built with Electron, React 19, TypeScript and electron-vite. It is a clean rewrite of the older `grandmas-launcher` repo, which keeps running on the real device as the safety net. Code from that repo is referenced for patterns only; never merge between the two. Many comments explain what an old-app pattern was replaced with and why, so keep that context when editing.

Work is organized into milestones (M1 reliability spine, M2 Home + admin, M3 3D Buddy, …) from an external plan doc (`i-kinda-wanna-overhaul-moonlit-prism.md`, not in this repo). The README's Status section tracks which milestones are done.

`@ghostery/adblocker-electron`, `msedge-tts` and `xstate` are installed, but nothing in `src/` imports them yet. They are there for work that is still planned (such as speech and Buddy's behavior state machine), so don't assume they are wired up.

## Commands

- `npm run dev`: run the app with HMR. Kiosk lockdown is **off** in dev (`KIOSK_ENABLED = !is.dev` in `windowManager.ts`).
- `npm run build`: typecheck, then `electron-vite build` into `out/`
- `npm run typecheck`: runs both `tsconfig.node.json` (main/preload/shared) and `tsconfig.web.json` (renderers)
- `npm run lint`
- `npm test`: Vitest unit tests (`tests/unit/**/*.test.ts`, node environment)
- Single test file: `npx vitest run tests/unit/urlPolicy.test.ts`, or filter by test name with `-t "<name>"`
- `npm run test:e2e`: Playwright against the **built** app (`electron .` launches `out/main/index.js`). Run `npm run build` first. It uses a fresh temp `--user-data-dir` and sets `GRAMMIEGUIDE_E2E=1`, which exposes `globalThis.__e2e__.createAdminWindow` because Playwright can't send the Ctrl+Shift+A shortcut to a kiosk window.
- `npx tsx scripts/debugReliability.ts`: manual real-hardware check of the Wi-Fi, volume and watchdog code. It is safe to re-run and cleans up after itself.
- `npm run package`: Windows installer via electron-builder

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
- **Schema changes:** bump `CURRENT_SCHEMA_VERSION`, then add a numbered pure migration file under `src/main/config/migrations/` (named `NNN-description.ts`, e.g. `002-weather-locations-array.ts`) and list it in `migrations/index.ts`. The schema is still at version 1 and the list is empty, so there's no existing migration to copy. Port each migration from the old app's `store.js` as exactly one file. `runner.ts` applies the migrations in order and re-validates after each one. If validation fails, it backs up the corrupt config and falls back to defaults so the kiosk still boots.

### Reliability (Windows-specific)

- **PowerShell:** every PowerShell call goes through `services/reliability/shellExec.ts` `runPowerShell()`. It uses `execFile` with a UTF-16LE base64 `-EncodedCommand`, never string-interpolates into a command line, and takes an injectable `execFileImpl` for tests.
- **Logging:** results are recorded with `logReliabilityEvent`.
- **Watchdog:** the app writes a heartbeat file every 15s. An independent scheduled task (`GrammieGuideWatchdog`) runs `resources/watchdog/watchdog.ps1`. Keep that script ASCII-only and saved as UTF-8 with BOM.
- **Volume:** the volume ceiling uses the `loudness` native module, with a C# fallback (`resources/reliability/VolumeHelper.cs`; the compiled DLL is gitignored).
- **Wi-Fi:** `wifiHealer.ts` handles adapter discovery and self-healing.

### Buddy chat

- **Main process only:** `buddy:chat` → `services/ai/buddyChatService.ts`. The API key, the client (`anthropicClient.ts`) and the frozen system prompt (`buddyPrompt.ts`) all live in main.
- **History:** the renderer keeps the on-screen history and sends it every turn; the service sanitizes it (`toApiMessages`).
- **Replies:** every result carries a `reply` that is safe to show her, including on failure. Technical detail goes to the activity log, and chat content is never logged. The activity log (`services/activityLog/activityLog.ts`) keeps only the last 1000 events in memory and is not saved to disk.
- **Model:** the default is Haiku 4.5, which rejects `effort`; other models get `effort: 'low'`.

### Embedded browser

Web tiles open in a `WebContentsView` (not the deprecated `BrowserView`) overlaid below a 72px nav bar (`services/browser/embeddedBrowser.ts`). `urlPolicy.ts` holds the protocol allow-list. Navigation guards and popup blocking stop the user from escaping the kiosk, and blocked navigations emit `browser:blocked`. The browser closes after `confusion.inactivityTimeoutMinutes` of idle time.

### UI conventions

- **Stacking order:** every z-index comes from `src/shared/zLayers.ts`. Never hardcode z-index values.
- **Themes and fonts:** these live in `src/shared/theme.ts`. Font size is a discrete step index (`FONT_STEPS`, used by the A-/A+ control), not a raw scale.
- **Visual style:** the "clay" look (`renderer/launcher/src/clay.ts`) is ported from the design files in `UI Screenshots/clay-launcher-design/`, especially `GrammieGuide Home.dc.html`. Treat those files as the visual reference.
- **Confusion detection:** the rapid-tap detector is pure logic in `src/shared/confusionDetector.ts`, which is unit tested.

## Style

Prettier (`.prettierrc.yaml`) and `.editorconfig` define the formatting. Code comments explain *why*, often by contrasting with the old app. Match that density when adding non-obvious logic.
