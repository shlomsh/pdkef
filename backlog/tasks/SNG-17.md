---
id: "SNG-17"
title: "Fill mode keeps the toolbar in reach under iOS's native zoom"
status: "retired"
priority: "P1"
epic: "sign-fill-mode"
depends_on: ["SNG-15"]
---

# SNG-17 · Fill mode keeps the toolbar in reach under iOS's native zoom

*Filed 2026-09-26.* After typing in a small field on an iPhone, iOS zooms in on it and stays zoomed, so
the Sign toolbar (Undo, Sign, Date, the mark) is off screen. SNG-16's app-owned camera was tried and
retired the same day on Shlomi's call: zoom stays native. Any fix here works with native zoom.

Candidates to measure first on the iOS Simulator and his iPhone, before choosing:
- Stop the self-zoom at its cause: iOS zooms on focus when a field's computed font size is under 16px.
  A fill input could compute at 16px and be drawn at its real size (a transform), so iOS never zooms and
  the person's own pinch stays untouched.
- Keep the toolbar in the visual viewport while zoomed, reusing `useVisualViewportScale` and
  `visibleViewportOrigin` the way the element toolbar already does.

Same cause, reported the same day: tap a filled text element, then the font list in its toolbar. iOS is
zoomed in with the keyboard up, the page shifts sideways and the font list opens off screen to the left
(Shlomi's screenshot, form 101, Chrome on iOS). Not touched by SNG-15's branch; to confirm on main.

## Acceptance

- [ ] On Shlomi's iPhone, filling form 101 end to end never leaves the toolbar out of reach.
- [ ] A text element's toolbar menus (the font list) open on screen while zoomed with the keyboard up.
- [ ] His own pinch zoom still works, and nothing changes without `?next=1`.

## 2026-10-01 board cleanup

- Stays in_progress. FontSheet (3f32b9a) and `visualViewportClamp` (0ae99dc) shipped; the toolbar under zoom (AC1) and pinch (AC3) need Shlomi's iPhone.

## 2026-10-01, retired (Shlomi): won't do

Its cause is gone on main: `maximum-scale=1` at rest stops iOS zooming in on a focused field, and a
person's own pinch is held between fields (`viewportZoomLock.ts`, 9666ebc8, c358e330). The font list is
a bottom sheet on phones (3f32b9a) and clamps into the visible viewport (0ae99dc). What it never did:
the main `SignToolbar` does not follow the visual viewport, so it can sit off screen while the person
has pinched in themselves. Not pursued.
