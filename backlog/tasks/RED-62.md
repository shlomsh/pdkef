---
id: "RED-62"
title: "Text drawn twice for a bold look reads as doubled letters under a box"
status: "done"
priority: "P2"
epic: "redact"
depends_on: []
---

# RED-62 · Text drawn twice for a bold look reads as doubled letters under a box

Filed 2026-10-08 from Shlomi's test of RED-59 on an Israel Tax Authority employee form (טופס 101).

## What happened

He blurred the form's title, "כרטיס עובד". The saved-file check listed the words under the box as
"ככררטטייסס עעוובבדד (1)". The form draws that title twice, each letter offset a hair, to fake bold
(visible as a grey second outline in his screenshot); the superscript "(1)" is drawn once and came out
single.

## Why

`wordsUnderBoxes` (`src/editor/adapters/pdf/textLayer.ts`) builds words from every glyph by position and
never drops a glyph that repeats the same character at almost the same spot, so the two copies interleave.
Find and the delete previews read text through the same path, so they likely show the same doubling on
such files (not yet measured).

## Outcome

On a page that overprints text for a bold look, every reader of page words (the check's covered terms,
Find, delete previews) sees each word once. Test first: a synthetic page drawing a Hebrew and a Latin word
twice with a small offset, red on today's code, then the dedupe (same character, overlapping boxes) before
words are built.

## 2026-10-08 fixed

Each reader of page words now treats a letter printed over itself as one letter, and the glyph list is
untouched, so Delete still removes both printed copies.

- **Check terms and Delete previews**: `readingLines` (`src/editor/adapters/pdf/textLayer.ts`) drops a
  glyph that repeats the same character within 0.15 em of an earlier one, kept or itself dropped (a
  triple draw in small steps is one too). Bucketed by character and a grid cell, near linear: a test
  counts `Math.hypot` calls (20,049,998 before on 20,000 glyphs, under 200,000 after).
- **Find**: `buildPageText` drops a text item that repeats an earlier one (same string, height within 5%,
  origin within 0.15 x height), looked up by string (30,000 items took 6.5s before); `mapItemGlyphs`
  clusters overprints so a match maps to exact glyphs; `glyphsBox` takes in each chosen glyph's
  overprints from the page index so a Blackout made from Find covers every copy (a second copy 2 to
  3.5pt over overhung the box by 1 to 2.5pt). All pure.
- **Guard**: `src/tools/redact/e2e/redact-overprinted-text.spec.js` on a PDF drawing "Employee Card" and
  "כרטיס עובד" twice: Find reports 1 of 1 (was 1 of 2), the check lists "Employee Card" (was doubled).
  Red on the old code in a detached worktree, green on the fix.
- **Not covered**: a copy drawn with different run segmentation from the first ("Employee Card" against
  "Employee" + "Card") still reads twice in Find; a page of thousands of identical short items compares
  within that one string's bucket.
