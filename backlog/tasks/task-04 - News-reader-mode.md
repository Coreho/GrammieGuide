---
id: TASK-04
title: News reader mode
status: To Do
assignee: []
created_date: '2026-09-29 04:18'
updated_date: '2026-09-29 09:26'
labels: []
milestone: m-10
dependencies:
  - TASK-01
  - TASK-03
documentation:
  - docs/specs/05-news-tile-reader-mode.md
priority: low
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
News stories currently open as the full website in the kiosk browser, with the site's layout, ads, pop-ups and autoplay video. Reader mode shows the article itself (title, text and pictures) in the clay style at her font size. Web tile pages that look like articles can use it too.

The News tile, story list and feed parser this builds on arrived with PR #4, merged into `main` on 2026-09-29. This task still waits for ad blocking (TASK-03), because "Show page" and the extraction-failure fallback show the real site. Codex's review suggests leaving it until core recovery, contact and offline activities work.

Spec 05's "Reader extraction" section describes the approach. The rest of spec 05 (a multi-source shelf with screenshot previews) was replaced by the shipped design, one feed per News tile with stories as long cards, and is not part of this task. Feeds are parsed by the dependency-free `shared/news/parseFeed.ts`, not `fast-xml-parser`. Speech-out exists (`buddy:speak`), but `ttsService.ts` truncates each request at 1,200 characters (`MAX_SPEECH_CHARS`), so reading a whole article needs chunking. Story opens are private navigation: log the tile, never the article address.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tapping a story shows the extracted article (title, byline, date, then paragraphs, headings, quotes and images in order) in a clay panel at her font size, with no tappable links in the body
- [ ] #2 While extracting she sees the headline and "Getting the story…"; if extraction fails the real page appears instead, with no error wording
- [ ] #3 The nav bar switches between Show page and Show article without breaking Back
- [ ] #4 Web tile pages that look like articles offer Show article
- [ ] #5 Extracted HTML is sanitized to an allow-list before rendering: scripts, iframes, event handlers, links and non-http(s) images never render
- [ ] #6 Logs record the News tile id for article opens, never the article address
- [ ] #7 Unit tests cover the sanitizer, and an e2e test opens a local fixture story in reader mode
- [ ] #8 Read aloud reads the whole article with the existing voice (Edge, Windows fallback), not just the first 1,200 characters the voice service takes per request, and stops as soon as she leaves the article
<!-- AC:END -->
