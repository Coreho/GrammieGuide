---
id: TASK-42
title: Clean up leftover temp files in media libraries
status: Done
assignee: []
created_date: '2026-10-02 18:00'
updated_date: '2026-10-04 08:27'
labels: []
milestone: m-8
dependencies:
  - TASK-06
priority: low
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while reviewing PR #23 (TASK-06). A crash or power cut during import, save or remove can leave .import.tmp and .index.tmp files, or a media file the index no longer lists. Nothing sweeps them, so disk use on her machine slowly grows. Deleting unlisted files is dangerous when the index itself could not be trusted, which is why the safety criterion below matters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Leftover .import.tmp and .index.tmp files are removed the next time the library loads
- [x] #2 Media files that no index entry lists are removed, and every file the index lists is left alone
- [x] #3 Nothing is swept when the index could not be read, or when a corrupt index could not be backed up
- [x] #4 The sweep runs inside the library's operation queue and never delays the kiosk starting
- [x] #5 Unit tests cover each kind of leftover and prove that listed files survive
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-04, Codex - AC 3 re-verified before merge; the PR description was stale, written before the 'address review findings' commit.
The data-loss worry in the PR body was real but has been fixed: load() sets a local indexTrusted only after parseIndex succeeds, and the sweep deletes UUID-named media only when indexTrusted. So a corrupt index that was successfully backed up now removes temp files and preserves every media file, because a backup cannot tell us which files were in use. Verified by the test 'sweeps after backing up a corrupt index and preserves the backup verbatim'.
Read failures (EBUSY/EPERM) throw before any readdir. A corrupt index whose backup fails sets recoveryError and the whole sweep block is skipped.
On the remaining review note: ENOENT (no index at all) skipping the sweep is deliberate and already pinned by 'does not scan or delete anything when reading the index fails with %s', which asserts readdir is not called for ENOENT too. A library with no index has nothing published, so there is nothing safe to clean and nothing to mis-delete; I documented the reasoning in the README rather than changing tested behaviour. This closes the note honestly instead of leaving it implied.
Merged main in to pick up PR #24 (TASK-41); the README conflict was both media paragraphs describing different tasks, so both were kept.
Verified on the merged tree: lint clean, typecheck clean, npm test 642 passed (37 files).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Library load now sweeps leftovers inside the operation queue with no kiosk startup cost: .import.tmp/.index.tmp always, and unlisted generated-name media files only when the index parsed successfully - so a corrupt index that was merely backed up can never delete a photo or a track. Listed files, corrupt-index backups and unrelated files are all preserved, busy files are left for the next load, and a cleanup failure never stops the library being used. Verified by unit tests covering each kind of leftover, an unreadable index, a failed backup, a corrupt-but-backed-up index, and readdir/rm failures; 642 unit tests pass with lint and typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
