---
id: "QUAL-14"
title: "Citron stroke on the Hebrew pages: a Hebrew on-device phrase for the tool subheads and the closing heading"
status: "open"
priority: "P3"
epic: "site-quality"
phase: "quick-win"
depends_on: ["QUAL-15"]
legacy_state: "Open"
---

# QUAL-14 · Citron stroke on the Hebrew pages

*Filed 2026-09-18 from the QUAL-13 build, rewritten 2026-09-19 for QUAL-15.*

## Problem

QUAL-15 strokes one shared phrase per locale in every tool subhead, the
on-device words of the closer ("on your device" in English), and QUAL-13
strokes "try" in the home page's closing heading. The Hebrew editions render
plain:

- The Hebrew phrase is not set, and the three Hebrew tool subheads do not say
  it the same way: compress ends "את המכשיר שלכם", merge "אצלכם במכשיר", sign
  has no closer. One phrase cannot match all three until the closers agree.
- `homeClosing` in `src/content.config.ts` is a strict object without
  `headingStroke`, so the closing heading cannot name its stroked word.

## Scope

- Agree one Hebrew closer wording with Shlomi (Hebrew copy is his
  read-through), apply it to `src/content/localized-tools/he/*.yaml`, and set
  the Hebrew accent phrase in `src/i18n/documentationMessages.ts` to the exact
  words it uses, once per subhead.
- Add the optional `headingStroke` to the `homeClosing` schema and set it in
  `src/content/localized-home/he.yaml`.
- Every `sourceHash` that changes gets a `reviewNotes` line.

## Acceptance

- `/he/sign/`, `/he/merge/` and `/he/compress/` show the band under the
  closer's on-device words, RTL intact.
- `/he/` shows the stroke under the closing heading's verb.
- Build passes the translation freshness check.
