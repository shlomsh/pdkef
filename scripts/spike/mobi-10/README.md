# MOBI-10 spike tooling: non-anydoc signals, scorer, overlay

Three scripts, ESM node, run from the repo root. See `CONTRACT.md` for the shared data shapes
(`CandidateField`, ground-truth file) and the coordinate model. `report-anydoc.md` records the anydoc / PDF Inspector
signal (a negative result; its runner was not kept).

## 1. `extract.mjs` — native-widget + pdfjs-layout signals

```bash
node scripts/spike/mobi-10/extract.mjs --input <pdf> [--page 1] --out <dir>
```

Writes, into `<dir>`:

- `candidates.native-widget.json` — AcroForm widget annotations, read via
  `pdfjs-dist/legacy/build/pdf.mjs`'s `page.getAnnotations({ intent: 'display' })`. Field type maps
  `Tx`→`text` (or `comb` when pdf.js's own `comb` flag is set on the field), `Btn`→`checkbox`/`radio`
  (via `a.radioButton`), `Ch`→`select`, `Sig`→`signature`. `required` comes from `fieldFlags & 2`
  (the spec's Required bit, bit position 2). `label` is the field's `fieldName`. `confidence` is
  always `1.0`, `source` is `native-widget`. Both itc101 and health have **zero** AcroForm widgets on
  page 1 (confirmed: `annots.length === 0` for both), so this array is empty for both — a valid,
  reported result, not a bug.
- `candidates.pdfjs-layout.json` — the existing comb/checkbox detector,
  `detectPageRegions(page, pageIndex)` from `src/tools/sign/fields/formGrid.js`, fed a `@cantoo/pdf-lib`
  page (same loading pattern as `scripts/generate-form-grid-fixtures.mjs`). One candidate per comb run
  (with `cells`), one per checkbox. `confidence` is `0.8`, `source` is `pdfjs-layout`.
- `text-items.json` — every `pdf.js` text run on the page (`page.getTextContent()`), with `str`, `dir`
  (`ltr`/`rtl`), normalized `bounds`, and a `suspectedReversed` flag (see "RTL order" below).
- `page.json` — `pageSize` (points), `rotation`, and the counts from the three files above.

### Coordinate conversion (verified empirically)

`CONTRACT.md`'s model is fractions `0..1`, origin top-left, y down. Two different inputs needed two
different conversions, both implemented in `extract.mjs`:

- **PDF user space** (pdf.js annotations, and this script's own text-item bounds): origin bottom-left,
  points, y up. `pdfRectToFraction()` applies the formula in `CONTRACT.md` directly: `x = x0/pageWidth`,
  `y = (pageHeight - y1)/pageHeight`, width/height divided by the matching page dimension.
- **`detectPageRegions`'s own output**: this was the one gotcha. It does *not* return PDF points — it
  returns `{left, top, width, height}` already in the editor's **page-percent** model
  (`pdfPointToPagePercent` in `src/editor/geometry/coords.ts`), which is `0..100`, top-left origin,
  y down — i.e. the *same orientation* as the contract, just scaled by 100 instead of 1. So the only
  conversion needed is `percentBoxToFraction()`: divide `left/top/width/height` by 100. No PDF-point
  math, no y-flip.

This was verified by rendering `overlay.pdfjs-layout.png` for both forms and reading the images:
every comb box sits exactly on its printed digit boxes, every checkbox box sits exactly on its printed
square, on both itc101 (Hebrew, dense multi-section form) and health (Hebrew, two-column checkbox
form). No offset, scale, or axis-flip errors were visible on either form. If a future caller feeds
`detectPageRegions`'s output through the PDF-point formula instead (an easy mistake, since every other
source in this spike **is** in PDF points), boxes will land roughly right but scaled off in the corner
opposite the page's growth direction — render an overlay and look at it before trusting new candidates
from this source.

### RTL text order

pdf.js's `getTextContent()` returns Hebrew strings in **logical (correct reading) order**, not visual
order, for both sample forms. Confirmed two ways:
1. `suspectedReversed` (a Hebrew run whose first character is a final-form letter — ם ן ץ ף ך — which
   is only legal word-finally, so a leading one is proof of reversal) is **0/370** text items on
   itc101 and **0/542** on health.
2. Manual read of the first 15 multi-character RTL runs on itc101 (e.g. `"מתוך"`, `"דף"`,
   `"כרטיס עובד"`, `"לפי תקנות מס הכנסה )ניכוי ממשכורת ומשכר עבודה(, התשנ\"ג -"`) are all correct,
   readable Hebrew phrases.

This is `pdf.js` text extraction specifically, not `pdf-inspector`/anydoc — SEO-32's RTL concern was
about the anydoc dependency's own text pipeline, which is a separate signal covered by `report-anydoc.md`, not by this one.

## 2. `score.mjs` — greedy IoU scorer

```bash
node scripts/spike/mobi-10/score.mjs \
  --truth <ground-truth.json> --candidates <candidates.json> [--iou 0.5] --out <report.json>
```

One-to-one greedy matching (highest IoU claimed first) on same `pageIndex` + compatible `kind`
(exact match; `unknown` matches anything; `{text, table-cell, date}` mutually compatible;
`{checkbox, radio}` mutually compatible) + IoU ≥ threshold. Writes `<report.json>` and prints a
compact table plus label-association and confidence-calibration lines to stdout.

Per-kind rows read from two sides, because a cross-compatible match (e.g. a `radio` candidate matching
a `checkbox` target) has no single kind that names both ends: `targets`/`misses`/`recall` are grouped
by the **target's** kind, `detected`/`FP`/`precision` by the **candidate's** kind, and the row's `TP`
is the target-side count. The `TOTAL` row has no such ambiguity (every match is exactly one target and
one candidate either way).

No real ground-truth file exists yet (another agent is authoring `ground-truth/<form>-page1.json`).
The scorer is tested against a small synthetic fixture pair in `fixtures/` that exercises: an exact-kind
match with a good label, a compatible-but-not-exact kind match (`checkbox` target / `radio` candidate)
with no candidate label, a miss, and a false positive, split across both confidence bands:

```bash
node scripts/spike/mobi-10/score.mjs \
  --truth scripts/spike/mobi-10/fixtures/synthetic-truth.json \
  --candidates scripts/spike/mobi-10/fixtures/synthetic-candidates.json \
  --out /tmp/synthetic-report.json
```

Expected output: 2 matches (comb exact, checkbox↔radio compatible), 1 miss (`text`), 1 false positive
(`checkbox`), label association 1/2 (the unlabeled `radio` candidate scores as incorrect), confidence
calibration 100% precision at ≥0.8 (n=2) vs 0% at <0.8 (n=1).

**Once ground truth exists** (`scripts/spike/mobi-10/ground-truth/<form>-page1.json`), score every
signal against it, e.g.:

```bash
node scripts/spike/mobi-10/score.mjs \
  --truth scripts/spike/mobi-10/ground-truth/itc101-page1.json \
  --candidates scripts/spike/mobi-10/out/itc101/candidates.native-widget.json \
  --out scripts/spike/mobi-10/out/itc101/report.native-widget.json

node scripts/spike/mobi-10/score.mjs \
  --truth scripts/spike/mobi-10/ground-truth/itc101-page1.json \
  --candidates scripts/spike/mobi-10/out/itc101/candidates.pdfjs-layout.json \
  --out scripts/spike/mobi-10/out/itc101/report.pdfjs-layout.json

```

(swap `itc101` for `health` for the second form; `label.mjs` and `cells.mjs` write further
candidates files, scored the same way; the decision record in `docs/mobi-10-field-map-spike.md`
has the full table).

## 3. `overlay.mjs` — visual check

```bash
node scripts/spike/mobi-10/overlay.mjs \
  --render <png> --truth <gt.json|none> \
  --candidates <a.json> [--candidates <b.json> ...] --out <png>
```

Draws every box on top of the render: truth in green, each `--candidates` file in its own colour in
order (red, blue, orange, purple, wrapping after four). Each box's `id` is printed at its top-left
corner. Uses `@napi-rs/canvas`, installed only into `scripts/spike/mobi-10/node_modules` (never the
root `package.json` — a separate `npm install --no-package-lock @napi-rs/canvas` in this directory). If
canvas fails to load, it falls back to writing an SVG (`.svg` extension swapped in) with the render
embedded as a `data:` URI and rectangles drawn on top, and says so on stdout; `@napi-rs/canvas` built
and ran fine on this Mac, so the fallback path is implemented but wasn't exercised by a genuine load
failure here.

## 4. Extraction run: itc101 and health, page 1

```
itc101.pdf page 1: native-widget=0  pdfjs-layout(combs=38, checkboxes=36)  text-items=370 (rtl=124, suspected-reversed=0)
health.pdf  page 1: native-widget=0  pdfjs-layout(combs=4,  checkboxes=51)  text-items=542 (rtl=361, suspected-reversed=0)
```

- itc101's `38 combs / 36 checkboxes` matches the count already recorded in `backlog/tasks/MOBI-10.md`
  ("Known evidence before testing") exactly.
- health's `4 combs / 51 checkboxes` does **not** match the "~2 comb runs and ~127 checkboxes" ballpark
  given in this spike's task brief. Manually counting the visible checkbox pairs in
  `out/health/overlay.pdfjs-layout.png` (10 questions × 2 in the left column, 14 × 2 in the right
  column, 3 in the "אישור הרופא" acknowledgement section) gives exactly 51, and the 4 comb boxes are
  visibly correct (one ת"ז control-number comb, three in the כתובת row: ת"ד / פקס / נייד). The 51/4
  figures, not the ~127/~2 ballpark, are what the detector actually produces and what the overlay
  visually confirms — treat the ballpark in the brief as stale rather than re-deriving the detector to
  match it.
- Both overlays (`out/itc101/overlay.pdfjs-layout.png`, `out/health/overlay.pdfjs-layout.png`) were
  read and visually checked: every box sits on its printed comb or checkbox, no visible drift.

## Never commit

PDFs, rendered PNGs, or anything under `out/`/`fixtures`-adjacent scratch output derived from the real
source forms. Only the scripts, `README.md`, `package.json`, and the synthetic `fixtures/` pair (which
contain no real form content) belong in git.
