---
id: TASK-92
title: 'Nursing History tile: her career story and papers'
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-21T20:40:00Z'
labels:
  - nursing
dependencies: []
priority: medium
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
She was a nurse for her whole working life: trained at Freedmen's Hospital School of Nursing, became Senior VP of Patient Care and Chief Nursing Officer at East Orange, then taught practical nursing at Dover Business College while earning her MSN in nursing education at Walden University. Her recovered USB sticks hold her coursework and the course materials she wrote for her students. The owner wants a Nursing History tile on Home: big cards for each chapter of her career, each with a short story and her real papers from that time, shown page by page in large print like the knitting patterns. Her papers are personal and some carry private details, so content must live only in her userData, never in this public repo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A built-in Nursing History tile opens a shelf of large chapter cards (title and years), in the caregiver's order
- [ ] #2 A chapter shows its short story and large buttons for each of its papers; a paper opens one page at a time with large Back/Next/Home controls and 'Page N of M'
- [ ] #3 Chapters, stories and paper titles live in a nursing file in userData and page pictures in a JPEG-only nursing media library served by grammie-media://; generic library writes refuse it
- [ ] #4 An empty or missing history shows a calm line; a missing page picture shows a calm line while other pages still work; a damaged file is set aside and the view starts empty
- [ ] #5 Paper titles and story text are never logged
- [ ] #6 Tests cover the shelf, a chapter, paging a paper, the empty state and a missing page
<!-- AC:END -->
