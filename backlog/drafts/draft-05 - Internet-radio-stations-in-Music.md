---
id: DRAFT-05
title: Internet radio stations in Music
status: Draft
assignee: []
created_date: '2026-09-29 05:55'
updated_date: '2026-09-29 08:19'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec 03 included internet radio stations as playlist cards. Radio was split out of the Music task because music must work offline, and a stream fails whenever Wi-Fi does. Add it later as an optional card type that dims with "Not available right now" when the stream fails.

The launcher and admin Content Security Policies allow `media-src 'self' blob:` only, so playing a stream directly in an `<audio>` element, as spec 03 suggests, would be blocked, and so would the admin "Try it" preview. This needs either a deliberate CSP change limited to the saved station addresses or a main-process relay of the stream.
<!-- SECTION:DESCRIPTION:END -->
