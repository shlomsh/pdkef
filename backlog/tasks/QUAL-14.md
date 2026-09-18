---
id: "QUAL-14"
title: "Citron stroke on the Hebrew headings: carry h1Accent and headingStroke through the localized schemas"
status: "open"
priority: "P3"
epic: "site-quality"
phase: "quick-win"
depends_on: ["QUAL-13"]
legacy_state: "Open"
---

# QUAL-14 · Citron stroke on the Hebrew headings

*Filed 2026-09-18 from the QUAL-13 build.*

## Problem

QUAL-13 strokes the promise phrase of every English heading in citron: the
tool pages' `h1Accent` and the home closing panel's `headingStroke`. The
Hebrew editions render the plain heading with no stroke, on purpose, because
neither field can reach them yet:

- `toolFields` in `src/content.config.ts` is a strict object without
  `h1Accent`, and `TOOL_SOURCE_FIELDS` in `src/i18n/localizedTools.ts` does not
  carry it, so a merged Hebrew tool keeps the English accent, which is not a
  substring of the Hebrew `h1`, and `ToolHero` skips the stroke.
- `homeClosing` in the same config is strict without `headingStroke`.

Natural phrases exist: `בדפדפן` on Sign and Merge, `בחינם` on Compress, and
the closing heading's own verb.

## Scope

- Add the optional fields to both schemas and to the source-field lists, then
  set them in `src/content/localized-tools/he/*.yaml` and
  `src/content/localized-home/he.yaml` where a natural phrase exists.
- Adding to the source-field lists changes every Hebrew page's `sourceHash`;
  bump them in the same change with a `reviewNotes` line saying no Hebrew text
  changed.
- Extend `src/data/tools.test.js` so a localized accent must also occur
  exactly once in its own `h1`.

## Acceptance

- `/he/sign/` and `/he/merge/` show the stroke under the promise word, RTL
  intact; `/he/` shows it under the closing heading's verb.
- Build passes the translation freshness check without a re-review.
