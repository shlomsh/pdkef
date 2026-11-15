---
id: "DEBT-76"
title: "A tool's icons ride in its own bundle, so /open/ does not carry every tool's lucide icons"
status: "done"
priority: "P2"
epic: "robustness"
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

## Outcome

Done 2026-11-16. The cause was the barrel itself: every island imported `lucide-preact`, whose `icons` namespace
imports all of its roughly 2,000 icon files, so the split rules saw every icon as reached by every entry and put each used icon in
`ui`. `scripts/lucideDeepImports.mjs`, a build-only Vite plugin, rewrites each named import from the barrel into a
default import of that icon's own file (`createLucideIcon` and `Icon` too, since one importer left on the barrel
undoes it). The module graph then shows who uses which icon, and the existing `clientCodeSplitting` rules place it
with no new group. I chose this over per-tool local icon modules without building that alternative to measure it: no hand-copied paths, one way to add an icon (import it
from `lucide-preact`), and it fixed every tool at once. Scan's `scanIcons.tsx` copies are gone.

`ui` now holds only the six icons shared code imports (the tool launcher in `src/data/tools.js` and the finish
row). Measured against an origin/main build (8fb4c3490), brotli bytes: /open/ 46,499 to 43,540; / 111,767 to
109,604; /sign/ 1,416,670 to 1,415,207; /scan-to-pdf/ 864,072 to 859,588; every tool page lighter, worst
`test:weight` /he/sign/ 263,733 to 262,278. /about/ moved +2 (no island, build noise). Budget unchanged.

`test:precache-budget` now fails when `ui.js` carries an icon that only one tool imports (`scripts/uiIcons.mjs`),
which is the build check that adding an icon to one tool leaves /open/ alone; and when a page that loads `ui.js`
is over budget it lists every icon in `ui` with the files importing it. It also refuses a `lucide-preact` import the plugin cannot rewrite (`import * as`, a re-export, `import()`), since one
such import would pull every icon back into `ui` with no importer to name. Both checks were seen red on a build with the
plugin taken out (29 single-tool icons named, 56 listed). The CI half of the first acceptance line is met when this lands.
