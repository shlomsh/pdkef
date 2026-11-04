---
id: "SCAN-19"
title: "Scan next: evaluate a small learned unwarping model (UVDoc) against the classical dewarp"
status: "done"
priority: "P3"
epic: "scan-next"
depends_on: ["SCAN-17", "SCAN-20"]
---

# SCAN-19 · A learned unwarp, evaluated, not adopted blind

*Opened 2026-11-04* when Shlomi chose "grid fit now, model later" for creased pages. *Measured and closed
2026-11-04*: UVDoc is not adopted. The three levels of page enhancement are in
[the handoff](../../docs/scan-enhance-handoff.md); this ticket is the evidence for levels 2 and 3.

## Why

SCAN-17's classical dewarp reads a page's shape from its text rows and table rules. A crease or crumple
where the page has neither is invisible to it. UVDoc (Magne et al., 2023, MIT code,
github.com/tanguymagne/UVDoc) is a small network trained on curved, folded and crumpled paper: 8M
parameters, a 488 x 712 input, a 45 x 31 unwarping grid out, which fits our single-resample warp
(`src/lib/pageEnhance/dewarp/meshWarp.ts`, moved from Scan by PE-01) as is.

## Recommendation

- **Level 2 (UVDoc): dropped (Shlomi, 2026-11-04), not built.** It loses to the classical level on every page where there is
  something to straighten, harms flat pages, weighs 7.7 MB to download, and its weights licence is not
  established. PE-13 is retired; reopen it only if a real curled-page photo set shows level 1 failing and the
  weights get a permissive licence. The draft message below is kept, unsent, for that day.
- **Level 3: nothing to pursue.** No larger or newer model has permissive code and weights.
- **Creases, per track.** On a book scan the fix is the spine split and a rotation per half (PE-03, PE-04), which
  reaches the noise floor. On a phone photo nothing needs building now: the folds on Shlomi's pages are faint
  shading lines with a kink of about 0.5 degree, and the Document look already removes them (measured in the
  follow-up below; PE-16 keeps what is left).
- PE-12 stays as a small seam but is no longer needed for a model (P3, later); PE-14's copy must not
  promise a learned option.

## Method

Models: the official `best_model.pkl` (32 MB), exported to ONNX (legacy exporter, opset 17, fixed
1 x 3 x 712 x 488 in, 1 x 2 x 45 x 31 grid out) as fp32, fp16 (`onnxconverter-common`), int8 dynamic and
int8 static QDQ (calibrated on 16 images from the test photos, so its parity is in-sample). Grids applied
with a bilinear upsample and one remap, checked against the repo's own `bilinear_unwarping` (max 1 grey
level). Photos: Shlomi's IMG_4757 (a letter) and IMG_4758 (a bill), one fold each, IMG_4755 and IMG_4759
(flat controls), flattened by the product's own corner step (`measureBend` found **no bend on any of the
four**, creased ones included, so level 1 as built equals the corners-only flat). For IMG_4755 the edge
guess returned the whole frame (white paper on a white table), so a hand quad was used for it; that was a
level 1 detection miss, and SCAN-33 has since fixed it on main. Book: the 8-page PDF, 16 halves at 300 dpi after the quarter turn
and the spine split, scored with the SCAN-36 metric (median per-line RMS about a horizontal line; noise
floor 1.8-2.0 px). Everything derived from the photos and the PDF stayed in a scratchpad.

## Results

### Book PDF (16 halves), px, median / worst

| variant | median | worst | median tilt |
|---|---|---|---|
| rotated only | 11.62 | 28.61 | 1.87 deg |
| classical lean rotation | **2.03** | **2.24** | 0.08 deg |
| UVDoc fp32 | 4.40 | 9.44 | 0.48 deg |
| UVDoc int8 | 5.07 | 10.09 | 0.59 deg |
| lean rotation, then UVDoc fp32 | 3.85 | 6.67 | 0.35 deg |

UVDoc cuts the 22-28 px lean of the tilted right halves to 3.5-9 px, but the lean rotation reaches 2 px.
On halves that were already level (0L, 6L, 7L) UVDoc makes them worse (7L: 1.46 to 6.33 px): lines bend
near the page edges. Text column about 10% narrower, ink 10-20% heavier; no lines dropped; glyphs not
distorted at 100%. The baseline reproduced the handoff's numbers exactly.

### Photos (line RMS in px, 2400 px long edge; noise floor about 1 px or 0.3 deg)

| photo | flat = classical | UVDoc fp32 | UVDoc int8 | ink box vs flat |
|---|---|---|---|---|
| 4755 flat control | 1.95 | 3.35 | 4.90 | 1.14 x 1.06 |
| 4757 creased letter | 2.77 | 2.67 | 2.49 | 1.01 x 1.04 |
| 4758 creased flyer | 2.60 | 3.17 | 2.85 | 1.07 x 1.02 |
| 4759 flat control | 2.42 | 1.89 | 2.04 | 1.05 x 1.04 |

- **Creases:** no measurable repair. The tilt change across the fold (4757) is -0.52 deg flat, -0.68 fp32,
  -0.61 int8; the fold crops still show the crease. The folds on these pages are shading, not bend: brightness
  dips are at most 2 grey levels and no text line crosses one, so the second and third crease (the thirds)
  could not even be located. A crease on a page lying flat is a faint line; a geometric model has nothing to
  unbend. The test set has no strongly curled page, so level 2's real strength (3D curl) is untested here.
- **Axes:** the one findable crease lies across the long axis, parallel to the text lines. No evidence of
  repair on either axis.
- **Harm to flat pages:** yes. UVDoc crops to the content and zooms (IMG_4755: 14% wider, 6% taller, a
  corner label cut off; 4757's header clipped, 4758's bottom strip cut), and adds about 1.4 px of wobble.
  Grid-only use (dropping its zoom) was not tried; the book result says wobble would remain.
- **fp32 vs fp16 vs int8:** fp16 is identical to fp32 (grid 0.2 px on a 1000 px page). int8 shifts the grid
  1.4 px on average (up to 11.6 px) and is about 0.5 px worse on the book and noisier on flats; the static
  QDQ int8 is no better.

### Browser (onnxruntime-web 1.31.1, Apple M2 Pro, Chromium 156 and WebKit)

| item | size (brotli) | note |
|---|---|---|
| runtime: `ort.wasm.min.mjs` + `ort-wasm-simd-threaded.{mjs,wasm}` | 2.3 MB (wasm 14.2 MB raw) | the default entry loads the 28 MB WebGPU build; use the wasm-only entry |
| UVDoc fp32 / fp16 / int8 dynamic / int8 static | 27.7 / 13.2 / 5.4 / 6.4 MB | ONNX barely compresses |

| model | cold session | median run (1 thread) | vs Python output |
|---|---|---|---|
| fp32 | 153 ms | 915 ms (WebKit 955) | 8e-7 |
| fp16 | 188 ms | 919 ms | 3e-7 |
| int8 dynamic | 189 ms | 2794 ms (ConvInteger runs, 3x slower) | exact |
| int8 static | 186 ms | 921 ms | 7.7e-3 max |

- Download for the smallest useful setup: about **7.7 MB** (int8 + runtime), 15.5 MB for fp16, 30 MB fp32.
- About 0.9 s a page on desktop single-threaded; 4 threads (fp32 257 ms) needs COOP and COEP, which the
  site does not send. Memory: Chromium's process grew 250-310 MB. A phone was not timed: the model fails on
  quality before speed matters, and the plan is desktop only.
- **CSP, tested under the exact meta policy from `dist/index.html` (no `wasm-unsafe-eval`, `connect-src
  'self'`):** ort runs in a module Worker started from a same-origin URL (the worker gets no CSP header, as
  `vercel.json` sends only `frame-ancestors`). It fails on the main thread and in a `blob:` worker (which
  inherits the page's policy): "CompileError, 'unsafe-eval' not allowed". Same result on WebKit; Firefox is not
  installed here. All requests same-origin. Untested: a worker URL that carries its own CSP header (do not
  add one).
- The graph uses only standard ops (Conv, PRelu, Pad, Reshape, Transpose, Slice, Concat).

## Weights licence: what is established

| claim | status |
|---|---|
| UVDoc repository code is MIT, "Copyright (c) 2023 Tanguy MAGNE" | established (LICENSE; same for UVDoc-Dataset) |
| `model/best_model.pkl` (32,158,393 bytes) is MIT | **not established.** The README says only "Our model is available in this repo at `model/best_model.pkl`"; no sentence on weights, ONNX, redistribution or commercial use. Reading MIT's "Software" as covering the checkpoint is an inference. |
| Training data allows it | **not established.** Doc3D's repo is MIT, no research-only wording, but access needs a form, and its textures are "Creative Commons" (variant not stated). UVDoc's textures come from many sources with no terms given. Whether dataset terms reach trained weights is unwritten. |
| Authors ever asked | no: 28 issues on the repo, none about licence; discussions are off |
| Paddle's `PaddlePaddle/UVDoc` and `UVDoc_onnx` (Apache-2.0 tag) | tag is real (checked 2026-11-04), but the card never cites the paper or authors; whether it is a retrain or a conversion of Magne's checkpoint is open. PaddleX issue 5187 asks exactly that, open, 0 replies since 2026-08-03. Their ONNX also outputs an image, not our grid. |
| Third-party re-exports on Hugging Face and GitHub (Apache-2.0 or MIT tags) | no authority to relicense; one says the original is Apache-2.0, which contradicts the repo's MIT |

Verdict: usable code, **unestablished weights**. Under the rule (code AND weights), UVDoc is not clean
today. This only matters if level 2 returns; PE-13 waits on it.

### Draft message to the UVDoc authors (for Shlomi to approve; nothing has been sent)

> Subject: Licence of the UVDoc checkpoint (best_model.pkl)
>
> Hello Tanguy, Olivier and Olga,
>
> I maintain PDkef, a free, open-source (MIT) set of PDF tools that run entirely in the browser, with no
> server and no uploads. Thank you for UVDoc: it is lovely work, and the small size is exactly what a
> browser needs.
>
> I was hoping to offer UVDoc as an optional download that straightens photographed pages, running on the
> visitor's device through onnxruntime-web. Before I do, could you tell me which licence the trained
> weights (`model/best_model.pkl`) are under? The repository's LICENSE is MIT, and I would like to be sure
> that covers the checkpoint, including converting it to ONNX, hosting that file on our own site, and use
> in a free product, and whether anything about the training data (Doc3D, the UVDoc textures) changes
> that. A sentence in the README would help everyone who finds it.
>
> I would credit the paper and the repository in the app and on the page. Happy to answer anything about
> how it would be used.
>
> Thanks, Shlomi (pdkef.com)

## Level 3: larger models and crease shading

Checked 2026-11-04 against the licence rule; none passes.

| name | size | code | weights | verdict |
|---|---|---|---|---|
| AADD (2025) | n/a | Apache-2.0 badge | not released ("will be released after camera-ready"; README only) | watch |
| SyntheticDoc baseline (2026) | not reported | MIT | not released; dataset licence not stated | watch; beats UVDoc on DocUNet (MS-SSIM 0.558 vs 0.544), trainable on MIT data if the dataset licence clears |
| DvD (diffusion) | 151M | AGPL-3.0 | none stated | fails |
| DocTr, DocTr++, DocGeoNet, DocScanner | n/a | contact for commercial use | | fails |
| D2Dewarp | about 71M | CC BY-NC-ND | | fails |
| PaperEdge | 139.7 MB x 2 | MIT | silent | fails |
| DocRes | about 15M | MIT | silent | fails |
| yomitoku UVDoc retrain | 8.2M | CC BY-NC-SA 4.0 | same | fails |
| DocShadow (cast shadows, not creases) | about 118 MB | MIT | silent; training set (SD7K) licence not stated | not established, and too big |
| DocDeshadower, DE-GAN, DocEnTr, BEDSR-Net | | no weights / GPL / CC BY-NC / no repo | | fails |

- **Larger dewarper:** no. Everything that beats UVDoc is non-commercial, AGPL, unreleased or silent.
- **Crease shading:** no licence-clean learned model exists. The option that does is classical: divide by a
  background estimate. `filters.ts`'s Document look already works that way (a pixel's ratio to the paper
  level around it, from a blurred block grid). PE-15 measures where that falls short.
- Re-check AADD and SyntheticDoc when their weights appear, and the PaddleX issue for Paddle's provenance.

## Acceptance

- [x] The before and after table is in this ticket, with the weight and desktop timing. The phone timing was
  skipped on purpose: quality failed first, and the plan is desktop only.
- [x] Adopted only if it beats the classical dewarp on creased pages without hurting flat ones. It does
  not beat it and it hurts flat pages: not adopted.
- [x] Licence verdict and draft message (above). Browser feasibility and CSP measured. Level 3 answered.
- Method files (scripts, ONNX exports, the browser harness) are in the session scratchpad, not the repo;
  the photos and the PDF never entered the repo.

## Follow-up 2026-11-04: packages and models for the phone-photo weaknesses

Research first (packages and models, licence quoted): every open dewarper fits one smooth sheet from text lines,
only Unfolder targets folds and it has no code, and no permissive deshadow network exists. An earlier version of
this section said none is measurably better than the shipped fit; at that point only UVDoc and DocAligner had been
run. The four below were then run on the 55-page synthetic corpus and on IMG_4755, 4757, 4758 and 4759.

**On the synthetic corpus two of them straighten creased text far better than the shipped fit; on the real photos
none of them improves a page.** Median line error in px, 3 degree creases:

| warp | before | shipped | `page-dewarp` | Leptonica |
|---|---|---|---|---|
| vertical crease | 8.5 | 7.3 | 1.8 | 1.4 |
| thirds, horizontal | 9.0 | 9.1 | 2.3 | 1.1 |
| thirds, vertical | 6.2 | 5.9 | 1.4 | 1.9 |
| two creases (cross) | 9.1 | 11.2 | 2.8 | 1.8 |
| horizontal crease | 0.8 | 0.7 | 2.9 | 1.5 |
| strong wrinkle | 5.1 | 2.6 | 5.1 | 4.5 |
| control | 0.8 | 0.7 | 0.8 | 0.9 |

Before and shipped are `page-dewarp`'s subset (text, Hebrew text, sparse); Leptonica's medians cover the two text
pages only, whose before and shipped are within 0.6 px of these on the crease rows. Straightness only: neither
result is scored on position.

| candidate | licence | real photos | verdict |
|---|---|---|---|
| `page-dewarp` 0.3.4 | MIT | 4757 no better (1.84 to 1.95 px) and loses its logo and last lines; 4758 heavily cropped; 4759 tilted 12 degrees and half gone; flat 4755 zoomed and clipped | no: it crops every page, including the control, and outputs grey |
| Leptonica 1.87.0 `dewarpSinglePage` | BSD-2 | declines all four (10, 1, 2 and 4 usable lines); declines every synthetic page too until we crop to the text rows first, then all tables and sparse pages | no: a text-only tool, nothing on these pages |
| PP-OCRv6 tiny detector (1.78 MB) | Apache-2.0 card; the ONNX conversion's steps are not documented | finds far more lines (4758: 49 against 1; 4759: 28 against 0), Hebrew and handwriting included | no gain yet: the same fit fed its lines is no better on any synthetic page (noise about 1 px), and splits lines on wrinkles. The one to remember if a fit ever needs lines on sparse pages |
| M-LSD tiny (2.6 MB) | Apache-2.0 code, weights unstated | finds one of the two clear folds, 12 false folds on the flat control | no: 20 of 32 synthetic folds with 44 false, only where a fold crosses blank paper; no better than Hough on rules |

Why the synthetic gains do not carry over: the corpus's creases are 3 degrees, about six times the 0.5 degree kink
on Shlomi's folds, and it is all long clean text rows. Three folded pages is a small sample; PE-16 says what would
reopen this.

**What the folds on these pages actually are** (prototype, thresholds tuned on these pages): one fold on 4757 and
one on 4758, none on 4759 or 4755. A shading repair takes the dark line from 4.8 to 0.8 and from 6.5 to 0.6 grey
levels, but the Document look already removes both folds: with the repair applied first, only 0.53% and 0.31% of
its pixels change. Shading matters only in the Original look. The one geometric defect found is a 5-7 px dent in
the boxed block's left border at the 4758 fold.

**Corners:** a classical prototype (whitened gradients, inside and outside Lab contrast) found all four photos but
regressed the corpus, and main no longer needs it: main's corners are within 0.9% of the diagonal of hand-marked
corners on all four. Worth keeping: paper reads bluer than a white table in Lab b*, which is the cue on IMG_4755.

DocAligner (corner model, Apache-2.0 code; the author wrote in issues 11 and 13 that the weights may be used,
bundled, converted and redistributed under the same terms; training data disclaimed) was tested on 6 photos
and 18 synthetic cases, and is **not adopted**: it found IMG_4755's white-on-white page (error 0.018 against the
shipped 0.18) only in one channel order and failed in the other; it misses the same page as a grayscale input and
misses the repo's real blank-form-on-white-table photo that the shipped guess finds (0.011); on 18 synthetic gray
cases 17 are within 0.035 where the shipped guess is within 0.0064. A 256 x 256 heatmap with a weak signal is a
thin margin; the white-on-white fix is the classical one (SCAN-33's faint-edge path). The 0.18 shipped figure is
from before SCAN-33. Still untested: SlimSAM as a page mask, only worth it if the classical path stalls.
