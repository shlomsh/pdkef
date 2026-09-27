---
id: "RED-06"
title: "PDFium loads on export only, in a worker, cached offline, inside the weight budgets"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-06 · PDFium loads on export only, in a worker, cached offline, inside the weight budgets

*Filed 2026-09-27 from RED-01's record, [docs/redact-content-removal.md](../../docs/redact-content-removal.md).*

The 7.3 MB WebAssembly (2.8 MB compressed) must never load with the Redact or Sign page.

- Load it in a worker the first time someone exports, same-origin, never from a CDN.
- Cache it for offline use after that first export (service worker rules in csp-scripts-pwa).
- `test:weight` and `test:lazy-modules` prove no page carries it up front.
- Pin `@embedpdf/pdfium` to an exact version; `test:licenses` covers MIT and Apache-2.0.

## Acceptance

- Opening Redact or Sign downloads no PDFium bytes; the first export does, and a second export
  offline works.
