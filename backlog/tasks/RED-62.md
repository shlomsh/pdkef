---
id: "RED-62"
title: "Text drawn twice for a bold look reads as doubled letters under a box"
status: "open"
horizon: "next"
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
