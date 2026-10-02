---
id: TASK-05
title: 'Serve media files through a grammie-media:// protocol'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 04:19'
updated_date: '2026-09-30 22:38'
labels: []
milestone: m-8
dependencies: []
documentation:
  - docs/specs/00-overview.md
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Music, photos, narration, photo tile images and contact photos will live under `userData`. Renderers reach them only through a custom protocol that serves named files from known library folders; renderer code gets no filesystem access of its own. The protocol is what restricts access. Neither the sandbox nor `webSecurity` stops a page loaded from `file://` (both windows use `loadFile`) from referring to other local files. Serving the windows themselves from a custom protocol, as Electron's security guidance recommends, would close that gap and could be a follow-up. This is shared infrastructure item 1 in the specs overview. News thumbnails already reach the launcher as `data:` URLs from main, so the spec's `news-cache` library is not needed.

Since TASK-31 the launcher, admin and web view all run sandboxed with CommonJS preloads. The protocol needs nothing from the preloads. Register the scheme with `protocol.registerSchemesAsPrivileged` before the app is ready (`standard`, `secure`, and `stream` for audio; not `bypassCSP`), and install `protocol.handle` after ready and before the windows load. `stream` alone does not implement Range requests (AC 3). Protocol handlers belong to a session; everything currently uses the default session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 grammie-media://<library>/<fileName> serves files only from the music and photos library folders; anything else returns 404
- [x] #2 Empty names, names with slashes or "..", and names outside the safe character set are rejected before touching the filesystem
- [x] #3 Responses carry the right Content-Type and support Range requests, so audio can seek
- [x] #4 The launcher CSP allows the protocol for images and media only
- [x] #5 Path validation is pure shared logic with unit tests
- [x] #6 The admin window can also show photos and play narration through the protocol, with its CSP allowing it for images and media only
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure shared validation of library names and file names (unit tested): only known libraries, no empty names, slashes, "..", or characters outside a safe set.
2. Main-process protocol service: register `grammie-media` as privileged (standard, secure, stream; not bypassCSP) before ready, and handle it after ready and before windows load; serve only files inside the library folders under userData, with Content-Type and Range (206) support; everything else 404.
3. Launcher and admin CSP allow `grammie-media:` for img-src and media-src only.
4. E2E: an image and an audio file placed in a test user-data-dir load through the protocol, a Range request returns 206 with the right bytes, and bad names return 404.
Delegated to Codex (gpt-6.1-sol, yolo); Claude verifies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Codex (gpt-6.1-sol, yolo, session 01a0f45b-8512-7120-a6fc-dd2d814ca7fe): pure shared/media/mediaPath.ts (libraries music and photos; file names 1-255 of A-Z a-z 0-9 . _ -, no "..", no trailing dot, no Windows device names; decoded once from the raw URL) and byteRange.ts; main services/media/mediaProtocol.ts (privileged standard/secure/stream, 404 for anything invalid, Content-Type by extension, single-range 206 and 416, streamed, symlinks checked against the library); libraries at userData/media/music and userData/media/photos (libraryPaths.ts, for TASK-06); CSP allows grammie-media: for img-src and media-src only in both windows. Claude review fix: the library folder is resolved with realpath too, so a profile reached through a junction does not reject every file. Codex also enabled supportFetchAPI (renderer CSPs still block fetch). Verified by Codex and again by Claude: unit 110 in the three media files, full unit suite, build, full e2e 31 passed (mediaProtocol.spec: both windows load a PNG and play and seek a WAV; Range bytes and headers; bad names, unknown libraries and missing files give 404).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
grammie-media://<library>/<file> now serves photos and audio from userData/media/{music,photos} to both windows, with strict name validation, Content-Type, Range support and 404 for everything else; CSPs allow it only for images and media. Verified with unit and e2e tests.
<!-- SECTION:FINAL_SUMMARY:END -->
