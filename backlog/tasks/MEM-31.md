---
id: "MEM-31"
title: "A change in a shared editor or shell module does not rename the 300 KB sign chunk"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
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

- Re-measure aeb5d43 to 029e522 (or a fresh pair that touches the same chunks) with the fix applied on both
  sides: `sign.*.js` is not among the new hashed chunks, and the cost is under target.
- MEM-22's hash check and the precache budget still cover every file a page loads.
