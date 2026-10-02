---
id: TASK-34
title: Caregiver switch to turn off Buddy chat
status: In Progress
assignee: []
created_date: '2026-09-29 09:24'
updated_date: '2026-10-02 17:00'
labels: []
milestone: m-9
dependencies: []
priority: medium
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prompt rules make invented facts less likely but cannot guarantee it: `buddyChatService.ts` shows the model's text without checking it. If chat confuses or upsets her, the caregiver needs to turn chat off while keeping Buddy on Home.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can turn chat off in the admin Buddy tab, and Buddy stays on Home with his tap reactions
- [ ] #2 With chat off, no chat button or chat panel appears and no API calls are made
- [ ] #3 The change applies immediately, and a config migration adds the setting with chat on by default
- [ ] #4 Tests cover the setting
<!-- AC:END -->
