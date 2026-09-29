# qa/ai-pdf-filler

Inputs for the AI-04 manual trial of the PDF form filler: four synthetic, single-page forms (an English
community garden application and a Hebrew library membership request, each flat and scanned), the
answer key for their fields, and synthetic facts to paste into the tool. The tool is not built yet, so
nothing here measures it. Every person, number and organisation is fictional. All of it lives in
`qa/ai-pdf-filler/`.

| Path | What it is |
| --- | --- |
| `forms.mjs` | Layout source for both forms and the four variants (points, top-left origin) |
| `generate.mjs` | Draws the PDFs, builds the scans, writes the answer key and previews |
| `fixtures/*.pdf` | The four generated PDFs |
| `expected/*.json` | Expected fields per fixture, with sha256 and every coordinate system |
| `previews/*-expected.png` | Each fixture with its expected rects drawn on, for eyeballing |
| `facts/en.json`, `facts/he.json` | Facts text to paste, plus the expected answer for every field |
| `TRIAL-CHECKLIST.md` | The steps to run per fixture and a results table |
| `STATUS.md` | Progress notes for this folder |

## Generate

```bash
node qa/ai-pdf-filler/generate.mjs
```

The output is deterministic. It uses dependencies already in the repo: `@cantoo/pdf-lib`,
`@pdf-lib/fontkit`, `bidi-js` (through `src/editor/text/bidiRuns.js`), and `pdfjs-dist` with
`@napi-rs/canvas` for the scan raster. Fonts are Arimo (English) and Heebo (Hebrew) from `public/fonts`.

## Coordinates

- The page is A4, 595 x 842 pt.
- `forms.mjs` is authored in points with the origin at the top-left corner.
- Each field in `expected/<name>.json` gives `bounds` (normalised 0..1, top-left origin, the same
  convention as the Sign field-scoring ground truth), `rectPt` (points, top-left), and `rectPdf`
  (PDF user space, bottom-left origin).
- For scans it also gives `rectPx` (pixels, top-left) and `scan.pointsTopLeftToPixels`.
- Scans are 150 dpi (1240 x 1754 px; see `expected/<name>.json` `scan` for the exact values), with a small
  deterministic rotation and offset. A scan rect is the axis-aligned box of the rotated field.
- A writable rect is the inside of a box, the checkbox square, or the space above the signature line.
- The scans are image-only: one JPEG per page, no text layer, no AcroForm or widgets. The generator checks this.

## Visual verification

TODO(lead): filled in after review.
