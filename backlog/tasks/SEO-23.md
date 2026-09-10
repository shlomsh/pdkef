---
id: "SEO-23"
title: "New tool: convert a PDF to grayscale, with the cost stated"
status: "open"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-06"]
legacy_state: "Open"
---

# SEO-23 · New tool: convert a PDF to grayscale, with the cost stated

## Scope and acceptance

**`grayscale pdf online` and `convert pdf to black and white` are 30k-80k a month**, won by supertool
and Cloudinary. The intent is ordinary and sympathetic: save colour ink, or meet a monochrome archiving
or printing requirement.

**The implementation is straightforward and the honest version of it is lossy.** Render each page with
pdf.js, apply the standard luminance transform to the canvas pixels, re-embed. Which means the same
trade-off `/compress/` has: the output is images, so text stops being selectable, searchable and
screen-reader accessible. There is a genuinely lossless route - rewriting colour operators in the content
stream - and it is a much larger, more fragile piece of work that will not survive contact with real
files. Choose the rasterizing version, and say what it costs.

The `compressPdf()` rasterize-and-embed loop in `src/lib/compress.js` is the shape to follow, so the two
should share whatever is genuinely common rather than growing a second copy of the page loop.

**Two decisions to make explicitly.** Whether "grayscale" and "black and white" are the same tool - they
are two different requests, since the second often means 1-bit threshold rather than grey, and a printer
requirement usually means the first. And whether this belongs beside `/compress/` in the UI, since
grayscaling also shrinks a file substantially and a visitor may have arrived wanting that.

**Acceptance.**

- Real `src/lib/` logic with no network calls, sharing the rasterize-and-embed path with
  `src/lib/compress.js` rather than duplicating it.
- The page states, above the FAQ, that the output is images and what that costs - the same standard
  SEO-05 sets for `/compress/`.
- The grayscale-versus-1-bit distinction is settled and the page says which it does.
- Registered in `src/data/tools.js`; How it works and FAQ with matching `<SeoSchema>`; no `noindex`;
  `npm run build && npm run preview` CSP pass.
- Ships alone in its week.
