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
