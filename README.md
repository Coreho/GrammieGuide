# GrammieGuide

_Last updated: 2026-10-02_

A clean rewrite of `grandmas-launcher` - a dementia-friendly kiosk launcher for an elderly user, with a caregiver admin panel. Electron + React + TypeScript.

This is a **separate repo from `grandmas-launcher`**, which keeps running untouched on the real device as the safety net while this rewrite is built. Nothing here is merged from or into that repo - old code is referenced by path for patterns only.

Full rewrite plan (context, decisions, architecture, milestones): see the plan document from the planning session (`i-kinda-wanna-overhaul-moonlit-prism.md`).

## Status

- **M1 done** - scaffolding + reliability spine (typed config store with versioned migrations, shared PowerShell exec helper, watchdog/volume/Wi-Fi-healing rebuild), verified on real hardware.
- **M2 done** - kiosk Home screen (tile grid, embedded browser, weather, help, font-scale control) in the Clay Launcher design, plus the PIN-gated caregiver admin panel.
- **M3 done** - static 3D Buddy (procedural cat, tap-to-greet chat panel with a stubbed reply).
- **M4 done** - Buddy is finished: the real rigged 3D cat (24 animation clips) replaces the procedural M3 stand-in; an xstate behavior machine has him greet, idle, fidget, stroll the bottom of Home and (if the caregiver allows) make the odd remark; Anthropic-backed chat with him listening, thinking and talking beside the panel; replies read aloud (online Edge voice, Windows voice as fallback); and she can talk instead of typing (Windows' offline speech recognizer). Caregiver settings for all of it are in the admin Buddy tab.
- **Kiosk install done** - GrammieGuide now does on its own what the old launcher did: starts at login (scheduled task, no time limit), is watched by the external watchdog (which now actually runs: execution policy fixed), holds the volume ceiling, and heals Wi-Fi. Windows installer (`npm run package`), a one-click import of her settings (not tiles, which are set up fresh) from Grandma's Launcher, and switch/rollback scripts that keep the old launcher installed as the fallback. See [docs/kiosk-install.md](docs/kiosk-install.md).
- **Home recovers by itself** - if the Home screen crashes, it reloads at once; if it freezes for 10 seconds, it is reloaded. Any open web page is closed first, so she is never left without a Home button. If Home fails 4 times within 5 minutes, the app closes, and the watchdog starts it again a minute or two later. Each recovery shows in admin → Reliability.

## Home tiles

In **admin → Tiles**, add websites, installed apps (full Windows paths), or a built-in (Weather or News). Pick an icon, a color and normal or wide size. Edit, remove and move-up/down controls update Home immediately. Each tile keeps its own color when tiles are moved, added or removed, because the color is part of how she recognizes it; new tiles start with a color Home isn't using yet. Colors look different only in the two "Tiles" themes; the four clay themes share one tile color. Wide tiles span two columns. Labels wrap without truncation; extra rows scroll within the tile area while the footer stays 150px tall. Leaving a web page, by the Home button or the idle timeout, closes it completely, so a video or radio stream stops instead of playing on out of sight.

If a web page won't load, she never sees Chromium's technical error page. A calm screen says "This page won't open right now." with big **Try again** and **Home** buttons. When the internet is down it says so, and the page opens by itself once the connection is back. A link the kiosk won't follow gets the same screen with **Back to the page**. The Home button stays in its usual place at the top, and admin → Activity shows which site failed and why.

Text size is set only by the caregiver, in **admin → Display**, and Home follows it immediately. Home no longer has its own text-size buttons (the A-/A+ in the bottom-left corner), so a stray tap can't change it.

A web page closes by itself after the caregiver's idle time (admin → Confusion). Each tap, key press or scroll inside the page restarts that timer. Reading without touching anything doesn't, so a page she only reads still closes once the time is up. Before 2026-09-30 input inside the page didn't count at all, because the page's small activity-reporting script never loaded. Events a page fakes with its own scripts are ignored. Home, admin and web pages all run in Chromium's sandbox, which limits what a misbehaving page could do to the computer.

Built-in tiles each have their own view. **News** is wide by default. Tapping it shows today's stories as long cards (headline, a two-line summary, how long ago, and a small picture when the feed has one) so she can see what's there before choosing. Tapping a story opens it in the kiosk browser. The caregiver sets the feed address (NPR's top stories by default) and, optionally, the news website. If the feed can't be read, she sees "The news isn't ready right now." and a button to open that website instead, never an error. The top headline is deliberately not shown on the tile itself, so Home never displays upsetting news she didn't ask for. Music, games and photos built-ins remain future work.

Config migrations 003 (tile sizes), 004 (saved Buddy messages), 005 (tile colors, seeded so upgrading doesn't repaint Home), 006 (Buddy tap and motion choices), and 007 (the chat switch, on for existing setups) preserve existing settings.

Local media infrastructure is ready: `grammie-media://` streams images and seekable audio from `userData/media/music/` and `userData/media/photos/` to Home and admin, with strict filename validation and no renderer filesystem API. The caregiver-side library store is in place too. Each library keeps its own `index.json` beside its files, separate from config. Importing copies files in under generated names, and the original path is never kept. A damaged index is backed up and the library starts empty instead of stopping the kiosk. Admin can list, import (through the Windows file picker), caption and remove entries, but there is no admin screen for it yet, and nothing on Home uses it yet (TASK-07, TASK-09).

## Buddy

Buddy is the cat in sunglasses at the bottom right of Home.

- **On his own** he follows the caregiver’s motion choice: **Stays put** keeps his usual gestures without wandering; **Walks now and then** keeps today’s fidgets and strolls across the full footer (never over the tiles); **Reduced motion** keeps him in place with no unprompted fidgets and fewer, gentler gestures. From 9 PM to 6 AM he stays put and keeps quiet. With chattiness turned on he occasionally says something in a speech bubble (never out loud).
- **Tap him** to open chat right away if the caregiver chooses that setting. Otherwise, a tap gives a short friendly bubble and a matching happy gesture, without repeating the previous tap's line or animation. In reduced motion the tap gestures are small waves and hearts. He reads it aloud when the caregiver's read-aloud setting is on. Taps work at night, and repeated taps restart the reaction without stacking speech. His bubble also offers a big **💬 Let's chat** button for eight seconds after each tap, even if the gesture ends sooner; it then fades away. Opening chat, the caregiver menu or leaving Home dismisses it. During chat, tapping him stays a pet.
- **Caregiver menu:** press **Ctrl+Shift+B** on Home for **Let's chat**, **Dance**, **Wave**, **Say something nice**, or **Take a walk**. The small translucent card opens above where Buddy is standing and stays on screen near the edges. Press the shortcut again, Esc, or click outside to close it. Arrow keys and Tab move between commands; Enter chooses one. It stays closed in the browser and over chat, weather or confusion overlays. **Take a walk** sends him at least a third of the floor away, even at night or in reduced motion, then he rests.
- **Chat:** tap Buddy once if set to open chat directly, or choose **💬 Let's chat** after his reaction. The caregiver menu also offers **Let's chat**. He joins the panel, waves, listens while she talks or types, scratches his head while thinking, and gestures while answering. The **Talk** button lets her speak instead of type; it only appears when a microphone is found. Reduced motion keeps him where he is, uses a listening pose while thinking, and plays just one talking gesture per reply. Closing the chat gets a goodbye.
- **What he says:** he never argues with something confused, never agrees that it is true, and never makes up facts about her family, plans or visits. When she says her mother is coming or she has to get to work, he asks about the person or the job instead ("Your mother. What is she like?"). Asked something he can't know, he suggests she ask her family. He runs on Claude Sonnet 5.5 by default, because live checks found the cheaper Haiku 4.5 still going along with confused statements.
- **Caregiver settings** (admin, Buddy tab): whether chat is allowed at all, API key and model, chattiness, what her tap does, how much he moves, whether replies are read aloud, online vs Windows voice, and which voice (with a "Try this voice" button). Tap, motion and chat choices apply on Home immediately, without a restart. Turning chat off closes an open chat and removes every way into it, while Buddy stays on Home with his friendly tap reactions. Choose by watching what she enjoys and what distracts her; more animation is not automatically better. Existing settings migrate: strolling on becomes **Walks now and then**, and off becomes **Stays put**.
- **Command Buddy** (admin, Buddy tab): play any of his 24 animation clips, ask him to take a walk, send a short message with a gesture and optional read-aloud, and save/remove quick messages. Commands work in every motion mode on Home, including at night, and are ignored while she is chatting. Each gesture plays once, with a 20-second recovery timeout. Read-aloud uses the existing online voice with Windows fallback. Message content is never written to the activity log.

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

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/Coreho/GrammieGuide?utm_source=oss&utm_medium=github&utm_campaign=Coreho%2FGrammieGuide&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

## Remote backlog runs

You can start Backlog tasks from the password-protected board at https://workflow.koreokorp.com. A runner on this Windows PC checks the board every three seconds. When you click Start, it runs the saved workflow the runner is set to, in a hidden Claude session. That can be `backlog-run`, `backlog-run-codex`, or `backlog-run-codex-lite`, where Codex builds every task to save Claude usage. The board shows each task's progress and links to the PRs it opens. The runner sends the workflow only the task IDs you selected. It never runs commands from the board. Setup, Stop, logs and recovery are in [docs/workflow-runner.md](docs/workflow-runner.md); the source is in `scripts/workflow-runner/`.

The runner is installed and connected. On 2026-10-02 a board run went all the way from Start to finish for the first time. It started the workflow, passed preflight, skipped TASK-34 because it overlaps open PRs, and reported the run as done. No board run has built a task yet. The runner reads the task list from the local checkout, so keep that checkout on an up-to-date `main`. Its tests use a stand-in program instead of Claude. It also doesn't start again after a reboot.
