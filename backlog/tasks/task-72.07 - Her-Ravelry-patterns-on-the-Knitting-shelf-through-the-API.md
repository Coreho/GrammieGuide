---
id: TASK-72.07
title: Her Ravelry patterns on the Knitting shelf through the API
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T22:47:00Z'
updated_date: '2026-11-01T09:50:00Z'
labels:
  - knitting
dependencies:
  - TASK-72.06
references:
  - https://www.ravelry.com/groups/ravelry-api
  - https://www.ravelry.com/api
parent_task_id: TASK-72
priority: medium
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner pointed to Ravelry's API (ravelry.com/groups/ravelry-api) on 2026-10-31. Showing saved patterns as large calm cards would let her browse without Ravelry's busy website. Checked 2026-10-31: api.ravelry.com answers 401 without credentials, even for pattern search, and the docs at ravelry.com/api and the developer page ravelry.com/pro/developer redirect to login, so the response shapes must be confirmed against the real API with the owner's key before building. Third-party clients describe Basic auth with an access key and personal key for one's own account. Ravelry's public terms (ravelry.com/about/terms) don't mention the API; check the terms shown on the API pages once signed in.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver enters a Ravelry username and read-only key in admin; the key stays in main-process encrypted storage and never reaches a renderer, a log or a backup
- [x] #2 Her Ravelry view shows the patterns chosen for her as large picture cards with plain-text details, never remote HTML, and never needs Ravelry's website to read them
- [x] #3 Pictures and details are fetched in main with a timeout and size cap and keep the last good copy offline; every failure shows a calm line
- [x] #4 Response shapes are checked against the real API with the owner's key, and tests use fixtures from those responses
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read-only key only: a personal key has full read and write access to the Ravelry account (messages, forums), so the form refuses any username not starting read-. The read-only key can't read favorites (403), so the caregiver searches Ravelry and picks patterns in admin instead of favoriting them.
2. Key in userData/ravelry-key.enc through safeStorage, never config, never returned to a renderer, never in a backup. Saved only after one real test request succeeds.
3. Main-only service: fixed api.ravelry.com, Basic auth, 10s timeout, 2 MB cap, no redirects. Pictures through the news image guard (public address, raster only, size cap) and re-encoded through the photo pipeline into a new ravelry media library.
4. A pick is a saved copy in the knitting file (ravelry array, default empty): name, designer, plain-text facts and notes, picture IDs. Home reads only that copy, so it never touches the network or the key and works offline. No background refresh.
5. Home: the shelf's Ravelry card opens a list of her picks plus the website card when the switch is on; with no picks it opens the website as before. A pick opens large pictures with plain text beside them.
6. Admin: key form, search with thumbnails, add and remove picks.
7. Unit and e2e tests with stand-in responses from the documented shapes, then replace the fixtures with captures from the owner's real key (AC 4 stays open until then).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-11-01. Real API with the owner's read-only key: username starts read-, search and pattern replies match the parser, /current_user.json gets 403 so the key can't reach the account, a wrong password gets 403, pictures are JPEG or PNG (medium2 about 210 KB). Fixtures are those replies, trimmed. Live run in the built app from a throwaway data folder: the key was accepted through the admin form and not plain text on disk, 12 results with all thumbnails loaded, two real patterns added, 18 JPEGs saved, Home's data carries no Ravelry addresses and no key. Unit: 1567 passed. E2E: the 13 Ravelry tests passed before two small later edits (notes end at a sentence; admin's status line moved above the results). Ten deliberate breaks of safety rules were all caught by tests. Decision: no background refresh, so Home never uses the network; remove and add a pattern again to refresh it. Decision: the read-only key can't read favorites, so patterns are picked in admin. Not done: the full e2e suite has not completed; the 2026-11-01 run collapsed under low memory (workers exiting 0xC0000142, 9 passed, 161 did not run), which tests nothing either way. Ravelry's API terms weren't readable from here; the owner saw them when creating the key.
<!-- SECTION:NOTES:END -->
