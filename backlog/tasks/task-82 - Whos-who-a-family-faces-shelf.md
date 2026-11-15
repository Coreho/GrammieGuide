---
id: TASK-82
title: 'Who''s who: a family faces shelf'
status: To Do
assignee: []
created_date: '2026-11-15 05:43'
labels:
  - home
  - family
  - feature
milestone: m-12
dependencies: []
priority: medium
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She sometimes doesn't recognise family in photos or on calls and feels embarrassed to ask. A shelf with one large card per person (photo, name, how they are related, and a short recorded hello in their own voice) lets her check privately at any time. Family contacts with photos already exist (TASK-76) and photo stories already record and play audio (`services/photos/photoNarration.ts`, `useNarration.ts`); reuse them where they fit rather than duplicating people.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A built-in Who's who tile opens a shelf with one large card per person: photo, name and relationship
- [ ] #2 The caregiver adds, edits, orders and removes people in admin; each person can have a recorded or attached hello, using the same limits and checks as photo stories
- [ ] #3 Tapping a card plays that person's hello under the audio rules, with a large Stop
- [ ] #4 People and their hellos are stored outside config, are caregiver-only to change, and are never logged by name
- [ ] #5 A missing photo or recording shows a calm fallback, never an error
- [ ] #6 E2E covers adding a person in admin and seeing and hearing them on Home
<!-- AC:END -->
