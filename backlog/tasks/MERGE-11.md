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
- Direction A (2026-09-13): Sort and Reversed are one select in the rail (Sort, Reverse and Jump to file do not render with one file); Options is a disclosure pinned at the rail's bottom with an 18px checkbox in a 44px row. Nothing but the heading and page count sits above the first thumbnail.
- Review pass (2026-09-13): with one file the Download element is a plain surface with "Add one more PDF to merge" and a real Choose files button; Options and the hand-off row appear only from two files. Add files, Clear all, Reset order and Start fresh are quiet bordered buttons (36px, 44px hit area) instead of underlined text; the "·" separators between them are gone; "Draft saved" stays plain text; the Sort select, hand-off buttons and Options summary show one focus ring, not two.
- 2026-09-13 (open question, since closed - see the next entry): the output name is now editable in the document heading, but the automatic name for an *unedited* set still used one template, `{name} + {count} more`, regardless of the first file's own script. A name whose first strong character is RTL still got that same LTR-shaped template applied to the file itself: the OS (and this heading) renders one bidi run, so `signed_אישור` first-in-the-list read back as "signed_7 + אישור more.pdf" rather than reading right to left the way the Hebrew word wants to.
- 2026-09-13, later (Shlomi): closed by MERGE-03's reversal, not by a script-aware template. The `{name} + {count} more` shape is gone entirely; the automatic name is now `merged_<first file base name>` (see `backlog/tasks/MERGE-03.md`). With an LTR prefix and no composed sentence around it, there is nothing left to bidi-isolate - `merged_`, then the name in its own direction, then `.pdf`, renders correctly for a Hebrew or Arabic first file the same as a Latin one (`merged_אישור שנתי.pdf` reads right to left as expected). The manual rename still exists for anyone who wants a different name outright, but the RTL connector question itself no longer applies - there is no connector.
- 2026-09-13, evening (Shlomi): the Options disclosure is dissolved. Desktop rail, top to bottom: file list (rearranged note and Reset order on one line, drag handles hidden while file drag is off), "Draft saved" alone and end-aligned, Add files and Clear all as 36px quiet buttons, the "Add page numbers" checkbox as a plain row, Download, then Share / Compress it / Sign it with the tools' launcher icons. The heading is the output name itself, WYSIWYG: at rest the same 16px/700 text as before with a muted ".pdf", editable in place on click through `contenteditable="plaintext-only"` (Firefox falls back to a text-only `true`), zero layout shift measured (the h2 and name boxes are identical at rest, in edit and after typing except the name's width), Enter/blur commit, Escape cancels, empty reverts, `+` and path/bidi-control characters stripped. The how-to step that said "Open Options" now says "Check Add page numbers" (Hebrew step re-drafted, pending review).
