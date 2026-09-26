---
id: "SNG-06"
title: "Fill mode on desktop and iPad: parity, then retire the old editor behind ?next=0"
status: "open"
priority: "P2"
epic: "sign-next-gen"
phase: "longer-term"
depends_on: ["SNG-19", "SNG-07"]
---

# SNG-06 · Fill mode on desktop and iPad: parity, then retire the old editor behind ?next=0

The ticket was first written for the sketched next-generation surface: a contextual bar, no floating
toolbar, zoom controls, Review, and an optional fields rail. That surface was dropped on 2026-09-26
(SNG-02, SNG-03 and SNG-16 are retired). Fill mode kept production's floating toolbar, zoom stays
native, and reviews are ruled out (`docs/sign-tool-product-decisions.md`). Fill mode becomes the
default everywhere (SNG-19), so desktop and iPad need their own checks.

## Acceptance

- [ ] Desktop: Tab and Shift+Tab walk the fill inputs in reading order, and Enter moves to the next
  field. Guarded by an e2e.
- [ ] Desktop, keyboard only: Tab also reaches each checkbox, and Space ticks or clears it, so the form
  can be finished without a mouse. On phones the keyboard's Next keeps skipping checkboxes and
  signature spots (they are tapped where they are). First check whether a fill-mode checkbox takes
  focus today.
- [ ] Desktop: the font list opens beside the element (f2ba3495), and every toolbar control keeps the
  edit session in Safari and Chrome.
- [ ] iPad (coarse pointer, wide screen): the font picker uses the desktop popover, not the phone
  bottom sheet. The rule is a pure predicate on pointer plus viewport width, shared with other
  phone-only UI. Run in the iOS Simulator gate on an iPad device.
- [ ] iPad: the compact one-row bar vs the full bar, decided by the same predicate, with Shlomi's
  approval after trying it.
- [ ] Retire the old editor: after fill mode has been the default for a period with no regressions
  reported, delete the `?next=0` paths and MOBI-16's quick field navigation (Previous/Next), then
  update `.claude/rules/editor.md` and `docs/sign-fill-mode.md` in the same change.
