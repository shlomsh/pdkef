---
id: "SITE-46"
title: "A Hebrew file name on an English page ends in .pdf on its right"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# SITE-46 · A Hebrew file name on an English page ends in .pdf on its right

*Opened 2026-11-05* after Shlomi opened a Hebrew PDF in Scan and the heading read `.pdf` before the name.

## Outcome

A file name's line follows the page. On a left-to-right page the name stays in its own direction and `.pdf` follows it on the right, whatever the script. `/he/` pages keep today's order. `FileName` and `OutputName` agree, so every place a file is named reads the same.

## How

`isRtlPage()` (`src/shell/pageDirection.ts`) reads `<html dir>`. A name only renders once a file is open, so no caller passes a direction and nothing reads the document at build time. On a left-to-right page the unit is `dir="ltr"` and the name is `dir="auto"`, or a long cut name lays its halves out backwards. On a right-to-left page the markup is as it was.

A wrapped long name on a phone had a second fault, on `/he/` too: head and tail were two isolates, so the tail sat on the wrong side of the head and "האחרונה" read split. Wrapped, nothing is cut, so they are one run now.

## Acceptance

- [x] `merge-rtl-file-name.spec.js` reads the rendered order: a Hebrew name on `/merge/`, short, long and in the rail; a wrapped long name on a phone. Each seen red first. The `/he/merge/` cases stay green.
- [x] Unit tests for both components on both page directions.
- [x] Guideline 9 and the `FileName.tsx` comment state the rule.
- [x] Measured in Chromium and WebKit at 1440 and 390 on `/scan-to-pdf/` and `/he/merge/`, with Hebrew names, including editing.
- [x] Landed on main.

## Left as it is

Before this change `FileName` drew a short Hebrew name's end as `pdf.` with the dot against the name, because its last run mixes Hebrew and `.pdf`. That was measured on `/merge/`. `/he/` keeps that markup, so it likely still does this there, though it was not measured on a `/he/` page. The brief was to keep `/he/` as it is, so this needs its own decision.
