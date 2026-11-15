---
id: TASK-78
title: Hide SMS callback requests until the carrier registration is approved
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13 20:31'
updated_date: '2026-11-13 20:52'
labels: []
milestone: m-7
dependencies: []
priority: high
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Twilio texts to US numbers need an approved A2P 10DLC campaign; until it is approved the callback feature can only show 'Sent', never 'Delivered'. Hide every SMS callback surface behind one main-process switch (smsCallbacksAvailable in services/contacts/smsCallbacks.ts), without deleting the caregiver's saved contacts, timing, enabled flag or credentials, so flipping SMS_CALLBACKS_RELEASED to true brings it back unchanged. WhatsApp Family calls stay as they are.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Home never shows Ask {name} to call while the switch is off, even when contacts.enabled is saved true
- [x] #2 admin Contacts hides Callback requests, SMS credentials, Test a callback text and the SMS disclaimer, while people, photos and saving still work and the saved enabled flag is kept
- [x] #3 Main refuses contacts:request and contacts:startTest, and contacts:home returns no contact, while the switch is off
- [x] #4 Buddy's distress guidance never points to the hidden button
- [x] #5 Existing contact e2e suites still run the feature by opting in with GRAMMIEGUIDE_SMS_CALLBACKS=1 under e2e, and one check proves it is hidden by default
- [x] #6 README, CLAUDE.md and docs/contact-requests.md say the feature is hidden and how to turn it back on
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add smsCallbacksAvailable() in services/contacts/smsCallbacks.ts (constant SMS_CALLBACKS_RELEASED=false; e2e opt-in only with GRAMMIEGUIDE_E2E=1)
2. Make toPublicConfig take the switch as a required argument so renderers see contacts.enabled=false
3. Gate contacts:home/request/startTest in contactIpc and Buddy's contactButton in buddyIpc
4. Expose AdminContactSetup.smsCallbacks and hide SMS sections in ContactsTab, keeping saved values
5. Unit tests, e2e opt-in for contact suites, new hidden-by-default spec; docs
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: npm test 1645 passed; typecheck and lint clean; full e2e 246 passed, 1 skipped (packaged stacking spec). Mutation check: removing the IPC or Buddy gate fails 3 unit tests. Also fixed a pre-existing race in tests/e2e/contact-test.spec.ts (it read the activity log before main's 10s poll logged contact-test-answered; failed 3/3 on main), now waits with expect.poll.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SMS callback requests are hidden behind one main-process switch (SMS_CALLBACKS_RELEASED=false in services/contacts/smsCallbacks.ts) until the A2P 10DLC campaign is approved. Home shows no button, admin Contacts shows only the people, Buddy never suggests the button, and main refuses requests and test texts; saved settings and credentials are kept. Verified by unit tests (incl. mutation check), the new sms-callbacks-hidden e2e spec and the full e2e suite.
<!-- SECTION:FINAL_SUMMARY:END -->
