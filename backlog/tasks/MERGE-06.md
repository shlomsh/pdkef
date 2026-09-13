---
id: "MERGE-06"
title: "Merge on a phone: the action within reach, one sort control, an options row, a pinned button"
status: "done"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MERGE-06 · Merge on a phone: the action within reach, one sort control, an options row, a pinned button

*Filed 2026-09-13* from the Merge review, measured at 375 x 812 on the deployed page.

## Scope and acceptance

**Empty state.** The H1 wraps to four lines, the subhead to four, the no-limit note to three, and
"Choose files" lands around 700 CSS px down: at the bottom edge of the first screen of the most
searched tool in the suite. The hero already condenses once a file loads (ToolHero's
`data-hero-condensable`); on phones it should start condensed: H1 plus the one-line no-limit note, the
subhead folded until the person scrolls. The SEO shell stays static HTML; this is a CSS rule on the
existing markup, not a script.

**Loaded state.** The sort toolbar renders four equal-width buttons: `A–Z` and `Z–A` each break onto
two lines, `Add page numbers` onto three. Replace the four with one `Sort` control (name or date, with
a direction) and one `Reverse order` action, which is what a person who dropped files in the wrong
order actually wants. `Add page numbers` moves into an Options row with the output name (MERGE-03)
and, later, the defaults MERGE-11 defines; the row is collapsed until opened.

**The primary button** pins to the bottom edge of the screen once files are loaded, full width, the
way the editor toolbars already stretch on mobile (`project_fullwidth_mobile_toolbar` pattern). It
must not cover the last list row; the list gets matching bottom padding.

**Acceptance.**

- On a 375-wide viewport the empty-state picker button is inside the first 600 CSS px; no toolbar label
  wraps; the pinned button never overlaps content.
- Desktop layout unchanged except for the sort control and the options row.
- One Playwright spec under `e2e/merge/` at the mobile viewport for the three facts above; `test:css`
  and `test:weight` green.

## Updates

- 2026-09-13: `heroPhoneCondensed: true` on the merge entry renders `data-hero-phone-condensed`, and
  `ToolHero.astro` folds the hero from first paint under 768px with the subhead clamped to two lines
  (never hidden, so mobile-first Googlebot still sees it). Measured in the preview at 375 x 812:
  "Choose files" top at 527 CSS px (was ~700). Loaded: one native Sort select plus Reverse order on
  one 57px row (the visible "Sort" word is screen-reader only at phone widths), Add page numbers in a
  collapsed Options row. The primary control sits in a `position: sticky; bottom: 0` row inside the
  card (in flow, so it never covers the last row): with six files at 375 wide its bottom edge sat at
  800 of 812. Desktop unchanged apart from the sort control and the options row. Playwright:
  `e2e/merge/merge-mobile.spec.js` on the webkit iPhone 15 project. Done.
- Direction A (2026-09-13): the phone hero shows the first full sentence of the subhead instead of a two-line clamp that ended in "and…"; loaded state at 375 x 812 is a scrolling chip row (tap jumps to the file, hold reorders, ⋯ opens Sort, Add files, Clear all), sticky per-file labels, three 96px columns, Edit pages on the heading row, and a sticky bottom sheet with Options, Download and the hand-off row. Nothing overflows sideways; the Download element sits at 678 to 756 of 812 without scrolling.
- Wave 5 (2026-09-13): the desktop empty state is the spec's 260px dashed band (three ghost page outlines, "Drop PDFs here, or paste", the privacy line, Choose files) instead of the viewport-filling box; below 1024px the phone empty state is unchanged.
- Review pass (2026-09-13): on a coarse pointer the rotate, skip and open buttons are real 44x44 boxes (the 32px chrome on an inner glyph), so a rect measures the hit area; the phone chip row scrolls under a right-edge fade with the ⋯ menu pinned outside the scroller, always reachable; the restore sentence shows in the header on phones (the rail's copy is hidden there); the hand-off row is quieter than Download (no fill, primary text). Guard: merge-mobile.spec.js measures 44px on chromium and webkit.
- 2026-09-13 (Shlomi): the Edit pages toggle was hidden by pointer type alone, and below 768px the rotate/skip/open cluster is hidden until Edit pages, so a mouse at phone width (a narrowed window, a device-mode preview without touch) could not reach rotate or open at all. The toggle now hides only for a fine pointer at 768px and up. Guarded at 375 with a mouse in merge-direction-a.spec.js.
