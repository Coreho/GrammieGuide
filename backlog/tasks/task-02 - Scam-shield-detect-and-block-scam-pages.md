---
id: TASK-02
title: 'Scam shield: detect and block scam pages'
status: To Do
assignee: []
created_date: '2026-09-29 04:18'
labels: []
milestone: m-5
dependencies:
  - TASK-01
documentation:
  - docs/specs/01-scam-shield.md
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fake virus alerts with a phone number, "your account is locked, call now" pages, and gift-card or payment traps are the scams most aimed at elderly web users. When a page trips the shield, she is taken home calmly and the caregiver gets the details. She never sees a URL, a reason or a way to continue.

Spec 01 has the signals, weights, thresholds, overlay wording and privacy rules. Since it was written, Buddy's xstate behavior machine has shipped, so the optional "watching over you" pose while the overlay is up is now possible. The next config schema version is 5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A page that scores at or above the sensitivity threshold closes the browser and shows the "That page was trying to trick you" overlay on Home, with no URL, reason code or "continue anyway"
- [ ] #2 Scoring is pure shared logic, and main re-scores the reported page facts rather than trusting a verdict from the page preload
- [ ] #3 The overlay dismisses on tap or after 12 seconds; reopening a blocked site within 5 minutes shows the overlay without loading the page
- [ ] #4 A new admin Safety tab sets on/off, sensitivity (normal or strict), caregiver name and allowed domains, and lists recent blocks with an "Allow this site" button
- [ ] #5 Allowed domains and their subdomains skip the payment and prominent-phone signals, but never the tech-support, forced-fullscreen, history-trap or autoplay signals
- [ ] #6 Only hostname, score and reason codes are logged; page text is never logged or saved
- [ ] #7 A config migration adds the shield settings with defaults and keeps existing settings
- [ ] #8 Unit tests cover the spec fixtures (tech-support page, gift-card scam, allowed checkout, news headline with "immediately", bank login on normal), and an e2e test blocks a local scam fixture page
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Real-hardware check: five of her usual sites, ten minutes each at strict sensitivity, with zero false blocks
<!-- DOD:END -->
