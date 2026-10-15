---
id: "HERO-06"
title: "Every tool's loaded state: the compact file strip and a one-line phone hero"
status: "done"
priority: "P1"
epic: "tool-pages"
depends_on: []
---

# HERO-06 · Every tool's loaded state: the compact file strip and a one-line phone hero

*Filed 2026-10-15.* From the cross-tool review of the loaded state against
[docs/ux-design-guidelines.md](../../docs/ux-design-guidelines.md) §18 (screenshots in that session's
scratchpad). The shell's file banner was a fixed 168px band on desktop and 108px on a phone, the same in
Split, Edit Pages, Compress, PDF to Image, Image to PDF and Unlock/Protect. On a phone only Merge
condensed the hero to one line; every other tool kept the icon on its own row and the h1's second line
(166 to 202px).

## Acceptance

- [x] `ToolShell`'s non-editor banner is the §18 compact strip at every width: 40x52 thumbnail, name,
  meta line with a `metaExtra` slot, an optional two-line `note`, quiet Replace. Measured 86px at 1440
  and at 375 on Split, Edit Pages and PDF to Image. Sign and Redact's editor header unchanged.
- [x] Edit Pages shows a real thumbnail.
- [x] With a file loaded, the hero is one line (tile beside the name, `[data-hero-rest]` and the subhead
  hidden) at every width in every tool but Sign and Redact, from first paint through a restore or hand-off
  (Edit Pages at 375: 58px, was about 166px). Sign and Redact moved to HERO-08.
- [x] Compress moves from its own `CompressStrip` to the shell strip.
- [x] Split gets Merge's page magnifier (shared `src/shell/PagePreviewDialog.tsx`) and rename in place
  (shared `src/shell/OutputName.tsx`); Split, Merge and Compress prepare on quiet (`src/lib/quietPrepare.ts`,
  UX guidelines §2).
