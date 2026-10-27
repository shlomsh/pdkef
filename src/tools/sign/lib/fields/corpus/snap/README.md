# The snap corpus (SNG-09)

Scores `snapToPrintedLine`: given a tap on a rendered page, does the function snap to the printed rule the
person meant, snap to the wrong thing, or decline? Different question from the sibling corpora here, which
score whole-page field detection. Research and decisions: `backlog/tasks/SNG-09.md` (2026-10-01).

**One metric, three outcomes per tap.** Correct snap, wrong snap, declined. Snap precision =
correct / (correct + wrong), gated on the lower bound of a one-sided 95% Clopper-Pearson interval over at
least 30 documents (cluster bootstrap by document). The decline rate and the per-degradation, per-view
breakdown are always reported beside it, so declining everything cannot pass.

## The pipeline, and who owns each piece

```
vector PDF --(dev time, pdftoppm)--> pages/<id>.gray.gz   clean gray raster, committed
           --(collectPageInk)------> truth/<id>.json      the printed rules, exact, in points
pages/<id>  --degrade.js (seeded)-->  a degraded raster at one LEVEL and one VIEW
truth       --sampleTaps.js------->   taps with an expectation (a rule id, or decline)
raster + tap --cutWindow--> window --snapToPrintedLine--> result --scoreSnap.js--> outcome
```

Everything after the committed rasters is plain JS over typed arrays, deterministic from a seed, and runs in
Node with no dependency and no native tool. `pdftoppm` is only for regenerating `pages/`.

## Contract (the shapes the pieces agree on)

All coordinates in a *page* frame are PDF points with the origin at the top-left and y growing down (the
page's visible box, after rotation). All coordinates in a *raster* or *window* are pixels, origin top-left.

```js
/** A gray page raster. data.length === width * height, 0 = black, 255 = white. */
// PageRaster { id, width, height, pxPerPoint, data: Uint8ClampedArray }

/** One printed rule or box wall, from the vector ink. Points, y down. */
// TruthRule { id, kind: 'rule' | 'box', x0, x1, y, y0?, y1?, thickness }
//   rule: horizontal, from x0 to x1 at height y.   box: a closed rectangle x0..x1, y0..y1 (y = y1, its base).
// Truth { id, pageWidthPts, pageHeightPts, rules: TruthRule[] }

/** What the corpus asks. Window pixels are cut from the degraded raster around the tap. */
// Tap { id, formId, x, y }              points, y down
// Expectation { kind: 'snap', ruleId } | { kind: 'decline', why: 'blank' | 'text' | 'ambiguous' | 'far' }
// Case { tap, expect, level, view }

/** snapToPrintedLine(window, tap, options) */
// window  { data: Uint8ClampedArray, width, height, pxPerPoint }   gray, 0 = black
// tap     { x, y }                                                  window pixels
// options { maxSnapPx }                                             the largest distance a snap may move the tap, in window px
// result  { snapped: true,  kind: 'rule', x0, x1, y }               window px; y is the rule's centre row
//       | { snapped: true,  kind: 'box',  x0, x1, y0, y1 }
//       | { snapped: false, reason: 'no-ink' | 'no-rule' | 'too-far' | 'ambiguous' | 'text-like' }
```

The function never throws on a valid window, never reads outside it, and is pure (no DOM, no pdf.js, no
module state). `maxSnapPx` is supplied by the caller from the device's physical size (about 3 mm; see the
ticket), so the corpus passes it explicitly per view.

## Levels (degradation) and views (zoom)

A **level** is how the page looks as a scan; a **view** is how big it is on screen. They are independent axes
and every case carries both.

| Level | What it simulates |
| --- | --- |
| `clean` | the render as is (the control; must score near perfect) |
| `scan` | a decent flatbed scan: 0.3 degree skew, mild blur, gaussian noise |
| `fax` | a bad fax or copier: 1-bit threshold at 100 dpi-equivalent, speckle, broken and thickened rules |
| `phone` | a phone photo: 1.5 degree skew, uneven illumination gradient, blur, a shadow band |

| View | px per point | maxSnapPx | stands for |
| --- | --- | --- | --- |
| `fit` | 1.9 | 3 mm | whole page across a phone (rules are close together, ambiguity is the test) |
| `native` | 2.78 | 3 mm | the 200 dpi master as is |
| `zoom` | 5.7 | 3 mm | pinch-zoomed in; a scan is upsampled (a scan cannot be sharper than it was scanned) |

Phone geometry behind the numbers: a CSS px is about 0.16 mm and device pixel ratio is 3, so 3 mm is about
57 canvas px. At `fit` that spans 30 points of page, which is two or three text lines on a dense form: this
is why `ambiguous` is a first-class decline. At `zoom` it is 10 points.

## Tap sampling (`sampleTaps.js`)

For each truth rule, taps are placed where a person writing on it would tap: horizontally within the rule's
extent, vertically from 1.5x the rule's thickness above it up to the snap radius above it (the blank space
the text goes in), plus a few just below. **The expected target is the clearly nearest rule that covers the
tap's x**, not necessarily the rule the tap was aimed at: if the runner-up is within 1.3x as far, nothing is
clear and the case is `decline: ambiguous`, so a function that snaps there is guessing and scores wrong
(a first version expected the aimed-at rule and called a snap onto a clearly nearer one wrong; the oracle
scored 76% and exposed it). Decoys expect a decline: taps on printed text (when text boxes are supplied),
on blank areas farther than 2x the radius from any rule, and midway between two rules. Seeded, with a fixed
count per form so the denominators never move by accident.

## Status (2026-10-01)

Built: five forms (page 1, 200 dpi, 1.07 MB committed; 21 to 56 rules per form), the seeded degradation,
the sampler, the statistics, and the scorer (`scoreSnap.js`). Two controls prove the scoring before any real
function exists: declining everything scores no snaps and a decline rate of 1, and an oracle that reads the
truth scores 100% on the clean native view of every form and above 97% under skew.
Known limits, on purpose:

- Five documents is too few for the cluster bootstrap; the gate needs at least 30. More pages of these
  forms and more public-domain forms are the way, each checked into `pages/` through
  `scripts/snap-corpus/build-pages.mjs`.
- Truth is rules only (no boxes yet). Hyperlink underlines under text count as rules.
- Light-ink forms (`hmrc-sa100-2026`, `thai-pnd90-2565`) are skipped: their rules are pale grey, a faint-ink
  failure class worth adding as its own level later.
- The 4th argument of `snap(window, tap, options, oracle)` exists for test oracles only; the real function
  must ignore it.

## Ratchet

`scripts/score-snap.mjs` prints precision (with its lower bound), decline rate, and the per-level/per-view
rows, and diffs them against `snapBaselines.json`, two-way, like `score-form.mjs`. A gain nobody recorded is
a baseline nobody can prove moved. Targets: precision lower bound at least 0.95 on `scan` at `native`;
`clean` near 1.0; `fax` and `phone` reported, gated once the first numbers are read.

## Not here

- No OCR, no model (SNG-09 decision, 2026-10-01).
- Not `rasterInk.js` (FORM-07, whole page) and not `detectFormFields`. This corpus may call `rasterInk`'s
  exported primitives from the function under test; it does not edit it.
- Real scans: `irs-1040-1970` and a small public-domain set are a calibration check, added after the
  synthetic numbers are read. They are not the headline score.
