---
id: TASK-11
title: Keep Buddy from inventing facts or promises
status: To Do
assignee: []
created_date: '2026-09-29 05:53'
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
- [ ] #4 The prompt stays a single frozen string with no per-request values
- [ ] #5 A test pins the key rules in the prompt, and a manual check with a few confused statements (a parent coming to visit, needing to go to work) gets kind replies with no invented facts
<!-- AC:END -->
