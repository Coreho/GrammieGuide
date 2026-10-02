---
id: TASK-05
title: 'Serve media files through a grammie-media:// protocol'
status: To Do
assignee: []
created_date: '2026-09-29 04:19'
updated_date: '2026-09-30 19:50'
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
- [ ] #1 grammie-media://<library>/<fileName> serves files only from the music and photos library folders; anything else returns 404
- [ ] #2 Empty names, names with slashes or "..", and names outside the safe character set are rejected before touching the filesystem
- [ ] #3 Responses carry the right Content-Type and support Range requests, so audio can seek
- [ ] #4 The launcher CSP allows the protocol for images and media only
- [ ] #5 Path validation is pure shared logic with unit tests
- [ ] #6 The admin window can also show photos and play narration through the protocol, with its CSP allowing it for images and media only
<!-- AC:END -->
