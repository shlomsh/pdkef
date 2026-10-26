---
id: "SCAN-02"
title: "Scan's loaded state: pages and Add photos in view, a photo that fills the stage, named and iconed controls"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
---

# SCAN-02 · Scan's loaded state, laid out for the screen it is on

*Filed 2026-10-26* from Shlomi's review of the live `/scan-to-pdf/` at about 1525x870 (two desktop screenshots and a
crop of the finish row).

## What he saw

- The page strip and its "Add photos" tile sat under the fold: the photo (62svh), the hint, two rows of buttons under
  it and the strip all stacked in one column, with half the card's width empty beside the photo.
- "Find the page", the corner editor's auto-detect, did not say what it does, and none of the corner buttons had an
  icon.
- The finish row (Share, Sign, Merge, Compress) is four buttons in the 320px rail: "Merge" and "Compress" ran past
  their borders.

## The design

- **Desktop (1024px and up):** the pages are a column at the document's inline start, sticky like the rail, with the
  add tiles pinned at its foot; the selected page's photo takes the rest and is sized to the viewport, so the photo,
  its one row of controls, the pages and Add photos are all on the first screen.
- **Below 1024px:** the sticky bar carries "Take a photo" (a mouse: "Add photos") at its start and the quiet Download
  at its end, so the next page is always one tap away; the photo is sized to what is left under the bar, and the
  strip follows the controls.
- **Corner controls in one row** under the photo: Auto-detect (wand), Whole photo (corners), then the filled
  "Use these corners" (check). They wrap to two rows only where one does not fit.
- **The finish row** becomes two columns when it holds four buttons (`FinishRow`, shared; only Scan has four).
- Icons on Adjust corners (crop), Remove this photo (bin), Clear all files (bin) and the add tiles.
- **Desktop fills the first screen exactly** (added the same evening): Scan's card takes the page-grid floor and
  `useFloorHeight` (`src/shell/pageWorkspace/`, sharing `cardFloor` with the page grid's `useStageFit`) measures
  the room down to it; the photo or the result paper fills it through container units. No scroll on desktop.
- **Rotate** (his "there is no rotate page functionality"): a quarter turn clockwise per press, beside Adjust
  corners. The warp gets the corners one place on per turn (`rotateQuad`), so the photo's corners never move.
- **Full screen for the corners** (his request): the browser's own full screen on the editor, a fixed layer where
  there is none for an element (iPhone Safari); the result view leaves it.

## Acceptance

- [ ] At 1440x900 and 1280x720 with two photos in: the photo, its controls, every page tile and Add photos are fully
      inside the viewport after the photo scrolls into view, and nothing in the finish row overflows its button.
- [ ] At 390x844 and 375x667: the bar's Take a photo and Download, the photo and "Use these corners" are inside the
      viewport after a pick; no sideways scroll at 320.
- [ ] At 820x1180: the same, with the strip under the controls.
- [ ] Unit tests follow the new names; the corner-drag and loupe e2e specs pass.

## Progress 2026-10-26 (branch `scan-layout`, not on main)

Built and measured in Chromium at 1525x870, 1440x900, 1280x720, 1024x700, 820x1180, 390x844, 375x667 and 320x640:
photo, controls, pages and an add control on the first screen, no sideways scroll. Full screen measured native on
desktop and phone, and as the layer with element full screen removed (an iPhone stand-in). `check:fast` green; the
full Playwright product suite passed before rotate, the fit and full screen landed. Still to do: Shlomi on his
iPhone, `check:push` and `check:e2e` on the final branch, landing.
