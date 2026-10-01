# FORM-06: can Tesseract `heb` read a form's labels? (spike record, 2026-10-01)

**Decision: GO, scoped to label crops.** On a clean 300 DPI raster of both Hebrew evidence forms,
Tesseract `heb` (tessdata_fast, tesseract.js 7.0.0) reads label-sized crops with a character error
rate of 0.9-3.9% and gets a label within one character of the truth 92-97% of the time (PSM 7) or
95-97% (PSM 8). That clears the bar written below on both forms, the cost is small, and the part
the ticket feared most, Tesseract's own layout analysis on a ruled form, did not fail: whole-page
recognition found 99-100% of the label-sized runs and 94-97% of its word boxes land on the real ink
at IoU 0.5. A GO here means FORM-07 and a label-reading stage are worth building. It ships nothing:
no dependency, no asset, no code path is added by this ticket. The GO does **not** extend to
digits, Latin text or whole-document "make my scan searchable" text, where the numbers are poor
(below), and it was measured on clean rasters only (see "What this did not measure").

## Samples

Page 1 of the two forms MOBI-10 scored, committed in the scoring corpus, byte-identical to the
MOBI-10 samples (same sha256).

| Form | File | sha256 | Reference runs scored |
| --- | --- | --- | --- |
| Health declaration (2021) | `src/tools/sign/fields/corpus/scoring/forms/health-declaration-2021.pdf` | `ccd0cb02...94adba53` | 391 (362 with Hebrew, 279 label-like) |
| Income-tax form 101 (2024) | `src/tools/sign/fields/corpus/scoring/forms/income-tax-101-2024.pdf` | `a5bfa867...9913f8ad` | 157 (123 with Hebrew, 115 label-like) |

Model data: `heb.traineddata` from `tesseract-ocr/tessdata_fast`, 961,404 bytes raw, 481,530 bytes
gzipped, sha256 `11f9e43a...0904db`. Engine: `tesseract.js` 7.0.0 with `tesseract.js-core` 7.0.0,
OEM LSTM. Run on Node 24 on an Apple M2 Pro (10 cores) while other work was running (load average
17-70 over the session); timings below are from the quiet end and were stable across repeats.

## Method

**Reference.** pdf.js `getTextContent()` on the same page: the text and the position of every item,
for free and exact. A *run* is one pdf.js text item. Items with no letter or digit (bullets, a lone
comma, a leader dot) are dropped. 36 Zapf Dingbats items on form 101 (the checkbox glyphs, whose
text layer reads "o" and "q") are dropped too, since the paper shows a box, not a letter; found by
font name through `page.commonObjs`. A run is **label-like** if it has Hebrew and at least three
letters. That slice exists because pdf.js splits some words into one- and two-letter kerning
fragments ("י", "ה"), and a crop of one letter is not what this would be used for. Every number is
given for all runs and for the label-like slice where they differ.

**Raster.** pdf.js legacy build, the way `score.js` opens it, rendered to an `@napi-rs/canvas`
canvas at 300 DPI (scale 300/72, 2481x3508 px), white background.

**Normalisation (both sides, nothing else).** NFKC; strip niqqud and cantillation (U+0591-05BD,
05BF, 05C1-05C2, 05C4-05C5, 05C7); strip bidi and format marks (U+200B-200F, 202A-202E,
2066-2069, FEFF); geresh and gershayim to `'` and `"`, curly quotes to straight, every dash and
maqaf to `-`; collapse whitespace. **Direction:** pdf.js emits these forms in logical order
(MOBI-10 measured 0 reversed words) and Tesseract emits logical order within a word, so nothing is
reversed anywhere. Words are never compared by position in the string. For the whole page, OCR
words are assigned to runs by geometry (an OCR word belongs to the run whose box covers at least
half of the word), then read right to left for an `rtl` run, left to right otherwise. Which words
belong to which run is decided by where they are, so the page's reading order is not scored, only
whether the right characters were found in the right place.

**Metrics.**
- **CER** is edit distance over **letters and digits only** (no punctuation, no spaces), summed over
  runs and divided by the reference characters (micro average). "Strict" CER keeps punctuation
  and collapsed spaces. Headline is the letters-and-digits one: punctuation and word splitting are
  separate problems and a label match would not use them.
- **Exact** is the same string equal; **within-1-edit** is at most one character off.
- **Word recall** (whole page) is the share of reference words, letters and digits only, found
  among the run's OCR words.
- **Found** is the share of runs that got at least one OCR word; a run with none scores as fully
  missed in the CER.
- **Box IoU.** Two reference boxes, because pdf.js's box is an em-box, not an ink box. *Nominal*:
  baseline minus 0.95 of the font height to baseline plus 0.30. *Ink-fit*: the bounding box of the
  dark pixels inside the nominal box. Tesseract boxes are ink boxes, so the ink-fit number is the
  fair one; the nominal number is reported because it is what pdf.js gives without looking at
  pixels. IoU is taken between the union of a run's OCR word boxes and the reference box, and
  reported as the share of runs at IoU 0.5 or more.

**Crops.** For each run, the nominal box padded by 6 px on every side, cut from the 300 DPI
raster, PNG-encoded and recognised alone at PSM 7 (single line) and PSM 8 (single word), with
`user_defined_dpi` 300. The 1-2 / 3-5 / 6+ breakdown counts words in the reference run.

Overlays of both pages (red: pdf.js boxes, green: Tesseract words) were read to confirm the boxes
line up before any number was trusted.

## Results at 300 DPI

### Whole page, PSM 3 (auto) with `output: { blocks: true }`

| | Health, all runs | Health, label-like | Form 101, all runs | Form 101, label-like |
| --- | --- | --- | --- | --- |
| Runs | 391 | 279 | 157 | 115 |
| Found | 90.8% | 99.3% | 86.6% | 100% |
| CER (strict) | 7.0% (10.6%) | 4.8% (8.3%) | 3.0% (6.7%) | 1.5% (5.2%) |
| Run exact | 67.8% | 70.3% | 72.6% | 85.2% |
| Word recall | 76.8% | 79.6% | 87.3% | 91.7% |
| IoU >= 0.5, ink-fit | 94.6% | 96.4% | 90.4% | 93.9% |
| IoU >= 0.5, nominal | 49.6% | 56.3% | 59.2% | 79.1% |
| Mean IoU, nominal / ink-fit | 0.46 / 0.82 | 0.51 / 0.85 | 0.49 / 0.77 | 0.59 / 0.77 |

PSM 11 (sparse text) is within a point on the label-like slice (health CER 4.3%, run exact 73.8%;
form 101 CER 2.1%, 83.5%), so layout mode is not what limits accuracy. By run length, all runs, PSM 3:

| Words in run | Health: n, found, CER, exact | Form 101: n, found, CER, exact |
| --- | --- | --- |
| 1-2 | 323, 88.9%, 8.5%, 75.9% | 95, 77.9%, 10.9%, 66.3% |
| 3-5 | 39, 100%, 7.0%, 41.0% | 27, 100%, 2.2%, 70.4% |
| 6+ | 29, 100%, 4.5%, 13.8% | 35, 100%, 0.4%, 91.4% |

The 1-2 word bucket carries every fragment and numeral, which is why its "found" and CER are
worst; the label-like row above is the fairer one. Long runs have a low exact-match rate and a low
CER together: one wrong letter in a sentence breaks equality, which is why CER, not exact match,
is the number to read for them. 101 of 751 (health) and 84 of 554 (form 101) OCR words fall inside
no reference run: ruled-line fragments read as `|` and `[`, and real words that sit outside the text layer, such as "רשות המסים בישראל" on form 101.

### Label crops, PSM 7 and PSM 8 (label-like runs)

| | Health PSM 7 | Health PSM 8 | Form 101 PSM 7 | Form 101 PSM 8 |
| --- | --- | --- | --- | --- |
| Crops | 279 | 279 | 115 | 115 |
| Exact | 73.5% | 77.8% | 90.4% | 87.0% |
| Within 1 edit | 92.5% | 94.6% | 97.4% | 97.4% |
| CER (strict) | 3.9% (6.3%) | 3.6% (5.7%) | 0.9% (3.3%) | 1.0% (3.8%) |

Per length, same slice (exact / within 1 edit / CER):

| Words | Health PSM 7 | Health PSM 8 | Form 101 PSM 7 | Form 101 PSM 8 |
| --- | --- | --- | --- | --- |
| 1-2 | n=211: 82.9 / 97.2 / 3.8% | 85.8 / 98.1 / 3.1% | n=53: 94.3 / 98.1 / 1.9% | 90.6 / 100 / 1.3% |
| 3-5 | n=39: 56.4 / 82.1 / 5.1% | 59.0 / 87.2 / 5.7% | n=27: 88.9 / 92.6 / 1.2% | 88.9 / 96.3 / 1.2% |
| 6+ | n=29: 27.6 / 72.4 / 3.4% | 44.8 / 79.3 / 2.9% | n=35: 85.7 / 100 / 0.4% | 80.0 / 94.3 / 0.8% |

All runs, including fragments and numerals, PSM 7 / PSM 8: health exact 71.1% / 76.2%, CER 5.9% /
4.8% (n=391); form 101 exact 84.7% / 79.0%, CER 1.8% / 2.4% (n=157). **Runs with no Hebrew letter**
(digits, Latin, "1993", "0101/130"): exact 82.8% / 79.3% on health (n=29) and 67.6% / 52.9% on form
101 (n=34), but CER 25-60%: the `heb` model reads numerals as Hebrew letters or symbols about as
often as it reads them.

PSM 7 and PSM 8 are within a few points of each other, PSM 8 a little better on the dense form
and PSM 7 on form 101; neither wins by enough to decide on this data. Mean Tesseract confidence is
85 on correct crops and 67 on wrong ones (health, PSM 7; form 101: 86 vs 66). Over crops with three or
more letters, flagging those below confidence 75 catches 52% (health, 23 crops) and 80% (form 101,
5 crops) of the ones more than one character off, and flags 16% and 6% of the good ones, so confidence is a usable *review* signal and
not a filter.

### Error classes, by what they cost

1. **Final mem confused with samekh** ("האם" read "האס", "במקום" read "במקוס", "שנים" read
   "שניס"). Folding ם and ס together on both sides lifts health label-like exact from 73.5% to
   82.8% and CER from 3.9% to 2.3% (PSM 7): 26 of the 74 non-exact crops. It is one systematic
   substitution, so a lexicon match over canonical labels (FORM-02) absorbs it. The fold is a
   diagnostic in the table above, not a claim about the product. Form 101 is unaffected (0.9% CER either way).
2. **"כן" ("yes") is the one common label that fails.** 2 of 24 correct at PSM 7 (read as the
   shekel sign ₪ at confidence 92, as "כןן", or as "כ"), 10 of 24 at PSM 8; "לא" is 24 of 24.
   Several failures are an extra letter: the neighbouring radio circle, which a 6 px pad includes,
   read as a letter. The yes/no option text beside a checkbox is the main label a form has, and
   the shekel misread is not caught by confidence. A crop must leave out the adjacent control, and
   a two-letter word needs a rule of its own.
3. **Trailing "?" read as "ז" or "!"**: affects strict CER, not the letters-and-digits CER.
4. **Digits and Latin**: see above. A scanned path must not take a number, a date or an ID from
   this model.
5. **Whole-page noise**: ruled lines read as `|`, `[`, `\`; 13-15% of OCR words fall in no
   reference run.

### Resolution

Same measurement at 200 and 150 DPI (the PDF re-rendered at that resolution; crop padding and
everything else unchanged). Label-like crops, CER / within 1 edit (PSM 7 | PSM 8):

| DPI | Health | Form 101 |
| --- | --- | --- |
| 300 | 3.9% / 92.5% \| 3.6% / 94.6% | 0.9% / 97.4% \| 1.0% / 97.4% |
| 200 | 5.9% / 93.2% \| 5.7% / 88.2% | 1.0% / 98.3% \| 1.8% / 93.9% |
| 150 | 10.2% / 87.5% \| 6.4% / 86.7% | 4.3% / 93.9% \| 3.6% / 89.6% |

Exact match falls faster than within-1 (health PSM 7: 73.5%, 66.7%, 67.4%; form 101: 90.4%, 91.3%,
73.0%), because the damage at low resolution lands first on punctuation (strict CER at 150 DPI is
19.8% on health against 10.2% for letters and digits). Whole-page
label-like CER at 200 / 150 DPI, PSM 3 | PSM 11: health 5.5% | 4.1% and 9.6% | 3.8%; form 101
2.1% | 1.9% and 1.6% | 3.6%. For arithmetic only: a 12-megapixel phone photo (4000 px) across an
A4 long side (11.7 in) is about 340 DPI, so 300 is a fair operating point and 150 is a stress case.

### Cost

| | Measured |
| --- | --- |
| Init (spawn worker, load wasm core, load `heb`, initialise), local files, warm disk | 47-156 ms |
| Whole page, PSM 3, health | 3.1-3.5 s over three runs (2.9-3.1 s at PSM 11) |
| Whole page, PSM 3, form 101 | 2.2 s over three runs (2.0-2.4 s at PSM 11) |
| One label crop | mean 4-10 ms, median 3-7 ms, p95 14-27 ms |
| 391 crops (health, PSM 7) | 2.1 s in total |
| pdf.js render at 300 DPI | 50-110 ms |

An early run while the machine was heavily loaded read up to 20 s for a page and about 29 ms per
crop; the figures above are the stable ones once the load dropped, and were still taken with other
work running.

**These are desktop numbers.** A phone was not measured and tesseract.js's core is single-threaded
WebAssembly. My inference, not a measurement: several times slower on a mid-range phone, which
would put a whole page at tens of seconds and a handful of label crops under a second. That is
why the label-crop path is the one worth building and a whole-page pass is not.

Over the wire, the first time only, from `node_modules`: `tesseract-core-relaxedsimd-lstm.wasm.js`
(the file `tesseract.js` 7 imports in the browser, wasm embedded) 3.9 MB raw, 1.46 MB gzipped;
`heb.traineddata.gz` 0.48 MB; `worker.min.js` 34 kB gz; `tesseract.min.js` 10 kB gz. About 2.0 MB
gzipped in all. The ticket's 1.6 MB used the 1.06 MB separate `.wasm`, which the browser build does
not load. Licences, from each package's `package.json`: `tesseract.js` and `tesseract.js-core`
Apache-2.0, `idb-keyval` and `wasm-feature-detect` Apache-2.0, `is-url`, `node-fetch`,
`regenerator-runtime`, `bmp-js`, `zlibjs` MIT; all on the allowlist. The traineddata is Apache-2.0
(tessdata_fast).

## The bar, and why GO

The ticket carries no numeric gate. This one was chosen **after the first full run**, so it is a
judgement to argue with and not a pre-registered threshold. It is modelled on MOBI-10's 85% label
bar, applied to what a label read would actually be used for (naming a field, matched against a
lexicon, shown for the person to confirm):

> Label-like crops at 300 DPI, PSM 7 or 8: at least 90% within one character and CER under 5%,
> on both forms; whole-page layout does not lose the labels; the cost fits an on-device path.

- Within 1 edit: 92.5-97.4% on all four form and PSM combinations. CER 0.9-3.9%. Passes.
- 1-2 word labels, the shape of a field label: within 1 edit 97.2-100%. 3-5 words: 82.1-96.3%, so
  the health form's longer labels are the weak spot at PSM 7 (82.1%); PSM 8 clears it (87.2%) on
  the same crops.
- Layout: found 99.3-100% of label-like runs, ink-fit boxes at IoU 0.5 for 93.9-96.8%. Tesseract's
  segmentation is not the failure the ticket expected on a clean ruled page.
- Cost: 4-10 ms a crop, 2-3.5 s a page on a desktop, about 2.0 MB gzipped once and only on the
  scanned path.
- GlotOCR's pessimism (best system 61% on clean synthetic Hebrew) does not carry over to these
  forms: printed David and FbDavidNew at 300 DPI are an easy case for an LSTM line recogniser, and
  that is what this measured.

The reasons it is a scoped GO and not a plain one: 200 DPI health CER is 5.7-5.9% (just over the
bar) and 150 DPI is over it, so labels have to be read from crops at about 300 DPI scale; digits
and Latin fail outright; and everything above is a clean raster. The mechanism for all of it is the
build ticket's acceptance, not an open question here.

**What the build should therefore be** (the shape the numbers support, not a design): geometry
from FORM-07's raster ruled lines, one crop per detected field neighbourhood rather than a page
pass, PSM 8 for one-word labels and PSM 7 otherwise, the crop kept clear of the adjacent control,
text matched fuzzily to a label lexicon with ם/ס folded, anything below confidence about 75 shown
for the person to check, and no number or date ever taken from OCR. The output is a suggestion the
person confirms (FORM-09), never a review of what the form needs. **A product decision comes
first:** OCR is not approved in `docs/sign-tool-product-decisions.md` (FORM-06's board cleanup
dropped it to P3 for that reason), so this GO is a measurement, and opening the build needs that
decision made, not just this record.

## What this did not measure

- **Degraded input.** Every raster here is a crisp render of a digital file. No skew, perspective,
  shadow, JPEG noise, blur or lighting; the DPI rows are the only degradation. A real Hebrew scan
  is not in the corpus (`irs-1040-1970.pdf`, FORM-07's scan, is English). These numbers are a
  ceiling for the model on this typography, not a forecast for a phone photo; the build ticket
  has to measure on degraded input before it claims anything.
- **Phone speed and memory.** Desktop only, with load on the machine.
- **Handwriting, other typefaces, other scripts, Latin text.** Two forms, both David-family print.
- **Browser behaviour.** Everything ran in Node with `worker_threads`. The browser path (blob
  worker, `importScripts`, the core's wasm compile) is described below from tesseract.js's source
  and was not run, because no preview server was started.
- **Word-level IoU for multi-word runs** is the union of a run's OCR words against the run box,
  not per word, because pdf.js items are the finest reference available and some hold a phrase.

## CSP mechanics if built

`tesseract.js` fetches both the wasm core and the traineddata from jsDelivr by default, which
`connect-src 'self'` (`astro.config.mjs`) would simply block. Every path has to be same-origin
and passed explicitly:

```js
createWorker('heb', 1, {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core/',          // a directory holding the *.wasm.js variants it picks from
  langPath: '/tesseract/lang/',          // heb.traineddata.gz; or gzip:false with the raw file
  cacheMethod: 'none',                    // or let it use IndexedDB: same-origin either way
});
```

- `corePath` is a directory: tesseract.js appends `tesseract-core-relaxedsimd-lstm.wasm.js` (or the
  `simd`/plain variant after `wasm-feature-detect`), so ship all three `-lstm.wasm.js` files (3.9 MB
  raw each) or the one it will choose, and pin the version. `langPath` + `heb.traineddata.gz`
  (default `gzip: true`).
- Provisioning follows `src/lib/pdfjsWasm.js`: copy the files out of `node_modules` into `public/`
  with a `postinstall` sync script, never fetch from a CDN, and add a unit test that fails if a
  `createWorker(` call site omits a path.
- In the browser tesseract.js starts a Blob worker that `importScripts` the worker path. The
  policy already allows `worker-src 'self' blob:`; `importScripts` from that worker should be
  governed by `script-src 'self'`, which a same-origin `workerPath` satisfies (expected, not run).
- **Open item, not verified here:** the current policy has no `'wasm-unsafe-eval'`, and
  compiling the core's WebAssembly may need it. CSP is invisible in `astro dev`; settle it with
  `npm run build && npm run preview` before anything else, as `.claude/rules/csp-scripts-pwa.md`
  requires for any change to scripts or the policy. If it is needed, it is a one-token addition to
  the script directive and a CSP-guard test must pin it.
- `connect-src 'self'` stays as it is. No file bytes leave the device; the OCR input is a crop of
  the page already in memory.
- Load the whole thing lazily, only on the scanned path, so the home page and every tool's weight
  budget (`test:weight`, `test:lazy-modules`) are untouched.

## Note for the SEO record

`docs/seo-competitive-findings.md` (line 473) lists "pdf ocr / text from scanned pdf" as rejected,
with the reason "20MB+ language data per language; locks the UI thread on mobile". Those two
reasons do not hold for Hebrew label reading as measured here: `heb` is 0.48 MB gzipped, and
recognition runs in a worker. That row, and SEO-26 which plans to say so publicly, **must be
revised before any user-facing claim changes**. What is *not* supported by this record is a claim
that PDkef can OCR a scanned document into searchable text: whole-page text was 1.5-7% CER and
77-92% word recall on clean rasters, and digits and Latin were worse. This record does not edit
that document or any SEO ticket.

## Reproducing

The harness is `scripts/spike/form-06/measureOcr.mjs`. It is not wired into any test or build. It
reads `tesseract.js` from a scratch directory, so nothing was added to `package.json`, the
lockfile or `public/`. Its header has the full recipe; in short:

```bash
SCRATCH=/some/dir/ocr && mkdir -p $SCRATCH && cd $SCRATCH
echo '{"name":"ocr-scratch","private":true,"type":"module"}' > package.json
npm install tesseract.js
curl -fL -o heb.traineddata https://github.com/tesseract-ocr/tessdata_fast/raw/main/heb.traineddata
cd <repo> && node scripts/spike/form-06/measureOcr.mjs --scratch $SCRATCH --out $SCRATCH/results.json --overlay $SCRATCH/overlays
node scripts/spike/form-06/measureOcr.mjs --scratch $SCRATCH --dpi 150 --repeats 1   # the resolution rows
```

Neither the traineddata, `node_modules` nor any wasm was committed. The tables are from the last
300 DPI run (`--repeats 3` for the whole-page timings) and one run each at 200 and 150 DPI; earlier
300 DPI runs gave the same accuracy figures to the digit and noisier timings.
