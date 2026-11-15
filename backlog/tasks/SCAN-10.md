---
id: "SCAN-10"
title: "Scan next: evaluate a small learned page detector behind the same contract"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
depends_on: ["SCAN-05"]
---

# SCAN-10 · A learned detector, evaluated, not adopted blind

*Opened 2026-11-03* from the detection research for [docs/scan-next.md](../../docs/scan-next.md). Read by a
research agent on 2026-11-03 and not yet checked by hand.

## Parked, 2026-11-15

Parked by Shlomi the same day it started: a trained model is more than Scan's traffic justifies today. Reopen
when a real need shows (Scan's use, or people's corner fixes on open books). What the day found, so the next
start begins here:

- **No ready-made model passes.** About 8 candidates read (model cards, licences): none has a permissive licence
  for code, weights and training data together, and none names open books in its training. `scanic-ml` 0.2.0:
  MIT code, no weights licence, trained on DocCornerDataset, which mixes research-only sets (MIDV, SmartDoc):
  https://huggingface.co/datasets/mapo80/DocCornerDataset. DocAligner (DocsaidLab): Apache-2.0 code, weights and
  data unaddressed. So the route to a shippable model is our own, trained on generated images and consented
  photos (the private book benchmark stays a test set only). `scanic-ml`'s architecture (DocCornerNet) is MIT and
  about 1.9 MB; its weights were never downloaded or scored.
- **No CSP change is needed.** The page policy blocks WebAssembly compilation (no `'wasm-unsafe-eval'` in
  `astro.config.mjs`), but a same-origin module Worker gets no CSP header, as pdf.js's wasm does and as SCAN-19
  measured for ONNX Runtime Web (wasm-only entry, about 2.3 MB brotli). Not from a `blob:` worker.
- **A scoring harness** (onnxruntime-node, any model behind one adapter, the repo's `kpi.ts`, today's finders
  beside it) was built in a scratchpad and not kept; rebuilding it is an hour.

## Why it started, 2026-11-15

Classical rules ran out on open books: the camera shows no outline on 12 of 22 book photos, and no side rule
fixes it (measured in [SCAN-71](SCAN-71.md)). Started with Shlomi; the first gain sought is the starting corners on
a taken photo, where a few hundred milliseconds are fine, the live camera after. If no ready-made model passes the
licence check, the alternative is a small model trained here on generated images, so the weights are ours.

## The lead

`scanic-ml` 0.2.0 (npm, MIT per its manifest): a corner model of about 1.8 MB with a custom ONNX Runtime Web
build of about 1.5 MB, 224x224 input, a reported median corner error of about 1% of the frame on its author's
200-image test, about 13 ms single-threaded on a desktop (no phone numbers), and a "document present"
probability. Sources: https://cdn.jsdelivr.net/npm/scanic-ml@0.2.0/MODEL_CARD.md, https://github.com/marquaye/scanic.

## Open before anything is downloaded

- **Licence of the weights and the training data.** The model card names neither; the nearest public corner
  dataset is built partly from research-use-only sets. A free public tool cannot ship weights trained on them.
- **CSP.** ONNX Runtime Web needs WebAssembly compilation allowed in the policy, which touches the CSP
  invariant (`.claude/rules/csp-scripts-pwa.md`).
- **Weight.** About 3.4 MB loaded after Start scanning, against the precache budget.

## Outcome

Either a written no (licence, CSP or weight), or the model run on SCAN-05's corpus behind the `EdgeGuesser`
contract, on a phone, with its KPI table beside the classical detector's, and a decision: replace, tie-break,
or drop.

## Acceptance

- [ ] The licence question answered in writing, with sources, before any model file enters the repo.
- [ ] If it passes: the KPI table and phone timing are in this ticket with the decision.
