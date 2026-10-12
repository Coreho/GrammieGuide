---
id: TASK-19
title: Settings backup and restore
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 05:54'
updated_date: '2026-10-12 18:00'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Integrate the existing backup PR with the merged photo viewer, typed provider keys and fixed tile positions. 2. Resolve conflicts while retaining the real Photos view and a calm fallback for unimplemented Music. 3. Verify secret stripping and preservation for both AI providers, old-backup migrations, rejection without writes, native-dialog admin workflows and missing media. 4. Run unit, lint, typecheck, build and Electron regressions, address review findings, then merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Left: (1) Red flag: out-of-scope change in src/renderer/launcher/src/tiles/builtins.tsx:30 adds MediaNotSetup overlay and makes photos/music builtin tiles return it (builtinFor), new imports OverlayShell, zLayers, LinkIcon; changes launcher behavior, reviewer to confirm. (2) Not reviewed because checks were still failing.

Integrated the current Home, photo viewer and provider changes into PR #26. Resolved conflicts by keeping both backup and photo APIs, retaining the registered Photos viewer, and reserving the temporary not-set-up view for Music. Fixed stale fixtures to use permanent slots and provider-scoped setApiKey; expanded secret checks to both Anthropic and OpenRouter. Validation before tile-photo integration: 777 unit tests, lint, typecheck and build; 11 Electron tests covering save/restore, rejection without writes, destination-secret retention, missing media and the full photo viewer. The former out-of-scope concern is covered by AC7 and the registered Photos view is preserved.
<!-- SECTION:NOTES:END -->
