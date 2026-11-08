---
id: "MEM-31"
title: "A change in a shared editor or shell module does not rename the 300 KB sign chunk"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# MEM-31 · A change in a shared editor or shell module does not rename the 300 KB sign chunk

*Filed 2026-11-08* from the update-cost nightly (MEM-21) going red on run 42470746400, deploy aeb5d43 to
029e522: 655,960 bytes against the 500,000 target.

## Why

Both deploys rebuilt locally at one path. After normalizing hashed `/_astro/` names, the new chunks split:

| Part | Bytes (brotli q5) |
| --- | --- |
| 9 chunks renamed with no content change, led by `sign.*.js` (300,416) | 361,466 |
| chunks whose content changed (`useOutputNameOverride` 27,032, `encryptedPdfError` 14,133, `highlightColorNames` 11,632, ...) | 61,850 |

`sign.*.js` is byte-identical after normalizing: it imports `drawElements`, `fonts`, `highlightColorNames`
and `useOutputNameOverride` by hashed file name, and those were renamed. The deploy carried 17 commits of
ordinary editor and shell changes (DEBT-72, DEBT-73, DEBT-74, ARCH-133, ARCH-135 and others); none touched
`sign`'s own modules. MEM-25 solved the same cascade for `maintenanceTelemetry` and `openPdfDoc` by listing
them in `HOT_SHARED_CHUNKS` (`scripts/stableNames.mjs`), so they are emitted under `/shared/` at stable
names. The chunks `sign` imports now are not on that list, and their Rolldown names come from whichever
module lands first in them, so a hand list is fragile.

## Outcome

- An edit to a module inside one of `sign`'s imported shared chunks costs that chunk, not `sign`.
- The chosen mechanism does not depend on Rolldown's first-module chunk names staying put, or a guard fails
  when a listed name stops being emitted (as `test:stable-names` does for the current list).

## Acceptance

- [x] Re-measure aeb5d43 to 029e522 (or a fresh pair that touches the same chunks) with the fix applied on both
  sides: `sign.*.js` is not among the new hashed chunks, and the cost is under target.
- [x] MEM-22's hash check and the precache budget still cover every file a page loads.

## Done (2026-11-08)

**Mechanism.** The rule is "no chunk is content-hashed": every client entry is `/site/<name>.js` and every
other chunk `/shared/<name>.js` (`scripts/stableNames.mjs`, `chunkFileName`). MEM-25's list of two hot chunks
is gone; a list cannot keep up with Rolldown's first-module chunk names, and the cascade was through chunks
nobody had listed. What replaces the list's guard:

- `stableChunkNames` (a build plugin) fails the client build when a chunk's file is not the one its name
  asks for, which is what Rolldown does to two chunks sharing a name (`index2.js`; the number follows build
  order, so it would drift and rename importers). None exist today (125 chunks).
- `test:stable-names` fails when a chunk in `site/` or `shared/` imports a file in `/_astro/`. `/_astro/`
  now holds only the four workers and the assets.
- `stableNames.build.test.mjs` builds a fixture twice with the real naming and edits the deepest of three
  chained shared modules: no file is renamed, one chunk changes.
- `check-lazy-modules.js` reads chunks from `shared/` as well (its patterns key on `name.`, which
  `name.js` still matches), and still fails when a pattern matches nothing.

**Measured** (brotli q5, each pair built at one path, the naming change applied to both sides by patch):

| Pair | Before | After | `sign` renamed |
| --- | --- | --- | --- |
| aeb5d43 to 029e522 | 655,938 (CI 655,960) | **230,586** | no |
| 029e522 to 351c45b | 595,002 | **226,638** | no |

After, no hashed chunk is new in either pair (26 and 20 before). What is left is real change: the
`/site/` entries that carry edited code (`PdfSignTool` 45 KB, `PdfHighlightTool` 45 KB, `PdfRedactTool`
36 KB, `PdfScanTool` 21 KB), `useOutputNameOverride` 27 KB, `encryptedPdfError` 14 KB,
`highlightColorNames` 11 KB, the build stamp on `/about/`, `sw.js` and the manifest.

**Page weight and first paint.** The load graph is the same chunks with the same modulepreloads. Brotli
document + CSS + JS per page falls slightly (names carry no hash): `/sign/` 222,560 to 220,468 (JS 172,544
to 170,423), `/redact/` JS 161,832 to 159,900. `test:weight`, `test:precache-budget`, `test:csp`,
`test:seo`, `test:redirects` and `test:css` pass. The manifest grows by 870 bytes brotli (7,587 to 8,457)
for the 125 chunk hashes MEM-22 now checks, an always-fetched file.

**Behaviour to know.** The worker now revalidates the 125 chunks at install with conditional requests
(304 when unchanged) where it used to copy them from the previous cache with no request; no bytes move.
Chunks are no longer immutable in the HTTP cache, same as the entries since MEM-25. The offline, update and
early-pick Playwright specs (26 tests) pass on the new build.

**In CI.** Not yet read: the first nightly after the fix still compares a pre-fix deploy with the fix
deploy and can fail once on the fix itself; the reading after it is the one that counts.
