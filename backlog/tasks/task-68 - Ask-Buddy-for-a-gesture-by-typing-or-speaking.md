---
id: TASK-68
title: Ask Buddy for a gesture by typing or speaking
status: Done
assignee:
  - '@claude'
created_date: '2026-10-27 04:59'
updated_date: '2026-10-27 06:08'
labels: []
milestone: m-9
dependencies: []
references:
  - src/shared/buddy/actions.ts
  - src/main/services/ai/buddyChatService.ts
priority: high
type: feature
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She has no way to make Buddy do something herself: the gesture menu is a caregiver shortcut (Ctrl+Shift+B) and most clips are only reachable from admin. Asking him in chat ("Buddy, dance", "wave to me", "do a trick") is natural for her and needs no new buttons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Whole explicit requests such as "dance", "wave to me", "do a trick" or "take a bow" (typed or spoken, optionally with please or his name) make him perform the matching gesture with a short fixed reply, without the model, network or a ChatGPT connection
- [x] #2 With chat connected, other wording can ask for a gesture through a fixed tool limited to an allow-list; model text accompanying the tool is discarded
- [x] #3 The gesture plays in chat without closing it and is not cut short when his reply finishes speaking
- [x] #4 Reduced motion swaps big gestures for a calm wave or heart; the chat off switch still applies
- [x] #5 Sentences that merely mention a gesture word (for example "I used to dance with my husband") stay ordinary chat
- [x] #6 Unit tests cover parsing, the tool, the reduced-motion swap and the machine state; requests are never logged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add pure shared/buddy/gestures.ts: gesture names, whole-request parser (please, his name, can you, for me), fixed replies, reduced-motion swap to wave/heart, and the trick pool.
2. buddyChatService: an explicit gesture request returns { ok, reply, gesture } before contact/actions/model; a do_a_gesture tool (enum input) does the same on the model path, discarding model text.
3. BuddyChatResult gains gesture; the IPC passes buddy.motion.
4. Machine: GESTURE event in chat enters chat.gesturing (forced clip); phase changes only record the phase there; CLIP_DONE or the 20s timeout returns to routing. Outside chat it is ignored.
5. Panel plays the gesture, then says the reply without a reply gesture.
6. Unit tests: parser (including sentences that only mention a gesture), service paths, tool, reduced motion, machine.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parser strips please/can you/would you/his name/for me/again and accepts noun forms (do a little dance, give me a big wave), verb forms (dance, wave to me, jump up and down), take a bow, blow me a kiss/send me some love (heart) and do something silly (trick). Checked before Home actions so 'show me a trick' never becomes a tile search. Tool do_a_gesture with an enum input; text discarded. BuddyChatResult gains gesture; the panel calls onGesture then says the fixed reply with no opening gesture. New chat.gesturing state keeps CHAT_PHASE from routing until CLIP_DONE/timeout. e2e tests/e2e/buddy-gestures.spec.ts: 'Buddy, dance for me' plays a dance clip in chat with no ChatGPT connection, and 'I used to dance with my husband' does not.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
She can ask Buddy to dance, wave, bow, jump, cheer, stretch, send love or do a trick. Whole requests are parsed in main before any model (gestures.ts); other wording uses the allow-listed do_a_gesture tool. chat.gesturing keeps the gesture going while the fixed reply is spoken; reduced motion swaps to wave/heart. Verified by tests/unit/buddyGestures.test.ts, tests/e2e/buddy-gestures.spec.ts (dance with no ChatGPT connection, 'I used to dance' stays chat) and the updated buddy-prompt-wiring tool list.
<!-- SECTION:FINAL_SUMMARY:END -->
