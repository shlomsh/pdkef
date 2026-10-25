---
id: "GRID-06"
title: "PDF to Image shows its pages through the shared page grid"
status: "done"
priority: "P2"
epic: "polish"
depends_on: ["GRID-04"]
---

# GRID-06 · PDF to Image on the shared page grid

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md), decision 4. Its `PageToggleTile`
grid moves onto `PageGrid` with drag off; `PageToggleTile` is deleted once GRID-05 and this have
landed. Extend the parity guard with `/pdf-to-image/`.

## Outcome (2026-10-25)

Done. PDF to Image composes the same pieces as Split, without drag, and gains rotate (each image renders
at its page's rotation) and Undo/Redo. Several images are parts with object URLs; saving one page's
image is a fourth action in the cluster, counted as a Download without marking the whole output saved;
over 30 pages it builds on a tap. A password-locked file shows NeedsUnlock; an owner-restricted one still
converts. Format, quality and output survive Replace file. One shared OptionRow serves Split's mode and
PDF to Image's three rows; PageRangeField is shared; PageToggleTile is gone. Parity guard covers
/pdf-to-image/, and a new guard keeps an edge page's actions on a 375px screen in every grid tool and in
RTL (they ran 28px off). A 17-path production matrix passed (one-per-page, per-page save, JPG with skips,
rotation dimensions, tall image, 35 pages on a tap, protected files, phone, Hebrew). A fresh review's
findings were fixed: images shared as PDFs, Enter on a cluster control opening the preview, Download
taking focus mid-typing, a pending tap stalling over 30 pages, and FAQ and how-to copy (with the Hebrew
twins) still describing click-to-leave-out and Apply Changes.

Not changed: in tall-image output the grid looks the same as one-per-page (only the heading
changes). The number under a page stays its output position, a running index in the new file (Shlomi,
2026-10-25), while a per-page file keeps its source page number in its name.
