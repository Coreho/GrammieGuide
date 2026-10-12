---
id: TASK-09
title: Music library and playlists
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 04:20'
updated_date: '2026-10-12 18:41'
labels: []
milestone: m-8
dependencies:
  - TASK-05
  - TASK-06
documentation:
  - docs/specs/03-music-tile.md
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The caregiver side of music: importing familiar songs and arranging them into a few playlists. It must work offline, so it covers local files only; internet radio is a separate draft, and Spotify is not scheduled. The player she uses on Home was split out into TASK-37 after Codex's review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The admin Music tab imports mp3, m4a, aac, flac, ogg and wav, reading title, artist, length and album art from each file
- [x] #2 Imports copy files into the media library and report files that fail without stopping the batch
- [x] #3 The caregiver builds up to 6 playlists from imported tracks, each with a name and shuffle on or off, and sets the auto-stop time and whether the now-playing chip shows
- [x] #4 Removing a track removes it from every playlist
- [x] #5 Admin music channels call requireAdminUnlocked() first
- [x] #6 Tests cover import metadata, failed files and playlist editing
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add tested typed music metadata, playlists and settings with migration 011. 2. Extend the managed library transaction to publish an audio copy with optional bounded JPEG cover art and metadata atomically. 3. Add main-only metadata parsing and admin-only batch import, listing, playlist editing and track deletion that cleans every playlist. 4. Build the Music admin tab for imports, tracks, up to six ordered playlists, shuffle, auto-stop and chip settings. 5. Verify real supported audio fixtures and failed files, metadata and cover extraction, original preservation, lock boundaries, playlist editing/removal and persistence in Electron; run relevant unit and build checks. Radio remains outside this task as recorded in its description.

6. Address PR #39 review: serialize legacy removal with playlist writes/imports, prove the deletion/save race is prevented, and align music import extensions with the existing protocol-supported formats.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented main-only metadata parsing with music-metadata 12.1.1 (official Context7 docs checked; MIT, Node >=22). The lockfile adds only the parser chain, with uint8array-extras 1.5 to 1.6 required by that chain; the dependency audit has the same ten existing advisories as baseline and none in the new parser chain. Real original synthetic fixtures exercise MP3 (including art), M4A, AAC, FLAC, OGG and WAV. ADTS AAC has no title/artist tags, so its filename is the fallback. Audio, metadata and bounded JPEG cover are published together and failed index writes remove both copies. Imported originals remain untouched. Admin Music can edit ordered/shuffled playlists and settings; song deletion removes references before deleting audio, so a rejected config save cannot delete a referenced song. The Home player remains TASK-37. Current validation: 816 unit tests, five real Electron workflows, lint/typecheck/build; full 106-test Electron suite running.

Final validation: all 816 unit tests and all 106 Electron tests pass, plus lint, typecheck and production build. The five Music flows cover actual six-format imports with one corrupt file, tags/duration/native JPEG cover, serving every copied audio file, source-byte preservation, two ordered playlists, shuffle/auto-stop/chip preferences, six-playlist limit, invalid-setting rejection without writes, removal from every playlist and both media files, restart persistence and all admin lock boundaries. Screenshot reviewed. Disabling failed-save cleanup caused the rollback unit test to fail with both copied files left behind; restored the implementation and all four music-library tests passed again.

PR #39 review fixes: reproduced the legacy-removal/settings-save race in a regression test (failed with a deleted track still referenced). Both legacy library removal and Music handlers now use one shared operation queue and recheck the lock after waiting. The regression and all 820 unit tests pass. MUSIC_EXTENSIONS now derives from the existing protocol/import registry, preserving OGA, Opus and WebM as well as the six required formats; real synthetic fixtures and metadata tests cover all nine. Final Electron validation after queue changes: 12 music/media-protocol checks; after extending the importer fixture set: all five Music flows pass with nine imported formats plus a corrupt file. Build/typecheck/lint pass. The duplicate count-interface comment is non-behavioral and does not require a bug fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added offline Music imports and up to six ordered/shuffled playlists with listening preferences. Originals remain intact; imports continue after failures; audio, metadata and art publish together. All music removal paths serialize with playlist writes. Verified 820 unit tests, full 106 Electron checks before review fixes, 12 media/music regressions and five final nine-format flows, plus lint/typecheck/build.
<!-- SECTION:FINAL_SUMMARY:END -->
