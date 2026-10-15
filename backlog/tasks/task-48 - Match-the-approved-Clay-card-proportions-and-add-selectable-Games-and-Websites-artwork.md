---
id: TASK-48
title: >-
  Match the approved Clay card proportions and add selectable Games and Websites
  artwork
status: Done
assignee:
  - '@codex'
created_date: '2026-10-14 10:44'
updated_date: '2026-10-14 11:15'
labels: []
dependencies: []
type: enhancement
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user explicitly wants the Games and Websites cards to look exactly like the approved concept. The first implementation used smaller object and label proportions. Ship the approved artwork choices in working cards and refine their proportions/materials while keeping caregiver destinations and fixed layouts authoritative; new category navigation remains undecided.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Games and Websites artwork can be selected and saved for existing web/app tiles in admin without inventing a destination or collection screen
- [x] #2 Illustrated Home cards use the approved larger object and bold label proportions with cohesive pillowy surfaces and a reference-matching theme option
- [x] #3 Selections survive restart/migration; photos and explicit custom icons retain their overrides; all font steps/layouts, focus and reduced motion remain usable
- [x] #4 Rendered card screenshots are compared with the approved references, scoped review and relevant regression checks are recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add optional named artwork choices and a preserving schema migration; expose selection in Tiles admin. 2. Bundle the existing approved Games/Websites transparent atlas and extend the local artwork renderer. 3. Increase illustration and label proportions and deepen the tactile card shading; add an opt-in approved Clay palette without changing existing saved themes. 4. Verify persistence, caregiver overrides, layout/text sizing and activation in isolated built-app tests. Compare rendered captures to approved concepts, run the once-only detector for this finished edit batch and finish review/documentation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema12 optional named artwork, preserving migration012, admin selector and Games/Websites atlas integration. Added opt-in clayCards theme. Reviewer initially returned fix for object scale, type scale, darkening ground and strong vertical face ramps. Corrected all4 with measured alpha-bound framing, reference4:1 category aspect constrained within saved slots,72px/800 live labels, constant #FDF9EF ground, stable face colors and localized edge shading. Reviewer verdict scored all4 resolved; disposition ship covers only those fixes, and explicitly calls this a close visual match rather than pixel identity. Final build/typechecks and lint pass;875 unit cases pass; new2 selection/persistence/theme/font E2Es and old4 artwork/font/fallback E2Es pass after fix, with prior8 photo/color regressions passing. One detector run returned[]; no second detector. Copied final working captures under design/home-cards. User explicitly selected matching cream background; validated device config, changed only theme and schema version, confirmed tiles/Buddy/admin settings preserved, restarted verified dev process and read back clean startup at5173. Games/Websites collection destinations and full six-card Home layout remain outside this appearance task.

Final documentation now includes normative root DESIGN.md and validated .impeccable/design.json, updated scoped implementation notes and reference-match-review.json. Saved user-facing final captures: home-cream-working-v2.png, games-working-v2.png and websites-working-v2.png. Verified dev restart uses the new code and persisted clayCards theme. No claim of pixel identity or full-surface approval; the reviewer resolved the four named visual findings. Existing user dependency edits remain separate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented explicit Games/Websites artwork selection, preserving schema12 migration and a matching cream Clay palette. Refined alpha-bound object scale, live lettering, stable ivory background and localized card depth against the approved image. Reviewer scored all4 visual fixes resolved; close match, not pixel identity. Build/typechecks, lint,875 units and14 relevant E2Es pass across the verification rounds. Applied the requested palette to the dev profile and restarted it, preserving saved tiles and settings. Saved final screenshots and normative design records; collection menus, six-card layout and hardware validation remain outside this appearance change.
<!-- SECTION:FINAL_SUMMARY:END -->
