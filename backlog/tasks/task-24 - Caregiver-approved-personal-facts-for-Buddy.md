---
id: TASK-24
title: Caregiver-approved personal facts for Buddy
status: Done
assignee:
  - '@codex'
created_date: '2026-09-29 05:55'
updated_date: '2026-10-21 00:56'
labels: []
milestone: m-9
dependencies:
  - TASK-11
documentation:
  - docs/video-reader-and-buddy-facts.md
priority: low
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy knows nothing about her, so he can neither use her family's names nor answer "when is Sarah coming?". Personal details should come only from what the caregiver saved, so warmth never turns into invented plans. Dated plans and appointments must be tied to real saved entries and stop being mentioned once they are past. The system prompt is a frozen, cacheable prefix, so the facts need to go somewhere that keeps it that way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The caregiver can add, edit and remove personal facts (family, home, routines, favorite things) and dated plans or appointments in admin
- [x] #2 Buddy uses only these for personal details, and says warmly that he does not know when asked about anything not saved
- [x] #3 Plans and appointments are mentioned only up to their date, never after
- [x] #4 Facts go to the API only as conversation context and are never written to the activity log
- [x] #5 The system prompt stays frozen; tests cover how facts are added to each request
- [x] #6 Plans and appointments use her local time zone, and a cancelled or deleted fact is no longer given to Buddy from the next reply on, even mid-conversation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add bounded caregiver facts and date-only plans with a versioned migration and admin editor; plans stay current through their saved date in the kiosk local timezone. 2. Supply the current approved facts as conversation context on every API request without changing the frozen system prompt or logs; discard API history predating edits or expiry so removed facts cannot re-enter through old replies. 3. Test schema/migration, timezone expiry, cancellation/deletion during chat, API request shape/privacy, and caregiver CRUD in the built app.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema/migration 017 and caregiver CRUD for 50 bounded facts/dated plans. Plans expire after their local calendar date; cancelled plans are excluded. Each request gets current approved context without changing the frozen prompt or logging content. Fact changes discard earlier API history; provider results are revalidated before release to discard replies made stale while thinking. Review fixes include cancellation reset when changing a plan into an ordinary fact. Tests cover migration, timezone/DST expiry, cancellation/deletion, in-flight edits, request shape/log privacy and caregiver CRUD. Date-condition mutation was caught by the expiry test.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-29 09:25
---
Deferred to Low after Codex review (2026-09-29): build after contact, recovery and offline activities.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added caregiver fact/plan CRUD and schema migration 017. Current facts enter conversation context without changing the frozen system prompt or logs. Local-date expiry, cancellation/deletion, stale-history removal and in-flight reply revalidation are tested. Caregiver CRUD E2E passes; build, lint, 1132 unit tests and the 162-test E2E suite pass. Model instruction-following is not a formal guarantee; the documented real-model personalization check remains advisable.
<!-- SECTION:FINAL_SUMMARY:END -->
