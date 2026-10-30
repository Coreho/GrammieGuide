---
id: TASK-74
title: Stop packaged test copies taking over her kiosk
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T21:21:00Z'
updated_date: '2026-10-30T21:36:00Z'
labels: []
milestone: m-4
dependencies: []
priority: high
type: bug
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-30, running the end-to-end tests on her computer launched packaged copies of the app. The packaged app asks Windows for admin rights (`requestedExecutionLevel: highestAvailable`), so a launch from a normal shell shows an admin prompt, and an approved copy acted as the real app rather than a test copy. It re-registered the `GrammieGuide` startup task and `GrammieGuideWatchdog` at its own path, so her kiosk ran from a temporary folder, and deleting that folder left no working watchdog and a broken next boot. Home was off her screen twice, and an older build dropped her saved background color. It was repaired by hand. `kiosk-stacking.spec.ts` launched whatever was in `dist/win-unpacked`, so any full `npm run test:e2e` where that folder exists could repeat this. Nothing limited task registration to the installed copy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Only the exe at Program Files\GrammieGuide\GrammieGuide.exe registers the startup and watchdog tasks, from both app startup and the admin Re-register button
- [x] #2 A packaged copy anywhere else skips registration and says so in admin Reliability; dev and test runs stay quiet
- [x] #3 A full npm run test:e2e with an old dist/win-unpacked present launches no packaged copy
- [x] #4 The stacking test only runs against a package named in GRAMMIEGUIDE_PACKAGED_EXE, and refuses a package that asks for admin rights before launching it
- [x] #5 The docs say how to build the safe test package and why the default one must not be launched on her computer
- [ ] #6 After the next real install on her computer, both tasks still point at Program Files and the watchdog runs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure isInstalledExe() in services/reliability/installLocation.ts, comparing the whole path case-insensitively with ProgramFiles\GrammieGuide\GrammieGuide.exe. 2. Add it to shouldRegisterSystemTasks and guard inside registerSystemTasks, so the admin button is covered too; log a skip only for a packaged, non-test copy. 3. kiosk-stacking.spec.ts: drop the dist default, read the exe and refuse unless its manifest says asInvoker, before launching. 4. Unit tests for the path rule and both routes. 5. Update CLAUDE.md and README. 6. Verify: typecheck, lint, unit, build; spec skips with the variable unset; refuses a fake exe with no marker (harmless if the guard failed); passes on an asInvoker package; full e2e with the variable set. Never start a packaged copy without the E2E switch on her computer.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Second route found while researching: the admin Re-register button (reliabilityIpc.ts) calls registerSystemTasks directly, so the guard sits inside that function rather than at the startup call. Tests were mutation-checked: removing the guard or restoring the old rule fails the stray-copy cases. On her computer: the spec skipped with the variable unset and an old dist/win-unpacked present; refused a named file with no asInvoker marker; passed 3 of 3 on an asInvoker package. A packaged copy saw ProgramFiles as C:\Program Files, which the guard depends on. A real packaged copy without the E2E switch was deliberately never started on her computer, so the positive path through the real installer is only proven after the next install.

Full e2e on this branch: 187 of 187 including the stacking test on an asInvoker package, with the kiosk tasks unchanged throughout. kiosk-stacking.spec.ts is the only spec that sets executablePath, so skipping it is what makes a full run launch no packaged copy. AC 6 stays open until the next real install, so this task stays In Progress.
<!-- SECTION:NOTES:END -->
