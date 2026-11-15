---
id: "DEBT-76"
title: "A tool's icons ride in its own bundle, so /open/ does not carry every tool's lucide icons"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-76 · A tool's icons ride in its own bundle, not in the `ui` chunk /open/ preloads

*Filed 2026-11-15, from landing SCAN-75.* Every island imports its icons through the `lucide-preact` barrel
(v1.67.0 exports only `.`, no per-icon entry points). Because many islands reach that barrel,
`clientCodeSplitting` in `astro.config.mjs` puts every icon any tool uses into the shared `ui` chunk, and
/open/ preloads that chunk. So one new icon in any tool grows /open/'s precache.

SCAN-75 added four Scan-only icons (Undo2, Redo2, Spline, VectorSquare) and took /open/ from 46505 to 46717
brotli bytes, over its 46500 budget. To land, Scan drew its own copies in `src/tools/scan/components/scanIcons.tsx`.
That fixes one tool, not the cause, and /open/ still has almost no headroom: main measured 46505 locally on
2026-11-15, 5 bytes over the budget on this machine.

## What to build

1. **Icons a single tool uses leave the `ui` chunk.** Either a split rule in `clientCodeSplitting` that keeps
   an icon in the bundle of the one island using it, or one small local icon module per tool, in the shape of
   `scanIcons.tsx`. The lead picks one after measuring both on /open/ and on two tool pages.
2. **Scan's local copies fold into whichever shape wins**, so there is one way to add an icon.
3. **A guard names the cause next time.** When `test:precache-budget` fails on /open/, its message lists the
   icons in `ui` and which islands use each one.

## Acceptance

- /open/ is under its 46500 budget with room to spare, measured by `test:precache-budget` locally and on CI.
- Adding an icon to one tool's island leaves /open/'s precache bytes unchanged (a unit or build check proves it).
- No tool page gets heavier than it is today (`test:weight`).
- The budget is not raised.
