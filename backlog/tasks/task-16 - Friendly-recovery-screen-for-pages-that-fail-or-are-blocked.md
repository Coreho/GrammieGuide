---
id: TASK-16
title: Friendly recovery screen for pages that fail or are blocked
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
labels: []
milestone: m-10
dependencies: []
priority: medium
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a web page fails to load (no internet, the site is down, a certificate problem) she sees whatever Chromium shows, which is technical and confusing. She needs a calm screen that says what is happening in plain words and offers an obvious way back. Blocked navigations (see the approved-sites task) use the same screen. The way Home should look and sit the same on every page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a page fails to load she sees a calm screen in plain words with large Try again and Home buttons, never an error code or technical text
- [ ] #2 When the device is offline the screen says so plainly and tries again by itself when the connection returns
- [ ] #3 The Home button is in the same place on every web page, the recovery screen and reader view
- [ ] #4 The failure is logged with the domain and error type for the caregiver
- [ ] #5 An e2e test loads an unreachable local address and sees the recovery screen
<!-- AC:END -->
