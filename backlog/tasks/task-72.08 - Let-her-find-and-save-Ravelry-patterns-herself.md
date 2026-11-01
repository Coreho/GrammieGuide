---
id: TASK-72.08
title: Let her find and save Ravelry patterns herself
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T18:09:00Z'
updated_date: '2026-11-01T18:41:00Z'
labels:
  - knitting
  - browsing
dependencies: []
parent_task_id: TASK-72
priority: medium
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked on 2026-11-01 for a simpler way for her to pick and save Ravelry patterns, and for the instructions too. Plan confirmed by the owner: fixed picture categories, free patterns only, most popular first; pictures with plain words and one large Save button; a Save button on real Ravelry pattern pages; saved instructions read in the existing page viewer. She can't type a search or remove a pattern. This relaxes one TASK-72.07 rule: Home may now ask for the fixed categories and save the pattern she is viewing. The key stays in main.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With a key saved, the Ravelry card offers My saved patterns, Find a pattern and, when its switch is on, the website last; with no key it behaves as before
- [x] #2 Find a pattern shows large category cards, then pages of free knitting patterns, most popular first, with no typing
- [x] #3 A pattern shows pictures, plain words and one large Save button; saving shows Saved and adds it to her saved patterns
- [x] #4 A Save button appears in the top bar only on Ravelry pattern pages, and main works out the pattern from the page itself
- [x] #5 Home can only view and save patterns main has served or the page she is on, never any address or arbitrary ID
- [x] #6 When a free pattern's instructions are a PDF, its pages are saved as pictures and open in the page viewer offline, reopening on her page
- [x] #7 Offline, no key, a full shelf, a duplicate and missing instructions each show a calm line, and she keeps what she has
- [x] #8 PDFs are parsed only in a sandboxed hidden window with no network, are size and page limited, and only re-encoded JPEGs are served
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fixed categories in shared; homeBrowse.ts limits Home to them and to patterns main served.
2. Save shared with admin's Add; the top bar's Save takes nothing and main reads the page address.
3. PDF drawn in a hidden sandboxed window with no preload, Node or network, then re-encoded, all or nothing.
4. Screens inherit the Knitting shelf's look, so no new visual world and no comps.
5. Verify against real Ravelry and a packaged copy.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-11-01 against real Ravelry with the owner's read-only key, in throwaway data folders: 8 categories with pictures, a real free pattern saved in 8 to 13 seconds with 12 readable pages, in the built app and in a packaged asInvoker copy. Real data found that the API lists Ravelry links as http, that session.fetch throws on redirect manual, and that the largest photos passed the size cap. Unit 1612 passed; 12 deliberate breaks caught. In a sample of 30 popular free patterns, 14 linked directly to a PDF, 9 were Ravelry pages that gave no PDF unsigned, and 7 were other sites' pages. Not tested: her browser sign-in route against a real signed-in session, real use with her, a physical mouse. Ravelry's API terms are still unchecked.
<!-- SECTION:NOTES:END -->
