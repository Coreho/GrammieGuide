---
id: TASK-24
title: Caregiver-approved personal facts for Buddy
status: To Do
assignee: []
created_date: '2026-09-29 05:55'
updated_date: '2026-09-29 09:25'
labels: []
milestone: m-9
dependencies:
  - TASK-11
priority: low
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy knows nothing about her, so he can neither use her family's names nor answer "when is Sarah coming?". Personal details should come only from what the caregiver saved, so warmth never turns into invented plans. Dated plans and appointments must be tied to real saved entries and stop being mentioned once they are past. The system prompt is a frozen, cacheable prefix, so the facts need to go somewhere that keeps it that way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can add, edit and remove personal facts (family, home, routines, favorite things) and dated plans or appointments in admin
- [ ] #2 Buddy uses only these for personal details, and says warmly that he does not know when asked about anything not saved
- [ ] #3 Plans and appointments are mentioned only up to their date, never after
- [ ] #4 Facts go to the API only as conversation context and are never written to the activity log
- [ ] #5 The system prompt stays frozen; tests cover how facts are added to each request
- [ ] #6 Plans and appointments use her local time zone, and a cancelled or deleted fact is no longer given to Buddy from the next reply on, even mid-conversation
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-29 09:25
---
Deferred to Low after Codex review (2026-09-29): build after contact, recovery and offline activities.
---
<!-- COMMENTS:END -->
