# GrammieGuide

_Last updated: 2026-09-30_

A clean rewrite of `grandmas-launcher` - a dementia-friendly kiosk launcher for an elderly user, with a caregiver admin panel. Electron + React + TypeScript.

This is a **separate repo from `grandmas-launcher`**, which keeps running untouched on the real device as the safety net while this rewrite is built. Nothing here is merged from or into that repo - old code is referenced by path for patterns only.

Full rewrite plan (context, decisions, architecture, milestones): see the plan document from the planning session (`i-kinda-wanna-overhaul-moonlit-prism.md`).

## Status

- **M1 done** - scaffolding + reliability spine (typed config store with versioned migrations, shared PowerShell exec helper, watchdog/volume/Wi-Fi-healing rebuild), verified on real hardware.
- **M2 done** - kiosk Home screen (tile grid, embedded browser, weather, help, font-scale control) in the Clay Launcher design, plus the PIN-gated caregiver admin panel.
- **M3 done** - static 3D Buddy (procedural cat, tap-to-greet chat panel with a stubbed reply).
- **M4 done** - Buddy is finished: the real rigged 3D cat (24 animation clips) replaces the procedural M3 stand-in; an xstate behavior machine has him greet, idle, fidget, stroll the bottom of Home and (if the caregiver allows) make the odd remark; Anthropic-backed chat with him listening, thinking and talking beside the panel; replies read aloud (online Edge voice, Windows voice as fallback); and she can talk instead of typing (Windows' offline speech recognizer). Caregiver settings for all of it are in the admin Buddy tab.
- **Kiosk install done** - GrammieGuide now does on its own what the old launcher did: starts at login (scheduled task, no time limit), is watched by the external watchdog (which now actually runs: execution policy fixed), holds the volume ceiling, and heals Wi-Fi. Windows installer (`npm run package`), a one-click import of her settings (not tiles, which are set up fresh) from Grandma's Launcher, and switch/rollback scripts that keep the old launcher installed as the fallback. See [docs/kiosk-install.md](docs/kiosk-install.md).

## Home tiles

In **admin → Tiles**, add websites, installed apps (full Windows paths), or a built-in (Weather or News). Pick an icon, a color and normal or wide size. Edit, remove and move-up/down controls update Home immediately. Each tile keeps its own color when tiles are moved, added or removed, because the color is part of how she recognizes it; new tiles start with a color Home isn't using yet. Colors look different only in the two "Tiles" themes; the four clay themes share one tile color. Wide tiles span two columns. Labels wrap without truncation; extra rows scroll within the tile area while the footer stays 150px tall. Leaving a web page, by the Home button or the idle timeout, closes it completely, so a video or radio stream stops instead of playing on out of sight.

Built-in tiles each have their own view. **News** is wide by default. Tapping it shows today's stories as long cards (headline, a two-line summary, how long ago, and a small picture when the feed has one) so she can see what's there before choosing. Tapping a story opens it in the kiosk browser. The caregiver sets the feed address (NPR's top stories by default) and, optionally, the news website. If the feed can't be read, she sees "The news isn't ready right now." and a button to open that website instead, never an error. The top headline is deliberately not shown on the tile itself, so Home never displays upsetting news she didn't ask for. Music, games and photos built-ins remain future work.

Config migrations 003 (tile sizes), 004 (saved Buddy messages) and 005 (tile colors, seeded so upgrading doesn't repaint Home) preserve existing settings.

## Buddy

Buddy is the cat in sunglasses at the bottom right of Home.

- **On his own** he idles, fidgets now and then, and strolls across the full footer (never over the tiles). The text-size controls stay usable when he passes behind them. From 9 PM to 6 AM he stays put and keeps quiet. With chattiness turned on he occasionally says something in a speech bubble (never out loud).
- **Tap him** for a short friendly bubble and a matching happy gesture, without repeating the previous tap's line or animation. He reads it aloud when the caregiver's read-aloud setting is on. Taps work at night, and repeated taps restart the reaction without stacking speech. His bubble also offers a big **💬 Let's chat** button for eight seconds after each tap, even if the gesture ends sooner; it then fades away. Opening chat, the caregiver menu or leaving Home dismisses it. During chat, tapping him stays a pet.
- **Caregiver menu:** press **Ctrl+Shift+B** on Home for **Let's chat**, **Dance**, **Wave**, **Say something nice**, or **Take a walk**. The small translucent card opens above where Buddy is standing and stays on screen near the edges. Press the shortcut again, Esc, or click outside to close it. Arrow keys and Tab move between commands; Enter chooses one. It stays closed in the browser and over chat, weather or confusion overlays. **Take a walk** sends him at least a third of the floor away, even at night or with roaming off, then he rests.
- **Chat:** tap Buddy, then choose **💬 Let's chat** in his bubble. The caregiver menu also offers **Let's chat**. He joins the panel, waves, listens while she talks or types, scratches his head while thinking, and gestures while answering. The **Talk** button lets her speak instead of type; it only appears when a microphone is found. Closing the chat gets a goodbye.
- **Caregiver settings** (admin, Buddy tab): API key and model, chattiness, whether he strolls, whether replies are read aloud, online vs Windows voice, and which voice (with a "Try this voice" button).
- **Command Buddy** (admin, Buddy tab): play any of his 24 animation clips, ask him to take a walk, send a short message with a gesture and optional read-aloud, and save/remove quick messages. Commands work on Home, including at night, and are ignored while she is chatting. Each gesture plays once, with a 20-second recovery timeout. Read-aloud uses the existing online voice with Windows fallback. Message content is never written to the activity log.

### Rebuilding his model

The model (`src/renderer/launcher/src/buddy/assets/buddy.glb`) is generated. The inputs are Meshy downloads in `CatModel/meshy/` (gitignored, ~390 MB, not in the repo): the auto-rigged cat plus library animations bought with `meshy animate create`. `sh scripts/blender/buildBuddy.sh` (Blender 5.2, ~70s) fixes the rig for his shape and bakes every clip into the GLB. See `CLAUDE.md` ("Buddy's model") for what the fix does and how to add a clip.

## Installing on the kiosk

Build the installer with `npm run package` (output in `dist/`), then follow [docs/kiosk-install.md](docs/kiosk-install.md). In short, from an administrator PowerShell on the kiosk:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\kiosk\switch-to-grammieguide.ps1 -Installer "GrammieGuide Setup 0.1.0.exe"
```

Then set a PIN, run **Tiles → Import settings from Grandma's Launcher**, set up her tiles fresh, and add the Buddy API key. `scripts\kiosk\rollback-to-grandmas-launcher.ps1` goes back to the old launcher, which is never uninstalled.

The switch keeps the old launcher's start-at-login on until GrammieGuide has set up its own. If the installer is cancelled or fails, the script stops, turns the old watchdog back on and reopens the old launcher, so she never signs in to neither. It also switches off any leftover startup entry from early builds of the old launcher (as Task Manager does); rollback turns back on only the entries the switch turned off.

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
