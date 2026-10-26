---
id: "ARCH-40"
title: "Small seams from the October review"
status: "open"
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
