---
id: TASK-31
title: Decide whether the launcher and admin windows can run sandboxed
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 09:24'
updated_date: '2026-09-30 19:57'
labels: []
milestone: m-10
dependencies: []
priority: medium
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`windows/windowManager.ts` creates the launcher and admin windows with `sandbox: false`, while the embedded browser runs sandboxed. Earlier planning (TASK-05) wrongly assumed the sandbox was on everywhere. Sandboxing limits what a compromised renderer can do, but it requires preloads that only use sandbox-safe APIs, and electron-vite projects often start with it off for convenience.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 It is known why each window has the sandbox off and what turning it on would break
- [x] #2 Either both windows run with the sandbox on and all unit and e2e tests pass, or the reason they cannot is recorded in CLAUDE.md
- [x] #3 TASK-05's media protocol design matches the outcome
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build all three preloads as CommonJS (`[name].cjs`, `format: 'cjs'`) in electron.vite.config.ts: a sandboxed preload runs as a plain script, so the ES module output could not load (confirmed on 2026-09-30: the web page's preload fails with "Cannot use import statement outside a module", so taps inside web pages never reset the idle timer).
2. Point the launcher, admin and web-view preload paths at the .cjs files and set `sandbox: true` for the launcher and admin windows.
3. E2E: every window and the web view report sandbox on, both bridges work, the web view's preload loads without error, and a tap inside a web page reaches main as browserView:activity.
4. CLAUDE.md records the rule (CommonJS preloads, only electron renderer APIs at runtime); README notes the fix.
5. Correct TASK-05's premise (sandboxing and webSecurity don't by themselves keep file-loaded pages from local files; the custom protocol is what restricts it) and record the protocol privileges Codex listed.
Investigation by Codex (read-only); implementation and verification by Claude.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigation by Codex (read-only, session 01a0f3c7-339e-7400-9097-7eaa344946ca): all three preloads use only contextBridge/ipcRenderer at runtime (shared imports are `import type`), so they are sandbox-safe; the blocker was the build format. With "type": "module", electron-vite emitted ES module preloads (.mjs), and a sandboxed preload runs as a plain script. Nothing in the renderers needs Node. Codex also found that TASK-05's premise was wrong.
Confirmed by Claude on 2026-09-30 before the change: in a built app, the web view logged `preload-error ... browserView.mjs: SyntaxError: Cannot use import statement outside a module`, and taps inside a web page sent no browserView:activity, so the idle timeout could close a page she was actively reading.
Change: electron.vite.config.ts builds preloads as CommonJS `[name].cjs`; launcher, admin and web-view preload paths point at .cjs; launcher and admin now run `sandbox: true`. New tests/e2e/sandbox.spec.ts checks both windows and the web view report sandbox on, both bridges work, no preload errors, and a tap inside a web page reaches main. TASK-05's description corrected and given the protocol privileges. CLAUDE.md and README updated.
Verified: typecheck and lint clean, unit tests 255 passed, build ok, full e2e 24 passed. One earlier full run had the News story test time out waiting for the page while a winget install ran at the same time; it passed 3 of 3 alone and in the clean full rerun.
Not checked: `npm run dev` startup (same preload build, not run).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Both windows now run sandboxed. The only blocker was the preload build format (ES modules, which a sandboxed preload cannot load), so preloads are now built as CommonJS. That also fixes a live bug: the web view's activity preload had never loaded, so taps inside web pages did not reset the idle timer. Verified with a new sandbox e2e spec and the full suites (unit 255, e2e 24). TASK-05 now states the correct reason for its protocol and the privileges it needs.
<!-- SECTION:FINAL_SUMMARY:END -->
