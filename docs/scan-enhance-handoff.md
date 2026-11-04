# Scan and page enhancement: handoff (2026-11-04)

The cloud session that ran SCAN-17 to SCAN-36 handed this work to a local session. Start here.

## Branches waiting to land (all on GitHub, none merged)

Land in this order: each was checked in its own worktree, not together. Before each:
`git fetch && git rebase origin/main`, `npm run check:push`, and for 21/23/24 `npm run check:e2e`.

| Order | Branch | Ticket | State |
|---|---|---|---|
| 1 | `scan-35-edge-bows` | SCAN-35 | Done. A flat page's edges no longer read as bowed (pixel wander and a fold's kink); real bows still recovered. |
| 2 | `scan-21-fast-dewarp` | SCAN-21 | Done except a real-phone timing. Page work in a Web Worker (a new pageWork folder in Scan's lib, main-thread fallback), banded solver ~25x faster, byte-identical output, `ProcessedPage.bentPx`. Rename its `pageWork/orientation.ts` (an EXIF probe) to `exifProbe.ts` before 3 lands. |
| 3 | `scan-32-upright` | SCAN-32 | Detector only: `lib/dewarp/orientation.ts` `textTurn` (text across vs down). Rebase its two `lineBend.ts` exports onto 2's banded `lineBend`. Not wired in. |
| 4 | `scan-34-aspect` | SCAN-34 | `lib/aspect.ts` `pageAspect` (Zhang-He, assumed focal 0.75 x long side when unsolvable), `snapPaper` at **3% (decided)**, `warp.ts` `warpSizeFor`. Not wired in. |
| 5 | (new) wire 3 and 4 into `pageWork/steps.ts` | SCAN-32/34 | The page's quarter turn must be known **before** the bend is measured (a sideways page's text is never straightened today); output sized with `warpSizeFor(pageAspect)`. Acceptance: Shlomi's photos upright and at 1.41 within 3% (folded bills reach 5-7%). |
| any | `scan-33-white-on-white` | SCAN-33 | Done. Faint-edge outline pass; photo 4 (blank form) is now a real corpus fixture, corner error 0.18 to 0.01; KPI better on every row. Shlomi to glance at its corners in `edges/real/labels.json`. `detectPage` returns `lowContrast`. |
| any | `scan-23-one-shot` | SCAN-23 | Done. Hash taken from the flattened page; every page taken this session remembered; `duplicate` phase. |
| any | `scan-24-guidance` | SCAN-24 | Done; rerun the scan e2e after build. Keep its one-line `nextView` change in `useCamera.ts` when merging with 23. Wire `lowContrast` (33) into the contrast hint. |
| ref | `scan-36-prototype` | SCAN-36 | Python prototype scripts only. Never merge. |

Known follow-ups found on the way: with Auto off the camera can read "Page 0. Turn the page." without a
shot; the turn line shows the old count until the photo arrives; a page held too close reads as "A
darker surface helps"; plain-text pages hash only 14+ bits apart (duplicate threshold 12: thin margin);
a deleted page stays remembered (the shutter still takes it); measuring is still ~300 ms on desktop
(edge curves ~130 ms and the 2400 px warp now dominate); `encodePages` still runs on the main thread.

## Decisions so far (Shlomi)

- A scan that squeezes two book pages onto one landscape sheet is split at the spine first, and each page is
  handled as if it were a different page (own lean, own bend, own squeeze). Never one fit across both.
- Highlight first: when it opens a crooked scan it suggests enhancing the file; accept or dismiss. A learned
  model (levels 2 and 3 below, downloaded on request, desktop only) was the plan; measured 2026-11-04 it
  does not beat the classical level, so it is dropped (SCAN-19, PE-13 retired).
- One page-enhancement mechanism common to Scan and Highlight; simple, well bounded, easy to test, low debt.
- Learned models: permissive licences only (code AND weights); compare quality against size first.
- Photo 4 (blank form) may live in the repo; photos 1-3 and the academic PDF never.
- Snap to A4/Letter/Legal within 3%; assumed phone focal length when the perspective cannot give one.

## Open questions for Shlomi

- Marginalia on scanned books: the cleanup removed a handwritten "2213" and a stamp. Keep or remove?
- 90 vs 270 degrees: text alone does not say which way a sideways page turns. Use device orientation in
  the camera, the PDF's OCR text matrices when present, else a default plus Rotate.

## The shared design (from the planning worker; [unverified] = reasoned, not checked)

New shared folder, pageEnhance under src/lib (planned): moved from Scan `homography.ts`, `warp.ts`, `dewarp/*` (incl. orientation),
the quad core (`Point`, `Quad`, `RgbaImage`, `GrayImage`, scale/inset/rotate/order). Stays in Scan:
`edges/`, `camera/`, `capture/`, `aspect.ts`, `filters.ts`, `pageWork/`, the corner-editor quad helpers.
Highlight gets an enhance folder in its lib (render for analysis, `enhance.worker.ts`,
`enhancedPdf.ts`, the model adapter). Rule 9 bridged by stale-on-use allowlist entries (READ-02 precedent).

Contract (pure): `Piece { quad, width, height, bend, mesh, keep }`, `Assessment { turn, turnConfidence,
leanDeg, spread, bentPx, crooked }`, `PagePlan { pieces }`; `assess(gray)`, `planPage(src, base, a,
{strategy})`, `applyPiece(src, piece)` (one resample), `isAffine(piece)`, `BendStrategy { id, measure }`
(`classical` wraps measureBend; no learned strategy: dropped, SCAN-19).

Highlight phase 1 lives in the file line's status slot: silent check (no marks yet), then "This scan is
sideways, two pages to a sheet · Straighten · Not now", then
"Straightening page 3 of 8…" with Cancel, then "Straightened into 16 pages · Undo". Turn-only plans use
the existing undoable `pageTurns`. Affine pieces embed the original page (`embedPage` + matrix + clip),
so the old OCR text moves with it [unverified: needs an e2e]; bent pieces become images with no text
layer (Highlight reads rasters, READ R30).

If a learned model ever returns: files in a new models folder under public (same-origin), a runtime-only rule in
`precachePolicy`, their own cache that the SW's activate cleanup skips [unverified], onnxruntime only inside a
worker started from a same-origin URL and never `wasm-unsafe-eval` on the page (verified 2026-11-04, see
SCAN-19). Desktop gate: fine pointer, deviceMemory >= 8 where reported, Save-Data off.

Ticket order after landing: PE-01 pure move; PE-02 contract + applyPiece (Scan switched, flat bytes
unchanged); PE-03 fold finder; PE-04 lean as a rotation (reuse `rasterInk.estimateSkewDegrees`, range
up to 6 deg); PE-05 assess + planPage; PE-06 Highlight detection, no UI; PE-07 suggestion line and "Not
now" memory; PE-08 turn-only and vector rebuild with Undo; PE-09 raster pieces; PE-10 cleanup; PE-11
unsqueeze; PE-12 strategy seam; PE-13 UVDoc strategy (retired); PE-14 Highlight copy and FAQ; PE-15 shadows and shading.

Conflicts to resolve: two `orientation.ts` files; `measureBend` levels rows with a shear (spread halves
lean up to 4.65 deg: lean must be a quad rotation before the bend); three row/skew finders
(`pageLayout/textRows`, `dewarp/lineBend`, `rasterInk`) against R35 (open a debt ticket); one-bit pages
area-averaged at 1000 px may lose rows; `readInkBounds` treats any rotation as sideways.

## Book-PDF prototype (SCAN-36) findings

Rotating 90 deg clockwise makes all 8 pages upright (the OCR text matrices say so too). The spine is a
thin slanted dark line: sheared column histograms over +-6 deg found it on 8/8 (tilt 1.2-3.1 deg). The
lines are tilted, not curved: right pages -2.4 to -4.7 deg, left -1.4 to +0.3; rotating each half by
its lean leaves +-1-2 px. findLineBend found no bend because it leaves tilt to the corners and squares
only forms. Squeeze toward the spine: 5 of 8 right pages narrow 4-10% (horizontal only, a v2).
Cleanup inside the justified text column removes the fold line and dark edges. Estimate 4-6 days.
Scripts: branch `scan-36-prototype`.

## Two input families, two tracks (Shlomi, 2026-11-04)

They are different problems and are measured on different benchmarks. Do not mix their fixes.

- **Phone photo of a page** (Scan; also a photo opened in Highlight): perspective and corners (white paper on a
  white table), creases and wrinkles from a folded sheet, shadows of the photographer. Benchmark: Shlomi's photos
  4755-4759, the detection corpus, and the synthetic warped-page corpus (SCAN-19 follow-up). Tickets: SCAN-33/34/35,
  PE-15 (shadows), PE-16 (creases).
- **Flatbed or copier scan of a book** (an academic PDF opened in Highlight): no perspective and no corners; two
  book pages squeezed onto one landscape sheet, a different lean per half, a squeeze toward the spine, and the black
  gutter and edge stain where the open book lifts off the glass. Benchmark: the 8-page book PDF, scored per half.
  Tickets: PE-03 (spine split, then every approach per half), PE-04, PE-10, PE-11, SCAN-36.

The shared mechanism (pieces, one resample) serves both; the finders and the cleanup are per track.

## The three levels of page enhancement

Shlomi's plan for turning a photographed or scanned page into a flat document. The goal of every level is
the same: predict a matrix (a backward map, an unwarping grid) that our own warp applies in one resample,
fixing creases and curls on both axes.

1. **Local classical** (built, the Scan landing; PE-01..PE-11). Corners, edge curves, row and rule bend,
   the page's lean as a rotation per half or per fold facet. No model, no download.
2. **A small model**, UVDoc (MIT code, about 8M parameters), downloaded on request, desktop only.
3. **A larger model**, same delivery, for what level 2 cannot do.

Anything above level 1 is a download on request and desktop only. The rule for every model: permissive
licences (MIT, Apache-2.0, ISC, BSD-2/3, Zlib, 0BSD) for code AND weights, and quality compared against
size first.

## Learned models (measured 2026-11-04, SCAN-19)

Numbers and method are in [SCAN-19](../backlog/tasks/SCAN-19.md). Short version:

- **Level 2 (UVDoc) does not beat level 1.** On the 8-page book PDF, rotating each half by its lean
  reaches the glyph noise floor (median 2.03 px, from 11.62 px); UVDoc alone gives 4.40 px and makes 15 of
  16 halves worse than the lean rotation; fed the already lean-corrected half it still ends 1 to 4 px
  above it, and it makes level pages wobble. On Shlomi's photographed letters (folded in thirds, opened)
  the classical dewarp finds no bend and UVDoc did not measurably reduce the crease: its grid is geometric
  only, and a crease on a page lying flat is a faint shading line, not a bend. On flat pages it zooms and
  crops (ink box 14% wider, 6% taller on the flat control).
- **Weights licence is not established.** The repository's MIT file covers "the Software"; nothing written
  says the checkpoint, ONNX re-exports or its training data carry it. See SCAN-19 for the evidence and the
  draft message to the authors. Earlier text here said "MIT code and weights": that was wrong.
- **Browser feasibility is fine, the value is not.** onnxruntime-web 1.31.1 runs UVDoc in a worker started
  from a same-origin URL with no `wasm-unsafe-eval` on the page (Chromium and WebKit); it fails on the main
  thread and in a blob: worker. About 0.9 s a page single-threaded on an M2 Pro; int8 is 5.4 MB brotli, the
  runtime 2.3 MB brotli, about 300 MB of memory while it runs.
- **Level 3: nothing to pursue.** No larger or newer model has permissive code and weights. Everything
  that beats UVDoc is non-commercial, AGPL, unreleased (AADD, SyntheticDoc) or silent on its weights
  licence. No licence-clean crease-shading model exists; classical shading correction needs none.
- Excluded for licence: DocTr, DocTr++, DocGeoNet, DocScanner (contact for commercial use), D2Dewarp (CC
  BY-NC-ND), DvD (AGPL), yomitoku's UVDoc retrain (CC BY-NC-SA). PaperEdge (139.7 MB) and DocRes (about 15M
  parameters; the earlier "~900 MB" was not reproduced) are MIT code with no weights licence.
- Watch: AADD (Apache-2.0 badge; weights still unreleased) and SyntheticDoc (MIT code and dataset, a UVDoc
  style network that beats it on DocUNet; no weights yet).
- The way to repair a crease is level 1: the fold finder (PE-03) and the lean per facet (PE-04). A page
  folded in thirds is three facets, and the book result shows a rotation per facet reaches the noise floor.

## The academic-paper session brief

Paste into a local Claude Code session in this repo, then give it the PDF's path:

> Work on SCAN-36 in parallel with the Scan landing. Read CLAUDE.md, docs/module-boundaries.md,
> .claude/rules/tools-and-shell.md, this handoff, SCAN-36, SCAN-32, SCAN-19, READ-01 (R30-R36) and
> READ-03. Goal: make a badly scanned academic PDF readable in Highlight (phase 1 above). Compare on the
> PDF: the classical pipeline (branch `scan-36-prototype`), its variations (per-line vs whole-page
> straightening, cleanup strictness, marginalia kept vs removed) and UVDoc, with one documented
> straightness metric and side-by-side pages. Do not restructure the dewarp code until
> PE-01 lands; propose changes to the shared code. Keep the PDF out of the repo; own branch, no push to
> main without Shlomi's go-ahead.
