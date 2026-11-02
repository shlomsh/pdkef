# The layout corpus (READ-10)

Scores a page-layout reader: given a page raster, does it find the text rows, their ends, the word gaps and
the columns that a person reading the page sees? One corpus for the highlight reader and, later, field
detection and snap (READ-01 R34 to R38: one layout, no parallel readers). Different question from
`../snap/` (one tap, one rule) and from the form corpus (`../corpus.js`); it reuses the snap corpus's seeded
degradation (`LEVELS` clean, scan, fax, phone; `VIEWS` fit and native), its Clopper-Pearson bound and its
correct / wrong / declined scoring, and `../scoring/match.js`'s greedy matcher.

Today it scores only the SIGN-46 reader (`windowedReader.mjs`), which works on a window, and does not change
it. The baseline is the number the next step has to beat: `npm run score:layout`.

## Truth and sources

```
PDF --(build-pages.mjs, dev time)--> pages/<id>.gray.gz   clean gray raster, 200 dpi, committed
                                 --> truth/<id>.json      rows, words, columns, from the PDF's own text
```

`scripts/layout-corpus/build-pages.mjs` fetches each source PDF (pinned by sha256), or composes it
(`compose.mjs`), renders it with `pdftoppm`, and reads the truth from the text: pdf.js text items give each
row (by baseline, with its size and direction), `pdftotext -bbox` word boxes give the words and so the word
gaps, and the raster only tightens a row's ends to its first and last inked pixel. Columns, spanning rows and
reading order are derived from the rows. Regions that are not lines of reading (the text inside a figure, a
table's stacked header, the arXiv stamp) are `ignore`d: nothing is expected there, nothing counts there.
`--overlay-dir <dir>` writes every page with its truth boxes drawn, for checking by eye.

| Page | Source | Licence | Holds |
| --- | --- | --- | --- |
| `arxiv-2610.39111-p1` | arXiv 2610.39111 (Wu, Zhang, Tian, So) | CC BY 4.0 | two columns, spanning title, drop cap, footnotes |
| `arxiv-2610.39533-p4` | arXiv 2610.39533 | CC BY 4.0 | a table-like algorithm box, figures, equations |
| `arxiv-2610.39699-p3` | arXiv 2610.39699 | CC BY 4.0 | figures with captions, equations |
| `arxiv-2610.40607-p1` | arXiv 2610.40607 | CC BY 4.0 | a spanning teaser figure, italic abstract |
| `fr-2026-22353-p1` | Federal Register 2026-22353 | US government, public domain | three columns, a table, footnotes |
| `fr-2026-22349-p2` | Federal Register 2026-22349 | US government, public domain | three dense columns, footnotes |
| `composed-features` | `compose.mjs`, text written for the corpus | MIT, fonts OFL | spanning heading, drop cap, pull quote, figure, footnote |
| `composed-hebrew` | `compose.mjs` | MIT, fonts OFL | two right-to-left columns, spanning title and heading |

A source needs a licence that allows redistribution; each row of `truth/*.json` carries its `source`.

## Contract

All page coordinates are PDF points, origin top-left, y down. Truth row:
`{ id, order, x0, x1, y0, y1, baseline, size, column: 'c0'|null, spans, dir, text, gaps: [[x0, x1]], ignore?, kind? }`.
`gaps` are the word gaps, left to right in page space. Letter height is `0.7 x body size`; every tolerance is
in letter heights.

## The reader contract

```js
// reader.layout(raster, { probes, pageHeightPts, direction }) -> {
//   rows: [{ x0, x1, y0, y1, gaps }],   raster px
//   atProbe: [row | null],              the row under each probe (a press), raster px
//   columnsAt: [[{ x0, x1 }]],          the column spans around each probe, raster px
//   skewDeg: number | null, order: number[] | null }   null when the reader does not report it
// reader.swipe(raster, { pageHeightPts, direction }) -> { onText(a), bandsBetween(a, b) } | null   a, b in page percent
```

A page-level reader (`rasterRows`, later) returns every row for any probes and fills `skewDeg` and `order`;
the windowed reader returns the row at each press, the way a swipe uses it. Reading order and skew are
scored only when a reader reports them.

## Scores (`scoreLayout.mjs`)

Row F1 (vertical IoU at least 0.5, one to one, within a column), cross-column merge and split rates (at a
press, per `probeOutcome`), edge error in letter heights (p50, p90) and the margin-speck rate (an end more
than a letter height outward), word-gap F1, column count accuracy and gutter x error, spanning-row F1,
reading-order accuracy, skew error, and the user KPI: seeded swipes (`sampleSwipes.mjs`) scored correct,
wrong or declined, with the one-sided 95% Clopper-Pearson lower bound on precision and the decline rate,
per level and view. Declining everything cannot pass: the decline rate is always printed beside it.

**A swipe** is correct when it paints one band per expected row, each over its own row, each end within a
letter height of the word edge, none in another column. A press on blank margin must decline; a band there
is wrong. The swipes are seeded and a fixed count per page.

## Pinned rows (`pinnedRows.mjs`)

One row per element, in the style of `../corpus.js`, each pinning a zero. A row with `knownGap` is expected to
fail today; `layoutBaselines.json` records it, and the day a fix makes it pass the ratchet fails until the
row is re-recorded (flip it). Today: gutter dust, a spanning heading and a margin speck (the three READ-01
R33 failures), plus the drop cap (found here); the pull quote passes. Dirt is laid on the clean master
(`edits.mjs`) and ages with the page. Each dirt row has a control, the same press without the dirt, in
`layout.test.js`, so a failure is the dirt's.

## Ratchet

`scripts/score-layout.mjs` (`npm run score:layout`) prints the table and diffs it, two ways, against
`layoutBaselines.json`: a number that fell, a number that rose, or a pinned row that flipped fails until
`--write` records it. About 100 s for the full corpus; `--level`, `--view` and `--page` narrow a run (never
diffs). Runs on CI and nightly, not in `check:fast`; `layout.test.js` is the quick guard.

## Not here

- No reader other than today's. The contract, the page-level `rasterRows` and the cached page layout are
  READ-10's next steps; the swipe KPI here, with a real iPhone, gates switching the swipe reader to it.
- No OCR. Real scans are a later calibration check, not the headline.
