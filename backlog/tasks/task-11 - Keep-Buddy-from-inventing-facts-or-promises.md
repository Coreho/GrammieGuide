---
id: TASK-11
title: Keep Buddy from inventing facts or promises
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-09-29 09:07'
labels: []
milestone: m-9
dependencies: []
priority: high
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Buddy's system prompt (`services/ai/buddyPrompt.ts`) says that when she says something confused or untrue he should "gently go along with the conversation". Meeting the feeling instead of arguing is right for dementia care, but "go along" invites the model to confirm false things ("yes, your mother is coming to pick you up") or invent details about her family, plans and appointments. Warmth should never turn into invented facts or promises. The prompt already forbids promising to call, message or visit.

The prompt is deliberately frozen (no per-request values) so it stays a cacheable prefix; keep it that way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Buddy still responds to the feeling behind confused statements without correcting or arguing
- [ ] #2 Buddy never confirms a false statement as true, and never invents facts about her family, plans, visits or appointments
- [ ] #3 Asked about plans or people he has no saved information on, he answers warmly without guessing, for example by suggesting she ask her family
- [x] #4 The prompt stays a single frozen string with no per-request values
- [ ] #5 A test pins the key rules in the prompt, and a manual check with a few confused statements (a parent coming to visit, needing to go to work) gets kind replies with no invented facts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented by Codex (session 01a0ec5c-5116-7c01-bc87-d8515ade7db1): replaced "gently go along with the conversation" with rules against confirming false statements, inventing people/plans/visits/appointments, and guessing. Added tests/unit/buddyPrompt.test.ts (5 tests, including a source check that the prompt stays one uninterpolated constant). Codex's sandbox could not start processes, so Claude ran verification: npm test 20 files / 260 tests passed, typecheck and lint clean. Not yet done: the manual check of live replies (AC 5) needs a real chat with the API key; ACs 1-3 are behavioral and are proven only by that check.
<!-- SECTION:NOTES:END -->
