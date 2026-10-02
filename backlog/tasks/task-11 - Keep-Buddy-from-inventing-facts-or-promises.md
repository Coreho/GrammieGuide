---
id: TASK-11
title: Keep Buddy from inventing facts or promises
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-29 05:53'
updated_date: '2026-09-30 19:22'
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

Live reply check, 2026-09-30 (Claude). No Anthropic API key is saved on the dev machine, so this did not go through the app. Instead the statements were sent with `claude -p --safe-mode --tools "" --model claude-haiku-4-5 --system-prompt-file <this prompt>` on the owner's Claude subscription, extended thinking off. Same model and same system prompt as the app, but Claude Code also adds a few environment reminders (folder, date, model name), so it is a close stand-in, not the app's exact request. 8 statements, 2 runs each. Result: (a) Questions about people or plans he knows nothing about (when is my daughter coming, did Sarah say Sunday, what time is my doctor's appointment): 6 of 6 replies said he is not sure and suggested asking her family. The prompt on main never suggested that in 3 runs and spoke as if a visit was coming. (b) Requests he cannot do (call my son, take me home): 4 of 4 said kindly that he cannot, with no promise. (c) Confused statements (my mother is coming to pick me up, I need to go to work today): 4 of 4 replies were kind and did not argue, but went along with the premise ("I am sure it will be nice to see her", "I hope work goes well for you"), the same as the prompt on main. So AC 1 looks met, AC 3 looks met, and AC 2 is not met for confused statements: he no longer invents details, but he still treats the visit or the workday as real. Minor: one reply guessed "maybe they left you a note", and one husband reply asked "Is he usually home around this time of day?". Tried one extra rule (treat what she says about visits or work as something on her mind, never reply as if it will happen, ask about the person instead): 5 of 6 mother and work replies stopped affirming, but the wording turned stiff ("How lovely that your daughter is on your mind") and new guesses appeared ("Let me help you look for your coat", "look out the window to see if his car is there"). Not applied; the wording is the owner's call. No acceptance criteria were checked from this run.

Prompt tuning, 2026-09-30 (Claude, via `claude -p` on the owner's Claude subscription as described above; five rounds, about 400 replies; raw replies were kept in the session's scratch folder only). Candidates were checked on statements that no candidate's examples mention, so passing isn't just copying an example.
- Applied to the prompt (uncommitted): a new rule after "Never confirm a false or confused statement as true": when she talks about people, plans or places as if they are part of today, neither agree nor disagree that it is happening; answer the feeling and ask about the person, place or memory; one Good example and two Not good examples. Unit test added that pins it (buddyPrompt.test.ts, 6 tests pass).
- Haiku 4.5 (the current default model): with the new rule, mother and work statements were clean in 12 of 12 replies (before: 0 of 4). On unseen statements it still went along with roughly a third to a half ("I hope the drive goes smoothly for you both", "How lovely that your sister is phoning you!"). Broader lists of situations or banned openings made it worse (mother 0 of 6 with a longer list). Wording alone does not fix Haiku.
- Sonnet 5.5 with the new rule: 24 of 24 replies neither agreed nor disagreed, stayed warm and asked about the person ("I can't see the door from here, so I'm not sure. Your family would know, so you could ask them. You must be thinking of him. What is he like?"). Even the unchanged PR #7 prompt went along with 0 of 16 on Sonnet 5.5, though its replies were formulaic ("I am not sure about today's plans, but your family could tell you more"). Median reply time: Sonnet 5.5 about 2.2 s, Haiku about 0.8 s (API time only, before speech).
- Sonnet 5 (the Sonnet option in the admin model list today; Sonnet 5.5 is not in the list) with the round-4 wording: 1 of 3 still leaned in ("That will be nice to hear her voice"), 1.2 to 2.2 s.
- Other leftovers on Haiku: suggesting she look around the house or out of the window for her husband, and "Let me help you find your coat".
Decision for the owner: keep Haiku with the new rule (better, not reliable), or switch Buddy to Sonnet 5.5 (reliable in these checks; slower and costs more per message), which needs Sonnet 5.5 added to the admin model list. AC 2 is not checked until that is decided.

Owner approved on 2026-09-30: keep the new prompt rule and make Claude Sonnet 5.5 the default model. configSchema default and defaultConfig() now use claude-sonnet-5-5 (saved configs keep their model; no migration, the installer has not been run on her machine yet); the admin model list offers Sonnet 5.5 as recommended and says Haiku is more likely to play along with confused statements; CLAUDE.md and README updated. Unit test pins the default and that it is sent effort low (the API reference confirms Sonnet 5.5 accepts effort low; Haiku 4.5 still gets none). Verified: typecheck, lint, unit tests 262 passed, build, e2e 22 passed. Still open: a short check in the real app with an API key before merging, since the tuning ran through Claude Code rather than the app's own request.
<!-- SECTION:NOTES:END -->
