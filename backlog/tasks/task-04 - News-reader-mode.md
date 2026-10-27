---
id: TASK-04
title: News reader mode
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 04:18'
updated_date: '2026-10-21 00:56'
labels: []
milestone: m-10
dependencies:
  - TASK-01
  - TASK-03
documentation:
  - docs/specs/05-news-tile-reader-mode.md
  - docs/video-reader-and-buddy-facts.md
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
- [x] #1 Tapping a story shows the extracted article (title, byline, date, then paragraphs, headings, quotes and images in order) in a clay panel at her font size, with no tappable links in the body
- [x] #2 While extracting she sees the headline and "Getting the story…"; if extraction fails the real page appears instead, with no error wording
- [x] #3 The nav bar switches between Show page and Show article without breaking Back
- [x] #4 Web tile pages that look like articles offer Show article
- [x] #5 Extracted HTML is sanitized to an allow-list before rendering: scripts, iframes, event handlers, links and non-http(s) images never render
- [x] #6 Logs record the News tile id for article opens, never the article address
- [x] #7 Unit tests cover the sanitizer, and an e2e test opens a local fixture story in reader mode
- [x] #8 Read aloud reads the whole article with the existing voice (Edge, Windows fallback), not just the first 1,200 characters the voice service takes per request, and stops as soon as she leaves the article
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bundle Readability in the sandbox preload and extract the current document with navigation-scoped state and timeout. 2. Sanitize article HTML into safe structured content, reuse protected raster image fetching, and render a clay reader with page/article toggle and chunked speech. 3. Test sanitizer, speech chunking, fixture article extraction, fallback, Back and stop-on-leave.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17: TASK-59 restores the approved multi-source website shelf as a separate feature. New News tiles default to Yahoo News, BBC News and NBC News preview cards opening their websites directly; existing feed tiles retain their story lists. This supersedes the earlier description that the shelf was replaced permanently. Reader extraction and article-mode criteria here remain unimplemented and out of TASK-59 scope.

Implemented Readability extraction in the bundled sandbox preload, DOMPurify allow-list conversion to a structured React tree, guarded raster images, headline/loading state with timeouts and quiet page fallback. Show page/article preserves native history; Back from a first News story returns to News. Read aloud chunks the full text below the TTS ceiling and cancels on leaving. Fixture tests pass extraction, metadata, safe body, toggling, Back, ordinary web articles and all five text sizes. Screenshot visually inspected. Fixed host-destruction shutdown regression and added regression coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented safe reader extraction, metadata and ordered content, page/article toggle preserving Back, guarded images and whole-article chunked narration with cancellation. Verified sanitizer/chunk/cancellation unit tests, local article and web-tile fixtures at all five font sizes, private logs and shutdown regression. Build and lint pass; full suite 1132 unit tests and 162 E2E tests pass; nine affected browser E2E cases pass again on the final build.
<!-- SECTION:FINAL_SUMMARY:END -->
