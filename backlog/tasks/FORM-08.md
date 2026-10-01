---
id: "FORM-08"
title: "Re-evaluate pdf-inspector: the MIT crate grew the positioned API the wasm build still hides"
status: "open"
priority: "P3"
epic: "form-detection"
horizon: "later"
depends_on: []
---

# FORM-08 · Re-evaluate `pdf-inspector`: the MIT crate grew the positioned API the wasm build still hides

## Why

MOBI-10 ruled `@firecrawl/anydoc-wasm` / `pdf-inspector` out of this problem entirely: for PDF
input the wasm had one output mode, Markdown, and none of its types carried a rect, a bounding box
or a page index. That finding is **still true of anything installable today** (2026-09-20 research
verified the published `wasm/src/lib.rs`: the whole export surface is `processPdf`, `detectPdf`,
`classifyPdf`, `extractText`, `version`, and `extract_text` computes positions internally and then
discards them).

What changed is underneath. The Rust crate is MIT and now exposes a full positioned API:
`TextItem` with `x, y, width, height, rotation, font` and an `item_type` enum whose variants
include **`FormField`**; `PdfRect` built CTM-aware from `re` operators; `PdfLine` from `m`/`l`/`S`;
`extract_tables_with_structure_cells_mem`; and `detect_vector_grid_in_region_mem`, which returns
per-cell bounding boxes. A fork of their wasm bindings exposing those is reportedly small.

So the question MOBI-10 answered "no" to is worth asking once more, with a clear bar.

## Scope and acceptance

This is an evaluation with a high bar to clear, not an adoption.

- [ ] The bar: **beat the current detector on the existing corpus**, scored with `score.mjs` at
  IoU >= 0.5 against the same ground truth. Our own walk is at 82.0 / 92.7 on form 101 and
  86.7 / 94.2 on the health form, with comb and checkbox at 100% precision. Parity is not a
  reason to take on a Rust toolchain, a wasm build step and a fork we would have to maintain.
- [ ] Verify the licence of what would actually ship, code and any data, against the runtime
  allowlist, and confirm `npm run test:licenses` and `test:dependency-governance` would pass.
- [ ] Check the wasm's size against the page-weight budgets, and that it is same-origin and lazily
  loaded like every other asset.
- [ ] Pin `pdf-inspector` >= 1.16.0 if it is used at all: the RTL character-reversal fix for
  Hebrew and Arabic landed there, and the published anydoc package still pins 1.14.2
  (firecrawl/anydoc#175, our own bump, open and unmerged as of 2026-09-20).
- [ ] Their own OCR path is native-only PP-OCRv6 and is explicitly not in the wasm build, and
  PP-OCRv6 has no Hebrew. It offers this epic nothing for FORM-06 or FORM-07; do not confuse the
  two capabilities.

**The narrower, cheaper half of this ticket is FORM-05**, which takes one specific idea from that
codebase (harvesting clip-path rectangles) without taking the dependency. Do FORM-05 first.

## 2026-10-01 research

Read-only research, nothing downloaded; full evidence in `docs/form-08-pdf-inspector-evaluation.md`.
**Recommendation: NO-GO**, pending the owner's read, so the ticket is back to open and not done.

- `@firecrawl/anydoc-wasm` is still 0.2.4 on `pdf-inspector` 1.14.2; firecrawl/anydoc#175 (our bump)
  and #170 are both still open. The crate is at 1.25.2 (MIT). A separate
  `@firecrawl/pdf-inspector-wasm` 1.25.2 exists and carries the RTL fixes, but its export surface
  (`processPdf`, `detectPdf`, `classifyPdf`, `extractText`, `version`) returns Markdown and
  metadata with no position, rect or page-indexed item, same as anydoc.
- The crate's `FormField` is an AcroForm reader (`/V`, widget `/Rect`), which `formWidgets.js`
  already does and flat forms do not have. `PdfRect`/`PdfLine` look internal; pdf.js text runs and
  `pageInk.js` already cover positions and ink. FORM-05 measured the clip-rect idea as not worth it.
- Wasm is about 6.0 MB raw (no compressed figure), would need `'wasm-unsafe-eval'` in our CSP, a
  precache exclusion and hand-kept third-party notices (Adobe CMaps); the 400 KB first-load budget
  would not be touched if lazy.
- Remaining corpus misses are cell-closing and classification heuristics and one scan; none is a
  text-extraction gap.
- Not verified: npm pages (403), per-crate licences, compressed size, whether the crate walks Form
  XObjects, any detection score (no experiment was run).
- Revisit trigger: upstream wasm ships rects or lines AND a zero-download probe shows a scored form
  whose cells live in Form XObjects `pageInk.js` skips. That probe is the only cheap next step and
  the fix would be in our own code.
