---
id: "DEBT-35"
title: "A crash report names its commit, and the reader labels each frame, so a production crash reads without a slow search"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: ["DEBT-31"]
---

# DEBT-35 · A crash report names its commit, and the reader labels each frame

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

- [x] A fresh crash on a deployed build shows its commit in `errors:read`.
- [x] `errors:resolve -- <frames> --build <sha>` resolves in one build; without `--build` it searches as before.
- [x] A report with no `build` (an old tab) still parses, is stored and resolves by search.
- [x] Chunk hashes are unchanged by the SHA: no JS file carries it at all (evidence below; the first design failed this and was replaced).
- [x] The frame label function is unit-tested against the six real fingerprints from the digest.
- [x] A real-build check: the beacon body of a reported error carries the SHA.
- [x] CSP, weight, lazy-modules and SEO guards green; the full `ci.yml` chain run once.
- [x] The daily digest's prompt edit is handed to Shlomi (below; the skill file is not edited from here).

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

**Result of the design that shipped.** Three real builds (`VERCEL_GIT_COMMIT_SHA` set to two different
40-hex values, then unset), whole `dist/` compared by SHA-256: 276 files each, the same build id in all
three (`pdkef-ef6cd650848e`, so `sw.js` and the precache name do not move), **zero** non-HTML files
differ, and the 42 pages that differ equal the no-commit page plus exactly one
`<meta name="pdkef-build" content="aaaaaaa">`. A build with no commit has no tag at all.

## Evidence

- `build` flows end to end on a production build: `VERCEL_GIT_COMMIT_SHA=aaaa...` build, preview, a
  thrown error with a frame in `/_astro/`, and the beacon body read in Chromium was
  `{"build":"aaaaaaa","actions":[],"area":"uncaught",...}`. `e2e/error-report-build.spec.js` asserts the
  same, and passes against a no-commit build too (no `build` key at all). CI's two Build steps now set
  `VERCEL_GIT_COMMIT_SHA` so the stamped path is the one exercised there.
- `errors:resolve -- <frames> --build <sha7>`: one build, 15 s, `HIT`, frames mapped to
  `PdfMergeTool.tsx:490` and `readGlyphs.js:12`. Without `--build` (`--from HEAD --max 3`) it searches as
  before, also a hit on the first commit.
- Guards on a stamped build: `test:csp`, `test:seo`, `test:redirects`, `test:css`, `test:weight`,
  `test:lazy-modules` green. `check:push` (22 steps) and `check:e2e` (product 93 s, fonts 40 s, export
  guards 7 s) green.
- Two unrelated unit tests failed once each under full-suite load and passed alone (a 500 ms budget in
  Sign's `formCells.test.js`, an async-text assertion in `PdfSecurityTool.test.tsx`); neither touches
  this change.

## Digest prompt edit (for Shlomi; `~/.claude/scheduled-tasks/pdkef-daily-error-read/SKILL.md`)

Step 2, after "run the `npm run errors:resolve -- <frames>` line the reader prints under it": add

> The reader now prints, per fingerprint, the `build` (the 7-character commit the page was built
> from), a label per frame (vendor or ours, and the first of ours), a stale-tab note, and a resolve
> command that already ends in `--build <sha>`: run it as printed, it is one build (about 15 s). A row
> that says `build unknown (older tab)` came from a tab older than DEBT-35: its command searches
> history as before and can take minutes or find nothing, which itself says the tab is old.

Step 3, in the DEBT-30 and ENC-02 items, replace "check which commit `errors:resolve` says the build
came from" with "check the `build` that `errors:read` prints for the sample, and `git merge-base
--is-ancestor <fix commit> <build>`", and keep the rule that a build older than the fix is a tab
still on the old code. Also tell it to quote the stale-tab note the reader prints rather than
re-deriving it.

## Fresh review (a separate subagent, no shared context) and what came of it

Seven findings, each checked against the code and `dist/` before acting; all but the last were real
and are fixed, test first (red run seen for each):

1. The vendor table missed the real chunk names (`jsxRuntime.module`, `signals.module`,
   `preload-helper`, `rolldown-runtime`, `client`, the lucide icon chunks), so "first of ours" named
   `jsxRuntime.module` on exactly the Preact-internal stacks. "Ours" is now "has a source file under
   `src/`" (from `git ls-files`), with the table only naming the known libraries; without git it falls
   back to the table.
2. `staleVerdict` read any `merge-base` failure (128, the 5 s timeout) as "stale". Only exit status 1
   is "not an ancestor" now; anything else prints nothing.
3. A chunk `sign` matched `src/pages/sign.astro` and a fixture copy, so a marketing edit read as a
   stale tab. Candidates are `src/` files outside `pages/` and `content/`; `.astro` script chunks map to
   their component.
4. A failed build under `--build` was reported as "did not emit chunks". It now says the build failed.
5. An ambiguous short SHA ran a pointless `git fetch` and said "not in this repository". It now says
   ambiguous.
6. The e2e spec could pass on the "no commit" branch of a stamped build, and four of the five CI
   `npm run build` steps were unstamped. `VERCEL_GIT_COMMIT_SHA: ${{ github.sha }}` is now workflow-level,
   and the spec requires the tag to equal it when the variable is set (checked: the same build passes with
   its own SHA and fails with another).
7. A tautological assertion in `buildCommit.test.mjs`, rewritten to prove stamping is reversible and the
   unstamped page differs by the tag alone. The review's "no resolver test for worktree cleanup" stands as
   noted: the `try/finally` is correct by reading and not unit-tested.

Reviewer's side note, not a bug: every push now changes the bytes of every HTML page, so the CDN
revalidates HTML on docs-only pushes (the service worker cache name does not move).

## Outcome (2026-10-02)

A report from a deployed build carries the 7-character commit; `errors:read` shows it, a label per
frame, a vendor-or-ours summary and a stale-tab note, and prints the resolve command with
`--build <sha>`; `errors:resolve --build` is one build (15 s measured) where the search was up to 40.
An old tab's report parses and resolves by search as before. No JS chunk, no cache name and no
non-HTML file changes with the commit. The privacy page needed no change (its one clause covers
anonymous crash data; `docs/maintenance-telemetry.md` and `ANALYTICS.md` list the field).
