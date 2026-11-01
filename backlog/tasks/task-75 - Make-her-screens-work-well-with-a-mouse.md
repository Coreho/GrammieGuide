---
id: TASK-75
title: Make her screens work well with a mouse
status: Done
assignee:
  - '@claude'
created_date: '2026-11-01T11:57:00Z'
updated_date: '2026-11-01T17:20:00Z'
labels:
  - accessibility
  - home
dependencies: []
priority: high
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner confirmed on 2026-11-01 that she uses a mouse, not the touchscreen this computer also has. The app was built and described in terms of tapping. Measured with real mouse events: double-clicking the Knitting tile skipped past the shelf into her first card, double-clicking Back to Knitting went out to Home, and double-clicking Next on page 1 landed on page 3. Her idle dimming is on (10 minutes), and moving the mouse neither brightened Home nor counted on a web page, so her first click only brightened the screen and a page she read with her hand on the mouse closed at the timeout. Scrollbars were thin, and on-screen words told her to tap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A double-click acts once on her screens: a tile opens only that tile, Back goes back one step, Next turns one page
- [x] #2 Game pieces, patting Buddy, text boxes, touch and the keyboard keep their own behaviour
- [x] #3 Moving the mouse brightens a dimmed Home and swallows nothing, and a nudge of a pixel or two does not wake it
- [x] #4 Moving the mouse over a web page counts as using it for the idle timeout
- [x] #5 Scrollable areas have a bar wide enough to grab, and the wheel still works
- [x] #6 Words she sees or hears say click, not tap
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure rules in shared/mouse.ts, using the event's own detail so Windows' double-click settings apply.
2. A capture-phase click guard in Home, exempting game pieces, Buddy and text boxes. It watches click, not pointerdown, so the rapid-tap detector still sees presses.
3. Deliberate mouse movement wakes idle dim and reports page activity through the browserView preload.
4. Wide scrollbars globally in the launcher, removing the thin standard properties that would override them.
5. Copy: tap to click in her words. Internal names such as data-buddy-tap stay.
6. Real mouse events in e2e, in hidden windows.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-11-01 with real mouse events through Playwright, in hidden windows. Measured before the fix: double-clicking the Knitting tile landed in her first card, Back to Knitting landed on Home, Next on page 1 landed on page 3. After: the shelf, the shelf, page 2. Add a row sent one request instead of two. Full e2e at fcba6cd: 228 passed, 1 skipped (kiosk-stacking, which needs a special package). Unit: 1572 passed before the commit. Deliberately breaking each rule in shared/mouse.ts made the unit tests fail. Not tested: a physical mouse on the real screen, since hidden windows only receive simulated events; a second click after opening a web tile, which lands inside the embedded page where this guard can't reach; double-clicks slower than Windows' 500 ms setting, which still count as two separate clicks.

Installed on her computer 2026-11-01 12:19, production build of main 598bd7e. Not yet tried by hand with a physical mouse on the real screen.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Her screens now work properly with the mouse she uses. A double-click acts once: a tile opens only that tile, Back goes back one step, Next turns one page. Game pieces, patting Buddy, text boxes, touch and the keyboard keep their own behaviour. Moving the mouse brightens a dimmed Home and counts as using a web page; scrollbars are 28px wide; words she sees or hears say click. Measured before and after with real mouse events through Playwright in hidden windows, then 228 e2e tests (1 skipped), 1572 unit tests and 0 crc findings on PR #68. Not verified by hand: a physical mouse on the real screen. Known limits: a second click after opening a web tile lands inside the embedded page, and a double-click slower than Windows' 500 ms setting still counts as two clicks.
<!-- SECTION:FINAL_SUMMARY:END -->
