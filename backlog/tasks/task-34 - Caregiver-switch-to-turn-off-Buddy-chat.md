---
id: TASK-34
title: Caregiver switch to turn off Buddy chat
status: Done
assignee: []
created_date: '2026-09-29 09:24'
updated_date: '2026-10-02 17:17'
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
- [x] #1 The caregiver can turn chat off in the admin Buddy tab, and Buddy stays on Home with his tap reactions
- [x] #2 With chat off, no chat button or chat panel appears and no API calls are made
- [x] #3 The change applies immediately, and a config migration adds the setting with chat on by default
- [x] #4 Tests cover the setting
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added buddy.chatEnabled (default true, migration 007, schema v7) with an admin Buddy tab checkbox. When off, Home hides chat button, invitation, menu entry and panel; main returns 'disabled' before any Anthropic client use. Tap reactions still work. Verified: lint, typecheck, 490 unit tests, build, 48 e2e tests incl. tests/e2e/buddy-chat-setting.spec.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
