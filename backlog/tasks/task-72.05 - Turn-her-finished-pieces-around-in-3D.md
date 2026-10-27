---
id: TASK-72.05
title: Turn her finished pieces around in 3D
status: To Do
assignee: []
created_date: '2026-10-27 17:44'
labels:
  - knitting
dependencies:
  - TASK-72.03
parent_task_id: TASK-72
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner (2026-10-27) will make 3D models of her finished knitting and wants the gallery to show them as well as photos, so she and her visitors can turn a piece around and see it from every side, the way she would hold it. A model belongs to a piece in her gallery (TASK-72.03), which keeps its photo for the card and the caption. Buddy's Three.js setup already runs on Home; models usually come out of tools such as Meshy as GLB files, and the launcher CSP blocks CDN decoders and WebAssembly (see 'Buddy on Home' in CLAUDE.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The caregiver can attach a 3D model file (GLB) to a finished piece in the Knitting tab, replace it, or remove it; a file that can't be shown is refused with a plain message
- [ ] #2 A piece with a model shows a large button in the gallery that opens it in 3D; the model turns slowly on its own and she can turn it by dragging, with large Back and Home buttons
- [ ] #3 Models are served to Home only through the app, never as file paths, and a model that refers to anything outside its own file is refused
- [ ] #4 A missing or unreadable model shows a calm line while the photo and caption still work
- [ ] #5 Tests cover attaching, opening, a refused file and a missing model
<!-- AC:END -->
