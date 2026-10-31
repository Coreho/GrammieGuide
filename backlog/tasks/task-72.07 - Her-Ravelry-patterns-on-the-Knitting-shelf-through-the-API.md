---
id: TASK-72.07
title: Her Ravelry patterns on the Knitting shelf through the API
status: To Do
assignee: []
created_date: '2026-10-31T22:47:00Z'
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
- [ ] #1 The caregiver enters a Ravelry username and read-only key in admin; the key stays in main-process encrypted storage and never reaches a renderer, a log or a backup
- [ ] #2 Her Ravelry view shows the patterns chosen for her as large picture cards with plain-text details, never remote HTML, and never needs Ravelry's website to read them
- [ ] #3 Pictures and details are fetched in main with a timeout and size cap and keep the last good copy offline; every failure shows a calm line
- [ ] #4 Response shapes are checked against the real API with the owner's key, and tests use fixtures from those responses
<!-- AC:END -->
