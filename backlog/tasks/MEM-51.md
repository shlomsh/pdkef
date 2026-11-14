---
id: "MEM-51"
title: "A tab left open across a deploy loads a lazy chunk from the new build beside shared chunks from the old one"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
depends_on: []
---

# MEM-51 · A lazy chunk from the new build beside shared chunks from the old one

*Filed 2026-11-14*, from the phone-check where Scan's camera failed on every Start scanning with
`undefined is not an object (evaluating 'i.current=e')` at `vt@/shared/scan-late.js`.

## What happens

Every JS chunk has a stable name (`/shared/<name>.js`, MEM-31) and the minifier picks the export letters, so
**any edit that changes a shared chunk renumbers its exports**. A lazy `import()` of `scan-late.js` (or any
`*-late.js`) is a new request; the file's own `import {..} from "./tools-common.js"` resolves, by URL, to the
copy the page already evaluated. If `scan-late.js` is from build B and `tools-common.js` is from build A, the
names still exist and mean different things: no link error, no rejected import, just wrong bindings.

Measured 2026-11-14 on two builds 25 commits apart (HEAD and `b8ad39c0d`, plain `astro build`): the new
`scan-late.js` imports 29 names from `tools-common.js`; all 29 exist in the old `tools-common.js`, and for all
29 the export is a different function (export `H` is `rd(e,t,n)` / `findIndex` in the old build, `bd(e,t,n='fit',r=1)`
in the new one). `site.js` (2 of 2) and `scan-tool.js` (11 of 11) differ the same way; `ui.js` happened to be
identical across those 25 commits. So the failure is silent, and **MEM-38's `chunkReload` never fires**: it
keys on a rejected import (`Failed to fetch dynamically imported module`), and this import resolves.

## Who can reach it (production)

Vercel serves `/shared/` with `cache-control: public, max-age=0, must-revalidate` (curl 2026-11-14), so a lazy
chunk is always fetched fresh from whatever is deployed. A chunk is lazy when no entry reaches it statically
(`*-late`, MEM-44), so it is requested at the first use of the feature, which can be hours after first paint.

1. **No worker in control (yes, reachable).** First visit to a tool page, before the worker is active (it
   registers after hydration and idle, claims only after install, and a first claim deliberately does not
   reload: DEBT-45); a non-tool page opened with no file ever opened (MEM-39); a browser that blocks workers.
   Load page (build A), deploy B, tap Start scanning: the lazy chunk is B's, everything already evaluated is A's.
2. **Worker installed, page not served from its cache (yes, reachable).** A tab whose navigation the network
   answered (closure incomplete, MEM-28/MEM-35: first visit of a tool after the worker was installed by another
   tool) is a "network client": its non-hashed files come from the network, unstored. A second deploy during its
   life gives the same mix. The worker does not help a page it did not serve.
3. **Worker in control, page from its cache (no, by design).** The page's closure includes its lazy chunks
   (`precacheClosure.mjs` follows `import()`; `/scan-to-pdf/` lists `scan-late.js` and `scan-late-*.css`), and
   `servableFromCache` serves a page only with the whole closure, so build A's tab asks cache A for `scan-late.js`
   and gets A's bytes. The new worker waits (MEM-10) until every tab is idle, then tabs reload on
   `controllerchange`. Residual: between `activate` (cache A deleted) and that reload a tab can still call a
   lazy import and get B's chunk (seconds; the reload flushes drafts first). A critical force (MEM-13) widens it
   to the 75 s cap.
4. **First install claim (narrow).** A page loaded from the network as build A whose worker came from a
   deploy B that landed in between is claimed by a worker whose cache is B: its lazy imports are B's.

Also seen in dev (2026-11-14): a stale `ui.js` in the browser's cache beside a fresh `scan-late.js`. Not a
production path by itself (must-revalidate), but the same mix.

## Cheapest guards (pick one; the first is the one to try)

- **Make the mix fail loudly, then let MEM-38 recover it.** Each `*-late` chunk carries a short hash of the
  export tables of the shared chunks it imports, and imports the matching constant from each of them (a
  mismatch throws on evaluation). The constant is a function of the interface, so a chunk's bytes change only
  when the interface does (no per-deploy value in JS, which the build rules forbid). Extend `IMPORT_FAILURE`
  in `src/site-lib/chunkReload.ts` to the new error, so the page reloads once, after the draft flush, onto one
  build.
- **Or reload on a mismatch of build, not on an error:** the page knows its build (`readBuildCommit`, the
  `Server-Timing` header); a lazy-import wrapper that first checks the worker/`/` for a newer build costs a
  request per use, so it is the more expensive of the two.
- **Not** fingerprinted `/shared/` names or a build id in chunk URLs: this undoes MEM-25/MEM-31 (update cost).

## Done when

- [ ] A unit or build test that builds two variants of one shared chunk (a changed export count) and shows a
      late chunk from one beside the other fails to evaluate rather than binding wrong names.
- [ ] `chunkReload` reloads once on that failure and not while an update hold is set (MEM-38 tests extended).
- [ ] A Playwright spec: page loaded, a later build's lazy chunk served for one import, the page reloads onto it.
- [ ] `docs/offline-and-requests.md` A8 notes the guard next to "no long cache on stable-named scripts".
