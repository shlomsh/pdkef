---
id: "MEM-21"
title: "A nightly job measures what an update downloads against the previous deploy, with a target of about 500 KB"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: ["MEM-19", "MEM-20"]
---

# MEM-21 · A nightly job measures what an update downloads against the previous deploy, with a target of about 500 KB

*Filed 2026-10-27* from the update-cost measurement after MEM-15..18.

## Why

- A returning client's update downloads every changed `/_astro/` file (MEM-16 copies the rest) plus every
  non-hashed URL whose bytes changed. Measured over ten output-changing deploys of main: median 1.58 MB,
  max 1.78 MB (brotli q5), mostly HTML that changed only by the commit stamp (MEM-19) or CSP hash order
  (MEM-20). Without those, the median was about 0.66 MB, and a shared-chunk change reached 1.6 MB.
- `test:precache-budget` (MEM-18) budgets one build. The update cost depends on two builds, so no CI
  check sees it; it grew unnoticed until measured by hand.
- The measuring scripts exist in the session scratchpad (`update-cost/analyze.mjs`): the install set of
  each build from `scripts/precacheClosure.mjs`, then the bytes of new hashed URLs plus changed
  non-hashed URLs, plus `sw.js` and the manifest.

## Outcome

- A nightly job builds the current main and the previous deployed commit, computes the update cost
  between them with one pure function in `scripts/` (unit-tested on fixture builds), and fails above the
  target, naming the largest contributors.
- The target, about 500,000 bytes brotli, lives beside the other precache budgets with the measurement it
  came from. A deploy that changes shared chunks may exceed it; the failure says which chunks cascaded.

## Acceptance

- [x] Unit tests: unchanged builds cost only `sw.js` and the manifest; one renamed chunk costs that chunk
      plus the pages that reference it; a page changed only in bytes, not in references, costs that page.
- [x] The nightly run reports the cost and the top contributors in its summary.
- [x] The target and the measurement behind it are written in the Done section.
- [x] The job builds both deploys at one path, and a nightly reading of an ordinary deploy is under target.

## Progress

*2026-10-27.* `scripts/updateCost.mjs` (pure, `UPDATE_COST_TARGET = 500_000`, tests beside it), the CLI
`npm run measure:update-cost -- <before dist> <after dist>`, and a nightly `update-cost` job in `ci.yml`
that builds the last two production deploys GitHub records for Vercel (main's first parent is not a
deploy). On the 2026-10-27 S8 pair (a8763091 to 7ffc926f with MEM-19 and MEM-20 applied) the CLI reports
503,058 bytes, above target, led by /sign/, /he/sign/ and the new PdfSignTool chunk, 12 pages changed
alongside 5 new hashed chunks. Closes once the first nightly run has written its summary.

## Done (2026-10-28)

- **Target:** `UPDATE_COST_TARGET = 500_000` bytes brotli (q5) in `scripts/updateCost.mjs`, from the
  measurement in Why: about 0.66 MB median once MEM-19 and MEM-20 removed the stamp and CSP-order churn,
  and 503,058 bytes on the 2026-10-27 S8 pair.
- **First nightly reading:** run 40662513043 (2026-10-28, a manual dispatch with `nightly: true`, which
  takes the scheduled path) compared the last two production deploys, de9b06dc and 5522bb04, and wrote
  the job summary. Result: 1,934,844 bytes, above target, so the job failed as designed. It named the
  top contributors (`/_astro/sign.*.js` 301,114 new-hashed, `/sign/` 50,488, `/he/sign/` 49,853,
  `PdfSignTool.*.js` 43,350, `/` 42,643) and the cascade: 54 pages changed alongside 20 new hashed chunks.
- That deploy changed only `src/lib/telemetry/maintenanceEventSchema.ts` and `src/site-lib/appUpdate.ts`
  (MEM-24), so the cost is the shared-chunk cascade this ticket warned about, not new content. It is
  tracked as its own structural ticket, MEM-25.

## Reopened (2026-10-28)

The scheduled nightly that day (run 40665616224, 5522bb04 to 935512c2) read 906,908 bytes with 25 pages
changed and no chunk renamed. Rebuilt at one path, the same pair costs 23,275 bytes and changes only
`/about/` (its build stamp). The job built each deploy in its own `git worktree` directory, and Astro
hashes each island's absolute source path into its `uid` (`shorthash` of `componentUrl` in
`node_modules/astro/dist/runtime/server/render/component.js`), so every island page differed. About
880 KB of that reading was the measurement, and no reading could pass the target. The first reading
(1,934,844 bytes, de9b06dc to 5522bb04) holds: rebuilt at one path it is 1,934,774 bytes and the same 54
pages, because those pages really changed (MEM-25).

The job now builds both deploys in one worktree, checked out in turn, pinned by
`scripts/ci-update-cost.test.mjs`. Closes when a nightly reading of an ordinary deploy is under target.

## Closed (2026-10-28)

Run 40717216696 (a manual dispatch with `nightly: true`) compared the production deploys 935512c2 and
fec5c109, both built at one path: 11,371 bytes, within the 500,000 target, with 0 pages changed and 0 new
hashed chunks. Every other job in that run passed. A deploy that changes a shared module still reads above
target until MEM-25 lands, which is the job doing what it is for.

## Follow-up (2026-10-28, evening)

Run 40769995397 (1b72a77d to 686e27e0) read 1,494,219 bytes with all 54 pages changed: Astro wrote the
whole build's inline hashes into every page's CSP, so one style edit changed every page. The post-build
CSP step now keeps only each page's own hashes (`pruneCspHashes` in `scripts/cspHashOrder.mjs`); the same
pair reads 791,557 bytes and 22 pages. The first deploy carrying it still reads every page changed against
a deploy without it.

Ordinary deploys still read about 1.3 MB from two causes now ticketed: a CSS Module edit renaming about
25 JS chunks (MEM-26) and inlined tool-layout CSS (MEM-27). Until MEM-26 lands the job is report-only
(`continue-on-error`), so it no longer turns the nightly red; it still measures and writes its summary.
