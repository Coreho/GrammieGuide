---
id: TASK-87
title: Install updates on her computer without a visit
status: To Do
assignee: []
created_date: '2026-11-15 05:44'
updated_date: '2026-11-15 05:54'
labels:
  - reliability
  - updates
  - feature
milestone: m-13
dependencies: []
references:
  - docs/kiosk-install.md
priority: high
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every new version currently means building an installer and installing it at her computer, so fixes wait for a visit. Updates should come from versions the owner publishes on purpose (for example GitHub Releases; the repo is public) and install without anyone at her computer. Decided by the owner on 2026-11-15: automatic. Download in the background, install overnight only while nothing is playing and nobody has used the computer for a while; a setting can switch to install only when the caregiver clicks Install in admin. Known risks: the installer is per-machine with `highestAvailable` (`package.json` build block), so an unattended install must not stop at a Windows admin prompt; the watchdog and quit flag must not fight the restart; and a broken update must not leave her without Home (the TASK-25 health record shows whether a start reached Home).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The app only installs versions the owner published, checked by hash over HTTPS before installing, and never offers a downgrade unless rolling back
- [ ] #2 By default an update installs overnight, only when no audio hold is active and the computer has been idle for a set time; otherwise it waits for the next night
- [ ] #3 A caregiver setting switches to manual mode, where admin shows the waiting version and an Install now button
- [ ] #4 The unattended install completes without a Windows admin prompt on her computer, and the watchdog neither relaunches the old version mid-install nor gives up afterwards
- [ ] #5 If the new version fails to reach Home, the previous version is restored automatically and the caregiver sees why
- [ ] #6 Admin's Status tab shows the running version, when it last updated and any update failure
- [ ] #7 Update checks and installs are logged as content-free reliability events, and docs/kiosk-install.md explains publishing a release
<!-- AC:END -->
