---
id: "FORM-33"
title: "Spike: FFDetr, a learned field detector, scored on Sign's corpus against today's detection"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-33 · Spike: FFDetr, a learned field detector, scored on Sign's corpus against today's detection

## Why

FORM-32 showed that on a scan the limit is geometry, not text: with perfect text the raster pass
reaches 44.5% recall against 85.0% from vectors, and finds nothing on tinted boxes (`hmrc-sa100`) or
dense combs (`thai-pnd90`). FFDetr (`jbarrow/FFDetr`, RF-DETR trained on CommonForms, weights
Apache-2.0) predicts text inputs, choice buttons and signature areas straight from a page image. This
spike measures it with the FORM-32 harness and rasters, so its numbers sit next to every FORM-32 arm.

## Arms

| Arm | Sources |
| --- | --- |
| F | FFDetr alone, on each raster variant (`clean300`, `clean200`, `phone`, `native`) |
| BF | raster ink (FORM-32 arm B) plus FFDetr as a `FieldSource` appended last |
| AF | production vector sources plus FFDetr on the `clean300` render: does it add to today? |

Kinds map `text input` to `text`, `choice button` to `checkbox`, `signature` to `signature`. F is
also swept over score thresholds 0.3 / 0.5 / 0.7.

## Contract between the two pieces

Scratch dir outside the repo; nothing is added to `package.json` and nothing reaches the tools.

- `ffdetr/model.onnx` (fp32) and, if it holds parity, `ffdetr/model.int8.onnx`.
- `ffdetr/meta.json`: `{rfdetrSize, params, inputSize, mean, std, classes, outputs, boxFormat,
  scoreActivation, numQueries, fileBytes}` with `classes` in the model's own index order and
  `outputs` naming each output tensor with its shape.
- `ffdetr/reference/<row>-<variant>.json`: the PyTorch model's own detections on two rasters
  (`practice-form-page1-clean300`, `health-page1-clean300`) as `{boxes: [{cls, score, left, top,
  width, height}]}` in percent of the image, scores above 0.3. The Node side must reproduce them.

Pieces: the Python export lives in the scratch dir (a throwaway venv); `scripts/spike/form-33/scoreFfdetr.mjs`
runs the ONNX model with onnxruntime-node from a throwaway npm project, scores every arm with the
corpus matcher, and reports per-page inference time.

## Acceptance

- [x] ONNX export with parity against PyTorch on the two reference rasters; size fp32 and int8. (fp32 holds parity exactly; dynamic int8 loses 2 of 109 and is not used.)
- [x] All arms scored on all rows and variants, one table, read against FORM-32's.
- [x] A record under `docs/` with GO / NO-GO / REWORK for FFDetr as a Sign `FieldSource`, and the
  phone-side cost it would carry.
- [x] No dependency, asset or product code change.

## 2026-10-08 Opt-in loading on the device

Shlomi asked about sending a scan to a hosted model (Hugging Face) with the person's permission.
That breaks the first invariant (no file bytes leave the device), so the on-device form of the same
idea is recorded instead. If it earns its place, the model loads only when the person agrees, on a page that has no text layer
and no vector ink (a scan or photo). That turns the download from a cost every visitor pays into a
one-time, opt-in one, cached for offline use after. It does not change the accuracy question this
spike answers. What it leaves open: phone inference time and memory at 1024px, hosting a 33-116MB
file same-origin (Vercel file-size and bandwidth limits), and the prompt's copy (an offer, never a
claim about what the form needs).

## 2026-10-08 result: NO-GO for scans, REWORK for digital forms

Record: [docs/form-33-ffdetr-spike.md](../../docs/form-33-ffdetr-spike.md). On the real 1970 scan it
finds nothing at 0.5, and alone on rendered pages it trails raster ink plus Tesseract words on
precision (43.5 / 52.9 against 39.0 / 79.4). Added to today's vector detector it lifts the 9 flat rows
from 85.0 / 80.6 to 93.4 / 80.2, but 41 of the 50 extra matches are `btl-p7`, `hmrc-sa100` precision
falls to 55.6%, CommonForms may contain corpus forms, and the model is 116MB gzipped. A decision needs a
held-out corpus and a phone measurement; neither is opened here until Shlomi decides it is worth it.
