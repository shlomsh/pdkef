# FORM-08: is `pdf-inspector` worth a build experiment for form-field detection? (research note, 2026-10-01)

**Decision: NO-GO. Do not build the experiment, and download nothing.** Nothing installable today
exposes a position, rect or form field (the wasm returns Markdown and metadata only), and the three
things the crate does expose that matter here, text positions, AcroForm widgets and vector rects and
lines, are things the detectors already read from pdf.js and our own content-stream walker. The
remaining corpus misses are cell-closing and classification heuristics and one scan, none of which a
text and path extractor reaches, and the price is a Rust toolchain, a fork, a roughly 6 MB wasm and a
CSP change. Revisit only if the trigger at the end of this note fires.

Everything below was read from web pages on 2026-10-01 (GitHub, jsDelivr, docs.rs, raw GitHub files)
and the repo. Each page was read through a summarising fetch tool, not as raw bytes, so a figure is
only as good as that summary; "verified" below means read on the cited page, "inferred" means my
reasoning from what was read. No package, crate, tarball or binary was downloaded.

## 1. Published state

| Item | Value | Source (read 2026-10-01) | Status |
| --- | --- | --- | --- |
| `@firecrawl/anydoc-wasm` latest | 0.2.4 (published 2026-08-27) | https://www.jsdelivr.com/package/npm/@firecrawl/anydoc-wasm, https://github.com/firecrawl/anydoc/issues/170 | verified |
| anydoc's pin | `pdf-inspector` 1.14.2, workspace members node, python, wasm | https://raw.githubusercontent.com/firecrawl/anydoc/main/Cargo.toml | verified |
| `pdf-inspector` (crate, `main`) | 1.25.2, MIT, Rust 1.88+ | https://raw.githubusercontent.com/firecrawl/pdf-inspector/main/Cargo.toml, https://docs.rs/pdf-inspector/latest/pdf_inspector/ | verified |
| Our bump, firecrawl/anydoc#175 (1.14.2 to 1.20.0) | still **open**, unmerged | https://github.com/firecrawl/anydoc/pull/175 | verified |
| anydoc issue #170 (ask for the RTL fix) | still **open**, no maintainer reply visible | https://github.com/firecrawl/anydoc/issues/170 | verified |
| Third-party review on #175 (2026-09-25) | 1.20.0 is "not far enough" for Arabic (CER 0.146); 1.22.0+ reads 0.000; asks for 1.23 or newer | same PR page | verified, one commenter's measurement |
| RTL work in `pdf-inspector` | bidi handling shipped in 1.23.0 (2026-09-22); the release page and the PR comment disagree by one minor version on where Arabic is fully right | https://github.com/firecrawl/pdf-inspector/releases | verified, discrepancy unresolved |

One correction to the ticket and to MOBI-10: anydoc is not the only wasm. `pdf-inspector` ships its
own browser package, **`@firecrawl/pdf-inspector-wasm` 1.25.2** (MIT), built from
`wasm/` in the same repo, so the RTL fixes are installable today without waiting for anydoc#175.
That changes the RTL point, not the verdict, because of what it exports.

**Export surface of `@firecrawl/pdf-inspector-wasm` 1.25.2** (https://raw.githubusercontent.com/firecrawl/pdf-inspector/main/wasm/src/lib.rs,
https://github.com/firecrawl/pdf-inspector/tree/main/wasm): `processPdf`, `detectPdf`, `classifyPdf`,
`extractText` (plain text lines), `version`, plus the wasm-bindgen `init`. The `processPdf` result
carries `pdfType`, `markdown`, `pageCount`, timing, `pagesNeedingOcr`, OCR reasons per page,
document metadata, `confidence`, a `layout` summary (`isComplex`, `pagesWithTables`,
`pagesWithColumns`, page numbers only) and encoding-gap counters. **No field carries x, y, width,
height, a bbox, a rect or a per-item page index.** The binding does call the crate's
`extract_text_with_positions_mem` and `group_into_lines_preserving_all_text` internally, then
discards the positions. anydoc-wasm 0.2.4 is the same story, as MOBI-10 found: its calls are
`toMarkdownBytes`, `formatFromBytes`, `toDocument`, and for PDF only Markdown comes out
(https://github.com/firecrawl/anydoc/tree/main/wasm). So the answer to "does anything installable
today expose positions, rects or form fields" is **no, only Markdown and metadata**.

The Node binding is different: the 1.25.0 release notes name `extractTextWithPositionsAsync` for
Node (https://github.com/firecrawl/pdf-inspector/releases). So the maintainers expose positions on
Node and not in the browser build. That reads as a gap, not a design choice (inferred), which is why
a fork would be small, and also why it would be a fork.

## 2. What the Rust crate exposes

Source: https://raw.githubusercontent.com/firecrawl/pdf-inspector/main/src/types.rs, the
`extractor` module index and `fn.detect_vector_grid_in_region_mem` on docs.rs, and
`src/extractor/mod.rs`.

- **`TextItem`** (verified): `x`, `y`, `width`, `height` in PDF points with a bottom-left origin,
  `text`, 1-indexed `page`, `rotation`, `font`, `font_size`, `font_weight`, bold and italic flags,
  `fill_color`, `stroke_color`, `render_mode`, `is_underline`, `mcid`, and `item_type`.
- **`ItemType`** (verified): `Text`, `Image`, `Link(String)`, `FormField`.
- **`FormField` is an AcroForm reader** (verified, `extract_form_fields`): it processes widget
  annotations, takes the text from the `/V` value and the position from the widget's `/Rect`. That is
  the same data `src/tools/sign/fields/formWidgets.js` already reads through pdf-lib, and the corpus
  forms the detectors struggle with are flat (MOBI-10: "0 found (none exist)" for native widgets).
  It would add nothing to a flat form.
- **`PdfRect` and `PdfLine`** (verified to exist): `re` rectangles and `m`/`l`/`S` segments with a
  page, accumulated during content-stream extraction. The public `extractor` index lists only
  text-returning functions (`extract_text_with_positions_mem` and its `_pages`, `_in_frame`,
  `_and_rotations_` and `_with_options` variants) and line grouping; none returns rects or lines, and
  the `PdfRect` struct page returned 404 on docs.rs. My inference is that they are internal, used for
  underline and table detection, so a fork would have to reach into non-public code, not just wrap an
  existing call.
- **`detect_vector_grid_in_region_mem(buffer, page_idx, region_pdf_pt_bbox, render_dpi)`**
  (verified signature): returns a `VectorGridDetection` shaped like the table-structure input, with
  cell coordinates in crop-image pixels. It needs the region first, so it presupposes the
  "where is the table" question we are trying to answer, and it is built for table extraction.
- Could the wasm expose these? `TextItem` positions: yes, cheaply, the binding already computes
  them (inferred from the binding calling `extract_text_with_positions_mem`). Rects, lines and grid
  cells: only with upstream or fork changes in the crate (inferred).

## 3. Licence against the runtime allowlist

- Crate and both wasm packages: **MIT** (Cargo.toml, `wasm/Cargo.toml`, jsDelivr pages; verified).
- `wasm/LICENSE` (2,707 bytes) carries a **third-party notice for embedded Adobe CMaps**, a
  BSD-style licence (1990-2009 Adobe Systems) that requires the copyright notice to be kept
  (https://raw.githubusercontent.com/firecrawl/pdf-inspector/main/wasm/LICENSE; verified). It is
  within the spirit of BSD-3 but is embedded data, not a package.
- Direct dependencies on the wasm target (verified, `Cargo.toml`): `thiserror`, `log`, `regex`,
  `once_cell`, `include_dir`, `unicode-normalization`, `unicode-bidi`, `ttf-parser`, and `lopdf`
  0.45 with `wasm_js`. `wasm/Cargo.lock` lists 152 crates in all, including native-only ones that are
  not compiled for wasm (https://raw.githubusercontent.com/firecrawl/pdf-inspector/main/wasm/Cargo.lock).
- Per-crate licences were **not read** from crates.io (the crates.io page is a script app and came
  back empty). From general knowledge only, so inferred: nearly all of these are MIT or
  Apache-2.0 duals; the ones to check are `unicode-ident` (adds the Unicode-3.0 data licence, not on
  our literal list), `encoding_rs` (BSD-3-Clause on its data), `jiff` (Unlicense OR MIT) and
  `miniz_oxide` (MIT, Zlib or Apache-2.0).
- `npm run test:licenses` (`scripts/runtime-license-inventory.mjs`) reads each npm package's
  `package.json` licence against `src/data/runtimeLicensePolicy.js` and writes
  `THIRD_PARTY_LICENSES.md`. A wasm package declaring `MIT` would pass it while the compiled-in
  crates and the Adobe CMap notice stayed invisible to it (inferred from reading the script's
  header, not run on a wasm). Taking it on would mean a hand-written notice for those. Not a blocker,
  but a real cost and a place to get it quietly wrong.

## 4. Size, lazy loading, budgets

- **Raw `.wasm` size** (https://data.jsdelivr.com/v1/packages/npm/@firecrawl/pdf-inspector-wasm@1.25.2,
  verified): `pdf_inspector_wasm_bg.wasm` 5,997,774 bytes, glue JS 22,916. anydoc-wasm 0.2.4:
  6,691,779 bytes. Compressed size was not measured (it would need the file), so I have no brotli
  figure. For scale, FORM-06 measured the Tesseract core at 3.9 MB raw and 1.46 MB gzipped.
- **Could it be same-origin and lazy?** Yes in principle: both packages build with
  `wasm-pack --target web`, so the `.wasm` is a separate file loaded by `init()`, which can be
  dynamic-imported from a worker like pdf.js's. Not a risk to `test:weight`: its
  `MAX_FIRST_LOAD_BROTLI = 400_000` counts only the static-import graph reached from the page, and
  the heaviest page is about 325 KB brotli today, so a dynamically imported wasm is outside it
  (`scripts/check-page-weight.js`). `scripts/check-lazy-modules.js` would need a row to prove it
  stays out of first paint.
- **Costs that are not weight:** (a) our CSP has `script-src 'self'` and no `'wasm-unsafe-eval'`
  (`astro.config.mjs`, `security.csp`); compiling any wasm needs it, the same open item FORM-06
  recorded, and `.claude/rules/csp-scripts-pwa.md` says it is verifiable only with `npm run build &&
  npm run preview`. (b) The service worker precaches same-origin assets best-effort, so a 6 MB file
  needs an explicit exclusion like the fonts. (c) The upstream build notes say `wasm-opt`
  validation is disabled in the wasm-pack profile because of a Rust 1.95 and wasm-pack 0.15 clash
  (`wasm/Cargo.toml`), so building our own fork means pinning that toolchain.

## 5. Overlap with what pdkef already does

The bar is the 2026-10-01 `src/tools/sign/fields/corpus/scoring/baselines.json` (IoU 0.5, recall /
precision / labels), not the ticket's older 82.0 / 92.7:

| Form | Recall | Precision | Labels |
| --- | --- | --- | --- |
| Income-tax 101 (itc101) | 96.4 | 97.8 | 85.8 |
| Health declaration | 86.7 | 100 | 96.9 |
| Practice form | 100 | 100 | 100 |
| IRS 1040 2024 | 100 | 100 | 53.4 |
| IRS 1040 1970 (scan) | 0 | no candidates | n/a |
| USCIS I-9 | 98.1 | 96.2 | 60.8 |
| Thai pnd90 | 100 | 86.8 | 6 |
| Thai lor-yor | 100 | 100 | n/a |
| Thai SSO 1-10 | 91.3 | 100 | 53.8 |
| HMRC SA100 | 100 | 93.8 | 6.7 |

What `pdf-inspector` would add, item by item:

- **Text with positions, font, rotation:** pdf.js already gives runs (`textRuns.js`); the detectors
  consume them. Nothing new.
- **Correct Hebrew and Arabic order:** MOBI-10 measured 0 reversed words of 124 and 361 Hebrew runs
  from pdf.js. This is the one headline benefit of the newer crate, and pdkef does not need it.
- **`FormField` widgets:** already read by `formWidgets.js`, and absent on the flat forms.
- **Rects and lines:** `pageInk.js` already walks the content stream with the CTM, publishes only
  painted rectangles, and FORM-05 measured the one thing `pdf-inspector` does differently (it
  also harvests clip-path rects): +1 match on health for 5 false positives, nothing on nine other
  forms. Not worth it, and that was the cheapest test of the codebase's one distinctive idea.
- **Vector grid in a region:** table-shaped, region-first, pixel-space output; our `formCells.js`
  closes cells directly and is already at 86.7-100% recall on the digital forms in the table above.
- **Form XObjects:** `pageInk.js` deliberately does not walk `Do` forms. Whether `pdf-inspector`
  does is **not verified**, and no scored form is known to need it. This is the only possible
  advantage left, and it can be tested with no new dependency (see the trigger below).
- **The scan** (`irs-1040-1970`, 0% recall): no raster handling in the wasm, OCR is native-only
  (ticket's own note, still consistent with the `ocr` feature list in `Cargo.toml`). The scan is
  FORM-07's territory, which already moved it to 54.7% recall and 97.2% precision on the ink alone.
- **The label column** (Thai 6%, SA100 6.7%, I-9 60.8%) is the weakest number in the table.
  It is a property of `fieldLabels.js` and of Latin and Thai label conventions, not of missing
  text extraction: the text is already in hand.

Where the misses actually are (baselines notes): health's two dates, signature, two phone combs and
the e-mail and clause cells are boxes the detector does not close or kinds it does not report. Those
are decisions about ink geometry. A second text extractor has no purchase on them.

## 6. Recommendation

**NO-GO, stop here.** One clear reason: the only things `pdf-inspector` could contribute are positions
we already have, behind a toolchain and a fork we would own, and the unfinished work is on the
detector's side of the line. Supporting costs, any one of which would be a reason to hesitate: a
fork of bindings that upstream has not asked for, a pinned wasm-pack and Rust toolchain, a 6 MB
lazy asset, a CSP change, hand-kept third-party notices, and an upstream anydoc that has sat on
#170 and #175 for three weeks (the crate itself is very active: three releases on 2026-09-28).

**Revisit only if** both hold: (1) upstream `@firecrawl/pdf-inspector-wasm` ships rects, lines or
text items in its result without a fork, and (2) a probe shows an evidence form whose cells are drawn
inside Form XObjects that `pageInk.js` skips. Test (2) first, with no download: count `Do` form
operators and the rects inside them on every scored form, in the manner of FORM-05's throwaway
probe. If it finds nothing, the question is closed for good; if it finds something, the fix is a
Form XObject walk in `pageInk.js`, in our own code, not a dependency. If a build experiment is ever
approved, the exact downloads would be: the Rust toolchain (1.88 or newer) and `wasm-pack` 0.15.0,
the `firecrawl/pdf-inspector` source at a pinned tag, and its crates from crates.io; none are
requested now.

## What was not verified

- Any npm page: https://www.npmjs.com/package/@firecrawl/anydoc-wasm returned 403, so version and
  date facts for the npm packages come from jsDelivr and GitHub, not npm.
- crates.io pages returned no content; per-crate licences are from memory (flagged above).
- The compressed size of either `.wasm`; startup time; memory; mobile behaviour.
- Whether `PdfRect`/`PdfLine` are public (docs.rs struct page 404), and whether any function returns
  them.
- Whether `pdf-inspector` walks Form XObjects, and whether any scored form needs it.
- Anything about detection quality: no experiment was run, so there is no `score.mjs` row for
  `pdf-inspector`. The verdict rests on the API surface and the overlap argument, not on a
  measured score.
- The discrepancy between 1.22 and 1.23 as the version where Arabic reads correctly.
- Fetch results were summaries from a small model, not raw page text, and GitHub code search was
  login-gated (so `FormField` was traced through `src/extractor/mod.rs` instead).
