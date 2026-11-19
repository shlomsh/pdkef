---
id: "RED-75"
title: "Delete's page previews free their pdf.js documents"
status: "open"
priority: "P3"
epic: "redact"
horizon: "later"
depends_on: []
---

# RED-75 · Delete's page previews free their pdf.js documents

*Filed 2026-11-19 from LAND-04.* `destroyPreview` in `src/tools/redact/hooks/useDeletePreviews.ts`
calls `destroy` on each preview's `PDFDocumentProxy` when it has one. In pdfjs-dist 6.5.438 the proxy
has no `destroy` (the loading task does), so the call never happens and each rebuilt preview keeps
its pdf.js document until the page is closed. The unit tests still pass because they use a fake
pdf.js whose proxy has `destroy`.

## Outcome

- Each preview document is freed through the handle that owns it in the pdf.js version we ship.
- A test on real pdf.js (legacy build in Node) shows a dropped preview is released.
