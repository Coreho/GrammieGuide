---
id: TASK-56
title: >-
  Built-in Games tile with calm offline games and caregiver-configured installed
  games
status: Done
assignee:
  - '@antigravity'
created_date: '2026-10-17 08:52'
updated_date: '2026-10-17 10:54'
labels: []
dependencies: []
references:
  - TASK-47
  - TASK-48
  - src/renderer/launcher/src/tiles/builtins.tsx
  - src/shared/tileArtwork.ts
  - src/main/ipc/tileIpc.ts
priority: medium
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Home already has approved Clay artwork for Games (TASK-47, TASK-48), but README notes that Games remain future work and there is no built-in Games view yet. External game websites often carry ads, timers, failure states, or distracting navigation, while putting multiple local game shortcuts directly on Home consumes scarce fixed layout slots. GrammieGuide needs a built-in Games tile that opens a calm, frustration-free hub offering four untimed offline games (Matching Pairs, Picture Puzzle, Gentle Tic-Tac-Toe, and Color/Melody Sequencer) plus caregiver-configured local installed Windows games, using her approved family photos when available and excluding interactive game-piece taps from rapid-tap confusion detection while keeping the inactivity timeout active.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A built-in Games tile can be added in admin -> Tiles, defaults to the bundled Games Clay artwork unless overridden by a photo or custom icon, and opens a modal Games hub on Home with keyboard access, focus management, and a reachable Home button (plus Stop music when music is playing).
- [x] #2 The Games hub offers four calm, untimed, errorless offline games—Matching Pairs (4 to 8 large cards), Picture Puzzle (2x2 or 3x2 tap-to-swap), Gentle Tic-Tac-Toe (against a forgiving computer player), and Color/Melody Sequencer (large colored chime pads with free play and gentle pattern following)—with no timers, scores, or failure states.
- [x] #3 Visual games (Matching Pairs and Picture Puzzle) use her caregiver-approved visible family photos when enabled and available, falling back cleanly to warm bundled illustrations when photos are disabled, unavailable, or fewer than needed.
- [x] #4 Caregivers can configure games in admin (enable/disable individual built-in games, toggle family photo usage, and add/edit/remove local installed Windows game paths) with a preserving config schema migration that leaves existing tiles and settings intact.
- [x] #5 Installed games listed in the Games hub launch only caregiver-saved paths through main-process validation and the existing Always-On-Top focus handoff, never accepting arbitrary paths from a renderer and logging only game IDs rather than file paths or photo captions.
- [x] #6 Taps on interactive game pieces count as user activity for the inactivity timeout and idle dimming but are excluded from rapid-tap confusion detection so playing a game never accidentally triggers the Confusion overlay.
- [x] #7 All game views and hub cards fit the Stage across every configured font step, theme, and reduced-motion setting, with automated unit and E2E tests covering game logic, config migration, confusion-detector exclusion, and hub navigation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shared games schema (src/shared/games/gamesSchema.ts), add "games" to BUILTIN_TILE_KEYS in configSchema.ts (bumping schemaVersion to 15), add preserving migration 015-games-library.ts, update tileArtworkFor so built-in games tiles default to the bundled games Clay artwork, and add gamesOverlay to zLayers.ts.
2. Build pure, unit-tested game engines in src/shared/games/ for Matching Pairs (matchingGame.ts), Picture Puzzle (puzzleGame.ts), Gentle Tic-Tac-Toe (ticTacToeGame.ts), and Color/Melody Sequencer (melodyGame.ts) with no timers, scores, or failure states, using caregiver-approved visible family photos when enabled and available and warm bundled illustrations as fallback.
3. Extend IPC (games:openInstalled in ipcContract.ts, preload/launcher.ts, and main/ipc/tileIpc.ts) to launch caregiver-saved local installed Windows games using the existing Always-On-Top focus handoff and logging only game IDs.
4. Implement GamesIcon (icons.tsx), GamesOverlay (src/renderer/launcher/src/tiles/GamesOverlay.tsx + GamesOverlay.css), register BUILTINS.games in builtins.tsx, and exclude [data-game-interactive] from RapidTapTracker in App.tsx while preserving activity reporting for inactivity timeout and idle dimming.
5. Add caregiver admin support: add games to BUILTIN_LABELS in TilesTab.tsx and create GamesTab.tsx (wired in admin/src/App.tsx) to toggle built-in games, toggle family photo usage, and add/edit/remove local installed games.
6. Run unit tests, typecheck, lint, build, and E2E verification, then finalize TASK-56.

7. Enhance Picture Puzzle to support both Jigsaw (interlocking tabs/blanks) and Rectangular Cards modes, enrich fallback scene illustrations so every quadrant/sixth has distinct detail, and add a complete-picture reference preview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema v15 with src/shared/games/gamesSchema.ts and preserving migration 015-games-library.ts. Built four pure, unit-tested game engines in src/shared/games/ (matchingGame.ts, puzzleGame.ts, ticTacToeGame.ts, melodyGame.ts). Added games:openInstalled and games:reportBuiltin IPC handlers in src/main/ipc/tileIpc.ts reusing the Always-On-Top focus handoff and logging only game IDs/keys. Created GamesOverlay.tsx and GamesOverlay.css in the Clay visual system with authored SVGs, Web Audio pentatonic chimes, window-level Escape/Tab focus management, and [data-game-interactive] exclusion from RapidTapTracker. Added GamesTab.tsx in admin and updated TilesTab.tsx and README.md. Verified with npm run typecheck, npm run lint, Vitest unit tests (games.test.ts, tileArtwork.test.ts, tileIpc.test.ts, approvedSites.test.ts), Impeccable detector, and Playwright E2E tests (tests/e2e/games.spec.ts).

Enhanced Picture Puzzle with both Jigsaw (interlocking tabs/blanks via getJigsawPieceEdges and buildJigsawPiecePath) and Rectangular Cards modes, a side-by-side Picture Guide preview card, and rich 6-zone SVG illustrations so every piece in 2x2 and 3x2 grids has distinct landmarks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the Built-in Games tile (schema v15 + migration 015), GamesOverlay hub with four calm offline games (Matching Pairs, Picture Puzzle with both Jigsaw and Rectangular Cards modes + Picture Guide preview, Gentle Tic-Tac-Toe, Melody Chimes) and caregiver-configured local installed Windows games, family photo integration with rich bundled SVG fallbacks, rapid-tap confusion exclusion for interactive game pieces, and the admin Games tab. Verified with typecheck, ESLint, Vitest unit tests, and Playwright E2E tests.
<!-- SECTION:FINAL_SUMMARY:END -->
