---
id: "DEBT-49"
title: "Redact: a page whose content stream will not decode is skipped quietly, not reported"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-49 · Redact: a page whose content stream will not decode is skipped quietly, not reported

*Filed 2026-10-14 from the daily error read.* One report on 2026-10-13 (chromium-155, build c89b34b,
step `list_objects`): `Invalid header in flate stream`, thrown by pdf-lib's `FlateStream` from
`decodePDFRawStream` in `getPageContentBytes` (`src/editor/adapters/pdf/pdfObjects.js:210`), reached from
the per-page loop in `listDeletableObjects` (`deleteObjects.js:650`). The registry's ENC-02 entry matched
it (any pdf-lib error at `list_objects`), so it read as a regression of a different defect. The cause is a
damaged content stream in the person's file, which the tools-and-shell rule says falls back quietly.

## Acceptance

- A page whose content stream fails to decode is skipped in the object listing without `reportError`
  (with an `// expected:` comment); other errors on that loop are still reported.
- A unit test with a page carrying a corrupt Flate stream shows the other pages still list.
- `npm run test:swallowed-errors` stays green.

## Outcome
Shipped with the fix; the daily read confirms no new report from a build containing it.
