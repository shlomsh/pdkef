---
id: "MEM-25"
title: "A change to one shared module renames its own chunk, not every page and every importer"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# MEM-25 · A change to one shared module renames its own chunk, not every page and every importer

*Filed 2026-10-28* from MEM-21's first nightly reading (run 40662513043), reproduced locally by building
both deploys.

## Why

The deploy from de9b06dc to 5522bb04 changed two source modules (`src/lib/telemetry/maintenanceEventSchema.ts`
and `src/site-lib/appUpdate.ts`, MEM-24). A returning client's update cost 1,934,762 bytes brotli (q5,
1,934,844 in CI) against MEM-21's 500,000 target:

| Part | Bytes | Share |
| --- | --- | --- |
| 54 HTML pages | 1,473,268 | 76% |
| 11 chunks renamed with no content change | 349,292 | 18% |
| 7 chunks whose content changed | 99,601 | 5% |
| 2 new chunks, `sw.js`, the manifest | 12,601 | 1% |

- **Pages.** Every page references the two BaseLayout script chunks by hashed name, and island pages name
  their island chunk in `component-url`. After normalizing hashed `/_astro/` names and the build stamp,
  none of the 54 pages differs (rebuilt at one path: 1,934,774 bytes, the same 54 pages). One edit to a
  script every page loads rewrites all of them. (An island's `uid` hashes its absolute source path, not
  its URL; that only matters when two builds run at different paths, see MEM-21.)
- **Importers.** The 11 renamed-only chunks (`sign.*.js` 301,114, `PdfMergeTool` 15,842, `PdfToImageTool`
  5,415, `PdfSecurityTool` 5,460, `PdfSplitTool` 5,098 and six smaller) are byte-identical after normalizing
  hashed names: they import a changed chunk (`openPdfDoc`, `maintenanceTelemetry`) by its hashed file name,
  so its rename renames them.
- The real content change, the 7 changed chunks plus 2 new ones, was about 101 KB.

## Outcome

- A change confined to one shared module costs that module's chunk plus what really changed, not every
  page and not every importer: pages and importers reach shared chunks through a reference that does not
  change when the chunk's hash does (for example, a stable-named bootstrap or an import map that the
  worker and the manifest already account for).
- Content-hashed caching stays immutable, and MEM-22's hash check still covers every file a page loads.

## Design (2026-10-28)

From two measured prototypes (a one-line change to `maintenanceTelemetry.ts`, both builds at one path):

- **Entries at stable URLs.** Every client entry chunk (the BaseLayout scripts and each island) is emitted
  as `/site/<name>.js`, so no page names a hashed file. Alone: 1,933,331 to 472,333 bytes, 1 page changed
  (`/about/`, its build stamp).
- **Hot shared chunks at stable URLs.** `maintenanceTelemetry` and `openPdfDoc` are emitted as
  `/shared/<name>.js`, so their importers keep their names. Alone: 1,933,520 to 24,293 bytes, 0 renamed
  chunks.
- Both folders sit outside `/_astro/`, which the worker treats as immutable; files there are fetched fresh
  at install and checked against the manifest's hashes (MEM-22), and revalidate on an ordinary visit.
- The names live in `scripts/stableNames.mjs`, read by `astro.config.mjs` and by the guards. A dist guard
  (`test:stable-names`) fails if a page names a hashed script or island, or if a listed hot chunk is not
  emitted under `/shared/`. The closure walker, the precache budget and the page-weight guard follow
  `/site/` and `/shared/` as they follow `/_astro/`.
- Rejected: an import map (Rolldown's `experimental.chunkImportMap`) needs an inline map with a CSP hash in
  every page, so any rename still changes every page.

## Acceptance

- [x] Replaying de9b06dc to 5522bb04 with the change applied to both builds costs under 500,000 bytes, and
      the ticket records the new breakdown.
- [x] A test pins it: a fixture build where one shared module changes renames that module's chunk and no
      page and no importer. (Pinned as `test:stable-names` on every CI build plus the nightly update-cost
      reading of two real deploys; see Done.)

## Done (2026-10-28)

- **Replay** of de9b06dc to 5522bb04 with the naming applied to both, built at one path: 1,934,844 to
  **119,853 bytes** brotli (q5). Breakdown: `/site/PdfSignTool.js` 43,350, `/site/PdfRedactTool.js` 36,354,
  `/site/PdfCompressTool.js` 14,815 (their content changed), `/about/` 11,969 (build stamp), `sw.js` 5,530
  and the manifest 4,922 (always), `/shared/openPdfDoc.js` 1,091, `/shared/maintenanceTelemetry.js` 1,000,
  one new hashed chunk (`maintenanceEventSchema`, 822). 1 page changed, 0 chunks renamed without a content
  change.
- **One-line change** to `maintenanceTelemetry.ts` (experiment E): 1,933,331 to **24,436 bytes**; the
  changed files are `/about/` and `/shared/maintenanceTelemetry.js`, 98 chunk names unchanged.
- **Build:** `scripts/stableNames.mjs` names client entries `/site/<name>.js` (dots become `_`, so a stable
  name has no inner dot) and `maintenanceTelemetry`/`openPdfDoc` `/shared/<name>.js`, through
  `vite.environments.client` only; pdf-lib and pdf.js keep their hashed names (DEBT-20).
  `buildPipelineFiles` follows `astro.config.mjs`'s relative imports, so editing the names runs the build.
- **Guards:** `test:stable-names` (in `DIST_GUARD_STEPS` and `ci.yml`) fails on a hashed `/_astro/` script,
  `component-url` or `renderer-url` in a page, a hot chunk missing from `dist/shared/`, or any inner dot in
  `dist/site/` or `dist/shared/`. The closure walker (`../` specifiers), the precache budget (island and
  orphan scan) and the page-weight guard follow `/site/` and `/shared/`. All eight dist guards pass.
- **Smoke:** a production build in Chromium hydrates `/`, `/merge/`, `/sign/` and `/compress/`; the worker
  caches all 17 `/site/` and 2 `/shared/` files, and `/sign/` and `/split/` hydrate offline.
- The deploy that ships this renames every entry once, so that night's update-cost reading is high; the
  next ordinary deploy is the first reading of the new shape. A shared module not in `HOT_SHARED_CHUNKS`
  still renames its importers; the nightly reading names it in its top contributors.
- **Review** (fresh reviewer): error telemetry matched only `/_astro/` frames and `errors:resolve` read only
  `dist/_astro`, so an error in an island entry sent no frame. Frames now read `site/X.js:L:C` or
  `shared/X.js:L:C` (bare names for `/_astro/`, so older reports still parse). A stable name exists in
  every build, so `errors:resolve` needs `--build` for a report whose frames are all stable; reports carry
  it (`site/PdfMergeTool.js:2:45000 --build` resolves to `PdfMergeTool.tsx:168`). `check:push` had no runner for the new guard; runners now come from the step lists. The guard also
  reads `modulepreload` and `before-hydration-url`, and two e2e specs that block scripts now block `/site/`
  and `/shared/` too.
- A tab with no service worker, open across a deploy, that lazily loads an entry gets the new entry next
  to the old shared modules it already holds. Before, that load was a 404 (`module_load`); now an export
  that changed fails as a link error. With a service worker the tab keeps its own build's cache.
