---
id: TASK-31
title: Decide whether the launcher and admin windows can run sandboxed
status: To Do
assignee: []
created_date: '2026-09-29 09:24'
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
- [ ] #1 It is known why each window has the sandbox off and what turning it on would break
- [ ] #2 Either both windows run with the sandbox on and all unit and e2e tests pass, or the reason they cannot is recorded in CLAUDE.md
- [ ] #3 TASK-05's media protocol design matches the outcome
<!-- AC:END -->
