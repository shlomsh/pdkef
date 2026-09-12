---
id: "MERGE-11"
title: "Easy defaults: the simple merge is pick files, then Download, with nothing else in the way"
status: "done"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-03", "MERGE-06"]
legacy_state: "Open"
---

# MERGE-11 · Easy defaults: the simple merge is pick files, then Download, with nothing else in the way

*Filed 2026-09-13* from the Merge review; Shlomi's closing ask: the easy case takes the minimum number
of clicks and context switches.

## Scope and acceptance

Most merges are two or three files in the order they were picked, no options. That case must be:
open the page, pick the files, tap Download. Two actions, no scrolling, no decisions. Everything
richer (sort, page numbers, output name, the page strip's editing tools) stays one tap away and out of
the default path.

**Defaults and disclosure.**

- Files keep pick order; no sort is applied unless asked.
- The Options row (MERGE-06) is collapsed by default. Its last-used values (page numbers on or off,
  the naming pattern) are remembered on device in `localStorage` under the existing `pdf-toolkit:`
  prefix, so a person who always wants page numbers sets it once. No account, nothing sent.
- The page strip (MERGE-08) is visible but its editing controls appear on hover or on a page tap; on a
  phone they appear only after "Edit pages" is tapped, so a simple merge never sees them.
- After Download the page stays as it is; a "Start again" is one control, not a modal.
- `?action=open` already opens the picker on arrival for the home-page launcher; keep it working so
  the home page to Download path is: drop, Download.
- On a phone the pinned Download button (MERGE-06) means no scroll between picking and downloading.

**Measure it, do not assert it.** Count the taps and the scroll distance from page load to a saved file
for a three-file merge on desktop and on a 375-wide phone, before and after, and record both in this
ticket. The target is two taps after the picker closes, zero scroll.

**Acceptance.**

- The two-action path is demonstrated in `e2e/merge/` at both viewports: set the input, click
  Download, assert a blob URL with the right page count. No other control needs touching.
- Remembered options survive a reload and are absent for a first visit.
- Every richer control still reachable within one tap from the default state.

## Updates

- 2026-09-13: files keep pick order; Options is collapsed by default and its Add page numbers value
  is remembered under `pdf-toolkit:merge:options` (absent on a first visit); the strip's controls
  appear on hover or focus on pointer devices and after Edit pages on touch; after Download the page
  stays and "Start again" is one quiet link; `?action=open` still opens the picker. Measured in the
  preview: after the picker closes it is one tap (Download), with no scroll at 375 x 812 because the
  button is pinned (bottom edge 800 of 812 with six files); on a 1280 x 1000 desktop viewport the
  button is on the first screen with up to three files and about half a screen down with four (the
  strip is between the list and the button). Before: Merge, then scroll to the Download that
  appeared under it, then Download. The two-action path is guarded at both viewports in
  `e2e/merge/merge-layout.spec.js` and `merge-mobile.spec.js`. Done.
