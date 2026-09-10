---
id: "SEO-22"
title: "New tool: extract the images embedded in a PDF, without a zip dependency"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-06"]
legacy_state: "Open"
---

# SEO-22 · New tool: extract the images embedded in a PDF, without a zip dependency

## Scope and acceptance

**`extract images from pdf` is 40k-100k a month against small utility sites.** It is a genuinely
different operation from `/pdf-to-image/`, which renders each page to a picture; this pulls out the
photographs and graphics that were embedded in the file, at their original resolution.

**The zip question is already decided.** `PdfToImageTool.tsx:125` records the reasoning: no zip
dependency, sequential downloads instead, to keep the permissive-licence inventory and the zero-network
constraint simple. Follow that precedent. If a zip turns out to be genuinely necessary - twenty images is
a lot of sequential downloads and browsers throttle them - then it is a deliberate reversal of an
existing decision and must be argued as one, with the licence check (`npm run test:licenses`), the
`optimizeDeps.include` entry for an island-only import, and the page-weight cost all accounted for.

**The honest limits, which decide whether this page is worth publishing at all.** What is embedded in a
PDF is frequently not what a reader sees:

- A single visible photograph is often stored as many tiles, and extraction returns the tiles.
- Images carry soft masks stored as separate objects; extracting the base without the mask returns
  something that looks wrong.
- CMYK, JBIG2, JPX and 1-bit images decode inconsistently in the browser, and some will fail.
- A "scanned document" is one full-page image per page, which is what the user wanted from
  `/pdf-to-image/` and got here instead.

Establish the actual hit rate against a corpus of real PDFs before writing any copy. If the tool returns
something confusing more often than not, the honest outcome is to narrow it - offer only what decodes
cleanly and say so - or to not ship it. That judgement belongs in this ticket, made from measurements.

`src/editor/adapters/pdf/pdfObjects.js` already parses `/Name Do` image placements for the Delete tool,
so the file-structure work is partly done; the decoding is the new part, and pdf.js's page objects are
the route.

**Acceptance.**

- Measured on a corpus of at least ten real-world PDFs (scans, brochures, exports from Word and from
  InDesign): how many images were found, how many decoded, how many were tiles or masks rather than the
  visible picture. Recorded here.
- The page states the limits above in plain words, and points a "my PDF is a scan" visitor at
  `/pdf-to-image/`.
- Real `src/lib/` logic, no network, no zip dependency unless the reversal above is argued and accepted.
- Registered in `src/data/tools.js`; How it works and FAQ with matching `<SeoSchema>`; no `noindex`;
  `npm run build && npm run preview` CSP pass.
