---
id: "FONT-10"
title: "Export text with fontkit 3 instead of the unmaintained @pdf-lib fork"
status: "in_progress"
priority: "P1"
epic: "polish"
horizon: "next"
depends_on: []
---

# FONT-10 · Export text with fontkit 3 instead of the unmaintained @pdf-lib fork

*Filed 2026-11-25 from a spike.* The exporter
runs `@pdf-lib/fontkit` 1.1.1, unmaintained, with a patch of ours. It draws Thai น้ำ, ค้ำ and ซ้ำ with the marks on
top of each other (IBM Plex Sans Thai, Sriracha) and 6 named Bengali clusters wrong. `fontkit` 3.0.0 matches
HarfBuzz on every bundled font, with no string that matched before getting worse.

**Outcome.** The downloaded PDF shapes text as the editor does, through upstream `fontkit` at an exact version.

## What landed on the branch (2026-11-25)

- `fontkit` 3.0.0 exact through `src/tools/sign/lib/fontkitEngine.ts` (core, TrueType, five shapers). The patch,
  `@pdf-lib/fontkit` and `regenerator-runtime` are gone. 3.0.1 had not shipped, so `fontkit.d.ts` carries the types.
- Guards written first and run on the old engine: 7 red. Thai 52 of 100 on both IBM Plex Sans Thai weights and
  Sriracha (9% to 26% against a 3% tolerance; Mali was right on both engines), Bengali 5 pixel cases and 7 advances,
  Caveat 15 advances, Sriracha 2 pixel cases and 10 advances, "Sarah Levi" 1.024px. On the new engine 140 of 140
  pass, worst advance 0.000px, nothing excluded. SIGN-20 is closed by the same assertion.
- Guards draw native text with `textRendering = 'geometricPrecision'`; the Latin guard renders at 300px. Floors on
  macOS went from 9.55% / 21.87% / 19.66% (Pacifico, Great Vibes, Dancing Script) to 0.00% / 0.01% / 0.01%.
- HarfBuzz 15.0 comparison, run through the selective engine: 136,056 font and string pairs over all 80 font files.
  Old engine 31,055 mismatches and 3,224 throws, new engine 313 and 0, none regressed. All 313 come from
  `composeHebrewClusters` (299 identical to before); without it 22 differ, every one the bracket mirroring.
- **`composeHebrewClusters` stays.** The coverage check composes the same way, so what it promises is drawable is
  what gets drawn, and the picture is the same. `layoutRun` keeps the bracket mirroring.
- The 5 `hebrewMarkPlacement.test.js` expectations are HarfBuzz's own numbers, equal to the last digit.
- Copy: the six-cluster text and the Noto reasons for Punjabi, Telugu and Malayalam are out, with the languages
  page's FAQ about Noto. The engine no longer does what they described (it skips a missing anchor).
- Text readback: pdf.js reads stray control characters in Bengali and decomposed sara am in Thai; `pdftotext` reads
  what was typed, same as before. Kept as is.

**Done when:** CI is green on Linux including the render baseline, an export of the Thai and Bengali strings
read on a real iPhone looks right, one cold `astro dev` load of `/sign/` works, the manual Vercel deploy is done, and the sizes are recorded here. Expected:
`sign-vendor.js` 268 KB to 71 KB brotli, `/sign/` install 1,424,609 to 1,225,065.

**Not in scope:** new fonts. Tiro Bangla and Noto Nastaliq Urdu now shape cleanly, and Noto Sans Gurmukhi and Telugu are
worth re-screening (they crashed the fork), through the usual nine steps.
