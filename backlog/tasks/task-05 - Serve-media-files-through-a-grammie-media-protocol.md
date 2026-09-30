---
id: TASK-05
title: 'Serve media files through a grammie-media:// protocol'
status: To Do
assignee: []
created_date: '2026-09-29 04:19'
updated_date: '2026-09-29 09:25'
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
Music, photos, narration, photo tile images and contact photos will live under `userData`, but renderers must never get `file://` access (`webSecurity` stays on everywhere). A custom protocol serves only named files from known library folders. This is shared infrastructure item 1 in the specs overview. News thumbnails already reach the launcher as `data:` URLs from main, so the spec's `news-cache` library is not needed. Note: the launcher and admin windows currently run with `sandbox: false` (see TASK-31), so do not assume a sandbox protects them.
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
