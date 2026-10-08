# FORM-33 · FFDetr, a learned field detector, on Sign's corpus

**NO-GO for scans, REWORK for digital forms.** FFDetr does not rescue a scanned form: on the one real
scan it finds nothing at a 0.5 score, and on rendered pages alone it trails the raster pass with OCR
words on precision. The surprise is the other direction: added as one more source next to today's
vector detector, it lifts recall from 85.0% to 93.4% at the same precision (80.2% against 80.6%).
Most of that is one form, the model is 116MB gzipped, and the training data may overlap the corpus,
so it needs a wider, held-out corpus before anything is decided. Measured 2026-10-08, ticket
[FORM-33](../backlog/tasks/FORM-33.md); every number sits next to [FORM-32](./form-32-ocr-detection-spike.md)'s.

## The model

`jbarrow/FFDetr`: RF-DETR Medium (an Apache-2.0 size), weights tagged Apache-2.0, 33.7M parameters,
trained on CommonForms (Common Crawl PDFs, terms unstated). Three classes: text input, choice button,
signature; no comb class. Native input 1024x1024 (the whole page stretched; at 576 the health page
gives 0 detections against 109). Loaded with `weights_only=True`, exported to ONNX (opset 17):
fp32 138MB raw, 116MB gzipped. Node onnxruntime reproduces the PyTorch detections exactly on the two
reference pages (109 of 109, box delta 0.000%). Dynamic int8 (54MB, 33MB gzipped) loses 2 of 109
detections and runs slower on CPU (4.4-4.8 s against about 0.9 s per page for fp32 on an M2 Pro).

## Results

Micro-averaged recall / precision over FORM-32's 9 flat rows (593 targets):

| Setup | Download | clean300 | clean200 | phone |
| --- | --- | --- | --- | --- |
| A, today (vector ink, pdf.js text) | none | 85.0 / 80.6 | | |
| Raster ink, no text (FORM-32 B) | none | 36.9 / 63.7 | 38.3 / 65.2 | 22.4 / 51.8 |
| Raster ink + Tesseract words (FORM-32 Cw) | about 2MB | 39.0 / 79.4 | 40.0 / 84.6 | 22.3 / 58.7 |
| Raster ink + perfect text (FORM-32 E, ceiling for any OCR) | | 44.5 / 84.1 | 45.5 / 82.1 | 29.2 / 64.6 |
| FFDetr alone, score 0.5 | 116MB | 43.5 / 52.9 | 52.6 / 59.7 | 31.9 / 65.9 |
| FFDetr alone, score 0.3 / 0.7 | | 52.4 / 42.3, 25.6 / 65.0 | | |
| Raster ink + FFDetr | | 60.2 / 55.3 | 64.9 / 59.9 | 42.5 / 60.3 |
| Today + FFDetr | | **93.4 / 80.2** | | |

The real scan, `irs-1040-1970` (64 targets): FFDetr at 0.3 gives 6 candidates (7.8% recall), at 0.5
none; raster ink + FFDetr equals raster ink alone, 54.7 / 97.2. The clean rasters are renders of
born-digital PDFs, which is what CommonForms trains on; a real scan is not.

## What the rows say

- **Today + FFDetr gains on three forms and costs on one.** `btl-p7` 45.3 / 86.7 to 93.0 / 93.0 (41
  of the 50 extra matches), `health` 86.7 / 100 to 94.7 / 95.9, `thai-sso` 91.3 / 100 to 95.7 / 97.8;
  `hmrc-sa100` keeps 100% recall but precision falls from 93.8% to 55.6%. The other rows are unchanged.
- **Per kind, FFDetr alone at 0.5 on clean300:** text 69.4% recall (48.7% precision), radio 94.2%,
  checkbox 19.4%, date 33.3%, comb 0 (no class), signature 0 (3 detections above 0.3 across all
  rasters).
- **It is not a scan detector.** Phone quality drops text recall to 47.3% and checkboxes to 5.6%;
  the real scan gives nothing.

## Before any decision

- **Leakage.** CommonForms is drawn from Common Crawl, and forms like the I-9 and the IRS 1040 are all
  over the web; some corpus forms may be in its training set. A held-out set (forms published after
  the dataset, or our own) is the honest test.
- **One form carries the gain.** Nine flat rows is a small corpus; the `btl-p7` jump is most of it.
- **Weight and phone cost.** 116MB gzipped and a 1024px stretched input. Phone time and memory are
  unmeasured, int8 does not hold parity, and fp16 was not tried.
- **Hosting.** It would have to be same-origin and opt-in (see the ticket); sending a page to a hosted
  model breaks the first invariant.

## Reproducing

`scripts/spike/form-33/scoreFfdetr.mjs --scratch33 DIR/ffdetr --raster DIR/form32/raster` (arm A
reproduces `baselines.json` on all 12 rows; `--parity` checks the ONNX model against the PyTorch
reference). The export ran in a throwaway venv: `rfdetr` 1.11.2, `RFDETRMedium(num_classes=90,
resolution=1024)`, weights from `FFDetr.pth` via `torch.load(weights_only=True)` with only
`argparse.Namespace` allowed. The rasters come from FORM-32's `renderAndOcr.mjs`.
