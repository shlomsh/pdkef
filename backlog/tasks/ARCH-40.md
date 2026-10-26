---
id: "ARCH-40"
title: "Small seams from the October review"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 1
depends_on: []
---

# ARCH-40 · Small seams from the October review

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 7).

## Why

Small, independent leftovers, each a few lines, listed in the record's section 7.

## Outcome

- `flattenPdf` and `rasterizeAllPages` (`flatten.js`) and their tests are removed, unless a caller is
  planned.
- `toolPage.css:71` and `sitemap.xml.js:138` stop naming the deleted `[locale]/[tool].astro`.
- The comment at `split.js:12-14` describes the names the tools actually write.
- Merge uses `lib/pageOrder.js`'s `moveEntry` and sort chain (`PdfMergeTool.tsx:742-785`), and the
  second `moveEntry` in `pagePlan.ts` is merged or renamed.
- Scan and Image to PDF share the photo tile list (Sortable config, focus, accepted types, tile CSS);
  `.loaded-layout` and `.result` are declared once.
- Raw colour literals (`#8a221c`, `#6b1813`) become tokens; the ad-hoc breakpoints collapse onto the
  declared ones.

## Acceptance

- [ ] Each item above is done or struck with a reason in this ticket.
- [ ] `check:push` green; `test:css` ratchets unchanged or lower.

## Result

1. Done. `flattenPdf` and `rasterizeAllPages` removed from `flatten.js` (its pdfjs and raster imports with them). The file stays: `flattenDoc`, `appearanceToRectMatrix` and `FormFlattenError` are used by Sign. The tests keep their keep-text cases through a small local helper over `flattenDoc`; the image-mode and unknown-mode cases went.
2. Done. `toolPage.css` now sources `../pages/[locale]/*.astro`; the sitemap's lastmod input is `src/pages/[locale]/<toolSlug>.astro`.
3. Done. The `split.js` comment now says Merge, Sign and Redact use the prefix shape, and Compress suffixes (`x-compressed.<ext>`).
4. Done. Merge uses `pageOrder.js`'s `moveEntry` and `sortEntries` (Merge keeps only its own `reversed` and `added`). pageOrder already had every case Merge relied on, so no new test was needed. `pagePlan.ts`'s index move is renamed `movePlanEntry`, with its callers and tests.
5. Partly done. New `src/lib/usePhotoTileList.ts` holds the Sortable config, the focus restore after a keyboard move or removal, and the accepted photo types; Scan and Image to PDF both use it (island change is the swap only). Struck: shared tile CSS and the single `.loaded-layout` / `.result`. The two tools' tile CSS is not the same (Scan is a horizontal strip with a radial remove disc, Image to PDF an auto-fill grid with a pseudo-element disc), and Scan has no `.loaded-layout`. The three modules that declare `.loaded-layout` and `.result` are Compress, Image to PDF and Security, and their grid areas, `.result` alignment and extras differ; one shared declaration needs a design pass, not a move.
6. Colours done: `--color-danger-ink` (`#8a221c`) and `--color-danger-ink-strong` (`#6b1813`) in `global.css`, used by `PdfTool.module.css`. Breakpoints struck, listed in the report: the only values within 1px of a declared one (767.84, 767.98, 1023.98) are fractional complements of 768 and 1024, and moving them to 767 or 1023 opens a gap at fractional viewport widths.
