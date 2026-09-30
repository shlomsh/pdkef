# qa/ai-pdf-filler

Inputs for the AI-04 manual trial of the PDF form filler: four synthetic, single-page forms (an English
community garden application and a Hebrew library membership request, each flat and scanned), the
answer key for their fields, and synthetic facts to paste into the tool. The tool is not built yet, so
nothing here measures it. Every person, number and organisation is fictional. All of it lives in
`qa/ai-pdf-filler/`.

| Path | What it is |
| --- | --- |
| `forms.mjs` | Layout source for both forms and the four variants (points, top-left origin) |
| `generate.mjs` | Thin orchestrator and the only file that writes to disk |
| `lib/*.mjs` | Pure steps: `text` (bidi order and mirroring), `draw-form`, `scan`, `geometry` (the one points to pixels matrix), `expected`, `verify`, `preview`, `pdfjs`, `document` |
| `fixtures/*.pdf` | The four generated PDFs |
| `expected/*.json` | Expected fields per fixture, with sha256 and every coordinate system |
| `previews/*-expected.jpg` | Each fixture with its expected rects drawn on, for eyeballing |
| `facts/en.json`, `facts/he.json` | Facts text to paste, plus the expected answer for every field |
| `TRIAL-CHECKLIST.md` | The steps to run per fixture and a results table |
| `STATUS.md` | Progress notes for this folder |

## Generate

```bash
node qa/ai-pdf-filler/generate.mjs
```

Needs Node 22.12 or newer, the repo's own engine. With the locked dependency versions, two runs give
byte-identical output. A different pdf.js or Skia build may change the scan bytes and the sha256
recorded in `expected/*.json`, so regenerate rather than hand-edit.

It uses dependencies already in the repo, with no new ones: `@cantoo/pdf-lib`, `@pdf-lib/fontkit`,
`bidi-js`, and `pdfjs-dist` for the scan raster, with `@napi-rs/canvas`, which `pdfjs-dist` installs
as its optional dependency. An install with `--omit=optional` cannot build the scans. Fonts are Arimo
(English) and Heebo (Hebrew) from `public/fonts`.

The generator imports nothing from `src/`. These fixtures are what the Sign editor will be tested
against, so they are drawn independently of its bidi, shaping and export code: `lib/text.mjs` orders
each line with `bidi-js` (UAX #9, including bracket mirroring) and paints it one character at a time
with pdf-lib. Only the trial checklist points at `src/`, to reuse the existing field scorer read-only.

Each drawn line also carries its typed (logical) text as `/ActualText`. pdf.js ignores that and
reports right-to-left brackets reversed, so pdf.js text from `he-flat.pdf` reads `)Email(` while the
page shows `(Email)`. This is how any correctly drawn right-to-left bracket extracts in pdf.js, not a
drawing fault. The generator checks the `/ActualText` exactly and the pdf.js text with bracket
direction set aside.

## Coordinates

- The page is A4, 595 x 842 pt.
- `forms.mjs` is authored in points with the origin at the top-left corner.
- Each field in `expected/<name>.json` gives `bounds` (normalised 0..1, top-left origin, the same
  convention as the Sign field-scoring ground truth), `rectPt` (points, top-left), and `rectPdf`
  (PDF user space, bottom-left origin).
- For scans it also gives `rectPx` (pixels, top-left) and `coordinates.scan.pointsTopLeftToPixels`,
  the same matrix the scan was rendered through.
- Scans are 150 dpi (1240 x 1754 px; see `coordinates.scan` in `expected/<name>.json` for the exact values), with a small
  deterministic rotation and offset. A scan rect is the axis-aligned box of the rotated field.
  Flat and scan rects are not interchangeable: the smallest flat-to-scan IoU is 0.32 (a checkbox),
  so score each fixture against its own `expected/<name>.json`.
- A writable rect is the inside of a box, the checkbox square, or the space above the signature line.
- The scans are image-only: one JPEG per page and nothing else. No text, no embedded fonts (the page's
  font list is empty), no annotations (an empty list), no AcroForm or widgets. The generator checks this.

## Scoring

`TRIAL-CHECKLIST.md` keeps three groups apart: detection over all 17 targets, answers and placement
over the 14 AI-fillable text, date and checkbox fields, and the comb and signature as manual work.

## Visual verification

Checked on 2026-09-30, after the text drawing became independent of `src/`, by rendering every
fixture with pdf.js:

- All four previews were checked by eye: every expected rect sits on its drawn box, comb, checkbox or
  signature line, including the rotated scans, and no text overlaps.
- Hebrew was checked in 2.5x crops of `he-flat` (labels, checkboxes, paragraph, office box, footer):
  letters in order right to left, final forms, brackets enclosing their text in `(יום/חודש/שנה)`,
  `(Email)` and `(ניתן להאריך פעם אחת)`, and `21`, `27` and `Email` running left to right.
  `he-scan` is byte-identical to the scan made earlier through Sign's own shaping, so both drawing
  paths paint the same Hebrew pixels.
- Structure was checked outside the generator too. Scans have one image, no fonts, no `BT` text
  operators, no annotations and no AcroForm. Flats have fonts and text, and no AcroForm.
- The generator checks that every drawn string (28 per form) comes back from pdf.js and matches an
  `/ActualText` span.
- The repo's `greedyMatch` scores each `expected/*.json` against itself as 17 of 17 at IoU 0.5.
- Two runs, from different working directories, gave identical sha256 for every output.
- A separate reviewer found the dark border pixels of every scan field in the rendered scans: all 34
  `rectPx` rects matched the drawn ink to within about 1 px. The field rects have not changed since.
