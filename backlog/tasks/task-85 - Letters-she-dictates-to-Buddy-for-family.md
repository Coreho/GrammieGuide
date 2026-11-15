---
id: TASK-85
title: Letters she dictates to Buddy for family
status: To Do
assignee: []
created_date: '2026-11-15 05:43'
labels:
  - buddy
  - family
  - feature
milestone: m-12
dependencies: []
priority: medium
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She wants to tell family things between calls ("tell Sarah I loved the flowers") and forgets by the time they phone. Buddy should be able to take a short message and keep it for the caregiver to pass on. Nothing leaves the computer by itself: this is a note the caregiver reads, not a sending feature, so it doesn't depend on the SMS approval. This is the one place her words are kept, so it must be deliberate on her part and kept only for the caregiver.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 She can start a message by asking Buddy ("send a message to Sarah", "tell Tom ...") or from a button in chat, and Buddy reads it back before saving it
- [ ] #2 Saved messages appear in admin with the time and the family member named, and the caregiver can mark them passed on or delete them
- [ ] #3 Messages are never sent anywhere automatically and are never written to the activity or reliability logs; logs record only that a message was saved
- [ ] #4 Messages are kept on her computer in caregiver-only storage, outside config and backups, and old passed-on messages are removed after a set time
- [ ] #5 Buddy tells her plainly that the message is saved for family to see, never that it was sent or delivered
- [ ] #6 Tests cover saving, reading back, the admin list and that no message text reaches any log
<!-- AC:END -->
