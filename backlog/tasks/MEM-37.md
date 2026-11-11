---
id: "MEM-37"
title: "Chunks are bundled by tool: tiny chunks merged, editor core on its own, PDF engines lazy"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-37 · Chunks are bundled by tool: tiny chunks merged, editor core on its own, PDF engines lazy

*Filed 2026-11-11*, step 4 of [docs/request-budget.md](../../docs/request-budget.md) (D3, D4).

## Why

The build emits 125 `/shared/` chunks, 66 under 2 KB; `/redact/` loads 60 JS files.

## What

In order, each measured: re-key `check-lazy-modules.js` to group names; merge tiny chunks without crossing
a lazy boundary; give `editor-core` its own group; tool groups only where the count drops. pdf-lib and
pdf.js stay their own lazy files. Names stay stable (`/shared/<group>.js`).

## Found 2026-11-11 (first attempt, nothing landed)

Rolldown 1.2.16 / Vite 8.3.6 take `output.codeSplitting.groups` (`advancedChunks` is deprecated, and
`manualChunks` is ignored once groups are set). A group per set of entries that reach a module, tagged
`$initial` so lazy code never joins an eager group, brought eager JS per page from 32-55 files to 14-22
(`/redact/` 53 to 17-21) and the build's `/shared/` + `/site/` from 145 to about 81. `test:lazy-modules`,
`test:weight` and `test:precache-budget` passed; Sign and Redact page-load bytes grew about 45%.

It cannot land as is: any group holding a CSS Modules component loses that CSS in Astro's build. Astro
drops a client chunk's stylesheet when the chunk holds a hydrated island and its CSS modules were bundled in
the server pass (MEM-26 pairing), so on `/`, `/he/`, Sign, Redact and Highlight the Drive panel's classes
render with no rule, and group stylesheets are linked from no page. Keeping CSS-bearing modules out of the
groups left about 26 files on `/merge/`. Grouping also widens closures through dead lazy references, which
`test:stable-names` flags. `/site/` keeps 24-28 entry stubs whatever the grouping. Configs and measurement
scripts from the attempt: `astro.try5.mjs` / `astro.try6.mjs` (kept outside the repo in
`~/work/pdkef-wt/mem37-attempt/`).

## Done when

- [ ] `test:lazy-modules` and `test:weight` green; JS requests on `/redact/` and `/sign/` measured before
      and after.
- [ ] No more than 15 bundles in all; MEM-33's budgets lowered.
