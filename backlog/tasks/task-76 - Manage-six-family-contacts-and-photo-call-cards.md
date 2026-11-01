---
id: TASK-76
title: Manage six family contacts and photo call cards
status: Done
assignee:
  - '@codex'
created_date: '2026-11-01T19:47:00Z'
updated_date: '2026-11-01T19:53:00Z'
labels: []
dependencies: []
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Family calling needs an ordered contact list while preserving existing contacts and callback requests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Admin can add edit remove and reorder up to six people with names photos and numbers
- [x] #2 Family calls shows six photo cards without scrolling with voice and video controls
- [x] #3 Saved callers show their name and unknown callers remain blocked
- [x] #4 Existing contacts carry over and callbacks use the first two people
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migrate the saved pair to a validated ordered list capped at six, preserving IDs and photos. 2. Build contact editing and ordering in admin and photo cards in Family calls. 3. Wire all saved callers to the existing allow-list and derive callback destinations from the first two. 4. Verify migrations, validation, callbacks, calling and no-scroll layout with unit and Electron tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema 22 migration preserving saved IDs photos credentials and callback timing. Admin manages a maximum of six ordered people. Home displays a three-column two-row photo grid with voice and video controls. Existing incoming-call allow-list now reads the complete saved list; callbacks use only the first two. Verification: build and typechecks pass; lint passes; all 1617 unit tests pass; all 13 contact-family and WhatsApp Electron tests pass. New Electron coverage exercises editing adding reordering removal photo selection and no-scroll layouts at 1280x720 and 1920x1080 with minimum and maximum font settings. Calling tests use a local provider fixture.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added six-person contact management and large Family calls photo cards. Existing saved contacts migrate automatically; all saved callers retain named incoming controls and unknown callers remain blocked. Callback requests preserve their lifecycle using the first two people. Build lint 1617 unit tests and 13 Electron tests pass. Real-phone calling was not exercised in this change.
<!-- SECTION:FINAL_SUMMARY:END -->
