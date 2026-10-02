---
id: "DEBT-34"
title: "A crash report names its commit, and the reader labels each frame, so a production crash reads without a slow search"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-31"]
---

# DEBT-34 · A crash report names its commit, and the reader labels each frame

*Filed 2026-10-02, from the first digest week.* `npm run errors:resolve` maps a reported frame
(`chunk.hash.js:line:col`) to source by rebuilding origin/main commits, newest first, about 7 s each,
up to 40, until a build emits every reported chunk. One fingerprint takes up to about 4.5 minutes, and a
report from a tab older than the window returns "no match" (the Chromium 143 Redact reports and an
Unlock ReferenceError did exactly that). It is the daily digest's slow step.

Cause: `errorReportSchema.ts` deliberately sends no build id ("the chunk's content hash identifies the
build"). That is true but unreadable: a hash cannot be looked up, only searched for by rebuilding.

## What to build

1. **The report carries the commit.** An optional `build` field: the first 7 hex characters of the
   deploying commit (`VERCEL_GIT_COMMIT_SHA`, injected at build time; nothing in dev or when absent).
   Schema, sender, endpoint and store carry it; the sample stored per fingerprint holds it. A report
   from a cached older build sends none and still parses, exactly as `actions` did (DEBT-31).
   `errors:resolve -- <frames> --build <sha>` checks out that one commit, builds once and decodes;
   without `--build` it keeps today's search. `errors:read` shows the build under each fingerprint,
   prints the exact resolve command with it, and says when the report's build predates the last change
   to the crashing file ("likely a stale tab").
2. **Readable names in the reader, no rebuild.** A plain label per frame (`PdfMergeTool.C4ILDZF-.js` ->
   `PdfMergeTool`, `pdf-lib.CqiVumd9.js` -> `pdf-lib (vendor)`) and a vendor-or-ours tag, so frame #1
   being a library and the first non-vendor frame being ours reads at a glance.

## Hazard (measured, not assumed)

A per-commit constant must not change the content hash of the shared vendor chunks or of every tool
chunk on each deploy: that defeats caching and the service worker precache. See "Chunk-hash
measurement" below.

## Acceptance

- [ ] A fresh crash on a deployed build shows its commit in `errors:read`.
- [ ] `errors:resolve -- <frames> --build <sha>` resolves in one build; without `--build` it searches as before.
- [ ] A report with no `build` (an old tab) still parses, is stored and resolves by search.
- [ ] Chunk hashes are unchanged by the SHA, except the one named module (evidence below).
- [ ] The frame label function is unit-tested against the six real fingerprints from the digest.
- [ ] A real-build check: the beacon body of a reported error carries the SHA.
- [ ] CSP, weight, lazy-modules and SEO guards green; the full `ci.yml` chain run once.
- [ ] The daily digest's prompt edit is handed to Shlomi (the skill file is not edited from here).

## Chunk-hash measurement

**First design, rejected (2026-10-02).** The commit as a build-time constant (`vite.define`) in a
one-line module imported only by `errorReport.ts`. Two builds on two fake SHAs, `dist/_astro` file
names diffed: 78 files each, **38 renamed**. The vendor chunks (`pdf-lib`, `pdf`, `preact`,
`sortable`) kept their hashes, but `errorReport.*.js` is imported by every tool chunk, and a
Rollup chunk's hash includes the names of what it imports, so every tool chunk, shared helper
and lucide icon chunk changed on every deploy. The carrier of the SHA was one file only
(`errorReport.*.js`); the cascade came from its importers.

A second cost, found while reading `scripts/generate-precache-manifest.mjs`: `sw.js`'s cache name is
a hash of all of `dist/`. Any per-commit byte anywhere in `dist/` makes even a docs-only push a
new build id and a full re-precache for every returning visitor, where today an identical dist is
an identical build id.

**Design that replaced it.** The commit is written into HTML only, as
`<meta name="pdkef-build" content="abc1234">` from `BaseLayout.astro`, as a placeholder that
`generate-precache-manifest.mjs` substitutes after the build id is hashed (the `__BUILD_ID__`
pattern `about.astro` already uses). No JS chunk contains it, the build id still ignores it, and the
tab's own HTML names the build the tab loaded, which is exactly what a stale tab needs.
