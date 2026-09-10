---
id: "SEO-19"
title: "New tool: compress an image to a target size, because people are already asking us to"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-06", "SEO-13"]
legacy_state: "Open"
---

# SEO-19 · New tool: compress an image to a target size, because people are already asking us to

## Scope and acceptance

**This is the only new tool in the epic with measured demand behind it rather than an estimate.** In
three months, 128 impressions and 6 clicks came from queries with no "pdf" in them at all:
`file compressor to 100kb` (81 impressions, position 9.60, 3 clicks), `reduce file size to 100kb` (26 at
9.50), `compress file size to 100kb`, `100kb file compressor`, `image size reduce to 100kb`,
`100 kb document size`. They land on `/compress/`, which only accepts PDFs, and bounce.

The intent behind them is the same one behind the whole 100KB cluster and it is strongest in India:
application portals cap the photo, the signature and the document separately, often at 20-50KB for a
photo and 100-200KB for a document. Somebody with a form open needs all three, and we serve one.

**The implementation is small, and most of it exists.** `compressPdfToTarget()` in `src/lib/compress.js`
already does the hard part: a DPI ladder, a binary search on JPEG quality, a wall-clock budget, an honest
`metTarget: false`. For an image there is no PDF assembly and no page loop - decode to a canvas, search
scale and quality, encode. The search logic should be extracted and shared rather than copied, so the
two tools cannot drift on behaviour the FAQ describes for both.

**Constraints, all of them the usual ones.** No network. Canvas and `toBlob` only, no new dependency; if
one is genuinely needed it must clear the reviewed permissive allowlist, be added to
`optimizeDeps.include` in `astro.config.mjs` (an island-only import is invisible to Vite's startup crawl
and the cascade that follows is nasty and well documented in CLAUDE.md), and pass
`npm run test:licenses`.

**Two product questions to settle, not to assume.** Whether this is a separate route or a mode of
`/compress/` - separate is the recommendation, since the query set is distinct and a PDF tool that also
takes images is confusing, but argue it. And which formats: JPEG and PNG at minimum, with an honest note
about what re-encoding a PNG to JPEG does to transparency and to text screenshots.

**Acceptance.**

- Real `src/lib/` logic with no network calls, sharing the target-size search with `compressPdfToTarget`
  rather than duplicating it, with unit tests covering the already-under-target passthrough, the met
  target, and the honest miss.
- The component mirrors `PdfMergeTool.jsx`: real call, real download, no `setTimeout` mock. The
  live-`FileList` hazard applies - read `input.files` into an array before clearing `input.value`.
- Registered in `src/data/tools.js` so the sitemap picks it up automatically; visible How it works and
  FAQ on the page with a matching `<SeoSchema>` (FAQ schema only, never HowTo); no `noindex`.
- `/compress/` and the new tool link to each other on the PDF-versus-image distinction.
- `npm run build && npm run preview` verified for CSP and hydration before this is called done.
- Ships alone in its week, so its indexing can be attributed.
