# GrammieGuide

_Last updated: 2026-09-26_

A clean rewrite of `grandmas-launcher` - a dementia-friendly kiosk launcher for an elderly user, with a caregiver admin panel. Electron + React + TypeScript.

This is a **separate repo from `grandmas-launcher`**, which keeps running untouched on the real device as the safety net while this rewrite is built. Nothing here is merged from or into that repo - old code is referenced by path for patterns only.

Full rewrite plan (context, decisions, architecture, milestones): see the plan document from the planning session (`i-kinda-wanna-overhaul-moonlit-prism.md`).

## Status

- **M1 done** - scaffolding + reliability spine (typed config store with versioned migrations, shared PowerShell exec helper, watchdog/volume/Wi-Fi-healing rebuild), verified on real hardware.
- **M2 done** - kiosk Home screen (tile grid, embedded browser, weather, help, font-scale control) in the Clay Launcher design, plus the PIN-gated caregiver admin panel.
- **M3 done** - static 3D Buddy (procedural cat, tap-to-greet chat panel with a stubbed reply).
- **M4 done** - Buddy is finished: the real rigged 3D cat (24 animation clips) replaces the procedural M3 stand-in; an xstate behavior machine has him greet, idle, fidget, stroll the bottom of Home and (if the caregiver allows) make the odd remark; Anthropic-backed chat with him listening, thinking and talking beside the panel; replies read aloud (online Edge voice, Windows voice as fallback); and she can talk instead of typing (Windows' offline speech recognizer). Caregiver settings for all of it are in the admin Buddy tab.
- **Kiosk install done** - GrammieGuide now does on its own what the old launcher did: starts at login (scheduled task, no time limit), is watched by the external watchdog (which now actually runs: execution policy fixed), holds the volume ceiling, and heals Wi-Fi. Windows installer (`npm run package`), a one-click import of her settings (not tiles, which are set up fresh) from Grandma's Launcher, and switch/rollback scripts that keep the old launcher installed as the fallback. See [docs/kiosk-install.md](docs/kiosk-install.md).

## Buddy

Buddy is the cat in sunglasses at the bottom right of Home.

- **On his own** he idles, fidgets now and then, and strolls along the strip right of the text-size control (never over the tiles). From 9 PM to 6 AM he stays put and keeps quiet. With chattiness turned on he occasionally says something in a speech bubble (never out loud).
- **Tap him** to chat. He walks over beside the chat panel, waves, listens while she talks or types, scratches his head while thinking, and gestures while he answers. The **Talk** button lets her speak instead of type; it only appears when a microphone is found. Tapping him during a chat gets a happy reaction. Closing the chat gets a goodbye.
- **Caregiver settings** (admin, Buddy tab): API key and model, chattiness, whether he strolls, whether replies are read aloud, online vs Windows voice, and which voice (with a "Try this voice" button).

### Rebuilding his model

The model (`src/renderer/launcher/src/buddy/assets/buddy.glb`) is generated. The inputs are Meshy downloads in `CatModel/meshy/` (gitignored, ~390 MB, not in the repo): the auto-rigged cat plus library animations bought with `meshy animate create`. `sh scripts/blender/buildBuddy.sh` (Blender 5.2, ~70s) fixes the rig for his shape and bakes every clip into the GLB. See `CLAUDE.md` ("Buddy's model") for what the fix does and how to add a clip.

## Installing on the kiosk

Build the installer with `npm run package` (output in `dist/`), then follow [docs/kiosk-install.md](docs/kiosk-install.md). In short, from an administrator PowerShell on the kiosk:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\kiosk\switch-to-grammieguide.ps1 -Installer "GrammieGuide Setup 0.1.0.exe"
```

Then set a PIN, run **Tiles → Import settings from Grandma's Launcher**, set up her tiles fresh, and add the Buddy API key. `scripts\kiosk\rollback-to-grandmas-launcher.ps1` goes back to the old launcher, which is never uninstalled.

## Setup

`npm ci`. If `node_modules/electron/dist` is missing afterwards (npm 11 can skip install scripts), run `node node_modules/electron/install.js`.

## Scripts

- `npm run dev` - run in development
- `npm run build` - typecheck + build
- `npm run test` - unit tests (Vitest)
- `npm run typecheck` - TypeScript project references, no emit
- `npm run lint` - ESLint
- `npm run test:e2e` - Playwright E2E against the built app (run `npm run build` first)
- `npm run package` - Windows installer via electron-builder (`dist/GrammieGuide Setup <version>.exe`)
- `sh scripts/blender/buildBuddy.sh` - rebuild Buddy's model from the Meshy downloads (needs Blender)
