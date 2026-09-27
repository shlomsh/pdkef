---
id: "RED-02"
title: "Find and redact: search text, review every match, redact all or some"
status: "done"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-02 · Find and redact: search text, review every match, redact all or some

*Filed 2026-09-27 from SITE-41's follow-ups.*

Type a word or name, see every match highlighted across pages (Hebrew and other right-to-left text
included), then redact all matches or pick them one by one with the current Blur/Blackout choice.
Optional presets find emails, phone numbers and ID or card numbers.

- Finders are pure functions behind one contract, swappable, with a small corpus and scored tests,
  like Sign's field detection. They propose; the person chooses. Never a "you missed" review.
- Matches come from pdf.js text content positions, mapped through the one page-coordinate transform.

## Acceptance

- Searching a term on a multi-page PDF highlights every match; "Redact all" adds one box per match
  as a single undo step.
- Right-to-left text matches in reading order.

## Outcome

Find sits in Redact's toolbar and opens a row under it, in the sticky card. Type a word or phrase, or
pick Email addresses, Phone numbers or ID and card numbers; every match is highlighted on its page,
and "Redact this" or "Redact all" adds Blackout or Blur boxes as one undo step. Matches already under a
box show as covered and are skipped.

- Pure pieces in `src/tools/redact/find/`: `pageText.ts` (reading order, right to left for Hebrew),
  `finders.ts` (folding for case, niqqud and dashes; the presets with a scored corpus),
  `matchBoxes.ts`, `findMatches.ts`. The iOS-safe text drain moved to `src/lib/pdfTextItems.ts`, shared
  with Sign.
- pdf.js gives one advance per text item, not per glyph, so an edge that cuts through an item is
  apportioned by a real font measurement and widened by 0.35em: a box may take a hair of the
  neighbouring letter, never leave a sliver of the matched one.
- Checked in a real browser on the IRS 1040 and the Israeli health declaration (Hebrew phrases across
  words), at phone and desktop widths; e2e on real pdf.js positions in `redact-editor.spec.js`.
