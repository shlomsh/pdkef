---
id: "HERO-07"
title: "An output at the centre for the tools that show none: PDF to Image, Compress Image, Unlock and Protect, Image to PDF"
status: "done"
priority: "P1"
epic: "tool-pages"
depends_on: ["HERO-06"]
---

# HERO-07 · An output at the centre for the tools that show none

*Filed 2026-10-15.* The cross-tool review measured 0% of the first viewport as output on PDF to Image,
Compress Image and Unlock/Protect, and about 14% (40x52 thumbnails in rows) on Image to PDF; PDF to
Image's card is 45% blank below a full-width "Convert to PNG". §18 says the result is the centre and
work starts on pick where a default exists.

The reviewer's pushback is part of the scope: Unlock and Protect keep an explicit primary (a password is
typed), and their card shrinks to fit rather than stretching; Edit Pages keeps its primary until an edit
exists, but pinned on a phone with an honest count. Each tool is designed one at a time against §18 and
measured at 1440x900 and 375x812 before it lands.

## Acceptance

- [x] PDF to Image: every page is a tile in the result column (select one to leave it out, magnifier
  preview), the images build on quiet with no Convert button, segmented Format / Quality / Output; a
  single page shows one larger tile with no page picker; on a phone the pages come before the options.
  Landed 2026-10-17 (d765926e).
- [x] Image to PDF: the images are page tiles in order (drag, arrow keys, remove, an Add tile, an Order
  menu shared with Merge as `src/shell/SortMenu.tsx`), the PDF builds on quiet, rename in place, Download
  pinned on a phone. Landed 2026-10-17.
- [x] Unlock / Protect: page 1 is the centre with its state tag (Locked, Restricted, Unlocked, Not
  protected, Protected), the password and its explicit primary in the rail. Landed 2026-10-17.
- [x] Compress Image: already met by HERO-06's Compress rebuild (the before/after slider is the centre).
- [x] Split and PDF to Image share `src/shell/PageToggleTile.tsx`, so the keyboard reaches the magnifier.
- [x] Edit Pages keeps its primary until an edit exists, pinned on a phone (sticky sheet below 1024px) with
  an honest page count ("Apply Changes · 6 pages"). Landed 2026-10-17.
