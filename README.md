# GrammieGuide

A clean rewrite of `grandmas-launcher` - a dementia-friendly kiosk launcher for an elderly user, with a caregiver admin panel. Electron + React + TypeScript.

This is a **separate repo from `grandmas-launcher`**, which keeps running untouched on the real device as the safety net while this rewrite is built. Nothing here is merged from or into that repo - old code is referenced by path for patterns only.

Full rewrite plan (context, decisions, architecture, milestones): see the plan document from the planning session (`i-kinda-wanna-overhaul-moonlit-prism.md`).

## Status

- **M1 done** - scaffolding + reliability spine (typed config store with versioned migrations, shared PowerShell exec helper, watchdog/volume/Wi-Fi-healing rebuild), verified on real hardware.
- **M2 done** - kiosk Home screen (tile grid, embedded browser, weather, help, font-scale control) in the Clay Launcher design, plus the PIN-gated caregiver admin panel.
- **M3 done** - static 3D Buddy (procedural cat, tap-to-greet chat panel with a stubbed reply).
- **Next: M4** - real Anthropic-backed Buddy conversation, Buddy roaming.

## Scripts

- `npm run dev` - run in development
- `npm run build` - typecheck + build
- `npm run test` - unit tests (Vitest)
- `npm run typecheck` - TypeScript project references, no emit
- `npm run lint` - ESLint
- `npm run test:e2e` - Playwright E2E against the built app (run `npm run build` first)
- `npm run package` - Windows installer via electron-builder
