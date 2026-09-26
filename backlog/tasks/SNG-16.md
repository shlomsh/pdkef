---
id: "SNG-16"
title: "Fill mode, slice 2: the app-owned camera (a locked page scale, layout zoom, framing, a sharp re-render)"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-15"]
---

# SNG-16 · Fill mode, slice 2: the app-owned camera

*Filed 2026-09-26.* SNG-15 keeps iOS's native zoom. This slice replaces it with the camera the plan of
record specifies and SNG-14 measured:
- the viewport meta locks the page scale both ways, scoped to Sign;
- pinch is ours, with a transform during the gesture and a layout zoom committed on release;
- the document stays the scroller;
- a focused field is framed a third of the way down the visual viewport, zoomed until its text is 16 px;
- pages re-render at the settled scale with the device pixel ratio, within iOS's canvas limit.

Also in scope:
- Fullscreen, which makes `.workspace` the scroller today, gets a document-scroll form or stays off in
  fill mode.
- The visual-viewport compensation (`useVisualViewportScale`, `visualViewportClamp`) is retired where fill
  mode no longer needs it. Redact shares it.

## Acceptance

- [ ] No self-zoom on any hop, and each field framed legibly above the keyboard (iOS Simulator and
  Shlomi's iPhone).
- [ ] Pinch zooms the page and never the browser. Text stays sharp at every zoom.
