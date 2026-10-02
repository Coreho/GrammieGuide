---
id: TASK-19
title: Settings backup and restore
status: In Progress
assignee: []
created_date: '2026-09-29 05:54'
updated_date: '2026-10-02 20:55'
labels: []
milestone: m-11
dependencies: []
priority: medium
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rebuilding her setup after a reinstall, a new device or a bad change means re-entering every tile, contact and setting by hand. The config store already falls back to defaults when the file is corrupt, which protects the boot but loses her setup. A backup file lets the caregiver save and restore it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can save a backup file of all settings and tiles from admin, and restore it on this or another device
- [ ] #2 Backups never contain secrets (the API key, the PIN hash and salt, or contact channel tokens), and restoring keeps the device's existing secrets
- [ ] #3 An older backup is upgraded through the config migrations; an invalid file is rejected in plain words and changes nothing
- [ ] #4 The backup says plainly that photo and music files are not included
- [ ] #5 Backup and restore are admin-only (requireAdminUnlocked)
- [ ] #6 Tests cover secret stripping, upgrading an old backup, and rejecting a bad file
- [ ] #7 Restoring on a device that lacks the photo or music files shows those items as not set up yet, never as broken
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Left: (1) Red flag: out-of-scope change in src/renderer/launcher/src/tiles/builtins.tsx:30 adds MediaNotSetup overlay and makes photos/music builtin tiles return it (builtinFor), new imports OverlayShell, zLayers, LinkIcon; changes launcher behavior, reviewer to confirm. (2) Not reviewed because checks were still failing.
<!-- SECTION:NOTES:END -->
