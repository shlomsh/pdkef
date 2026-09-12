---
id: "MERGE-06"
title: "Merge on a phone: the action within reach, one sort control, an options row, a pinned button"
status: "open"
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
