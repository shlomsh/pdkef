---
id: "QUAL-37"
title: "test:precache-budget reuses compressed sizes by hashed filename"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# QUAL-37 · test:precache-budget reuses compressed sizes by hashed filename

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `test:precache-budget` is the long pole of `check:push`'s dist stage at 12.9 to 17 s; the other dist
  guards take 2 s or less. `check:push` on a single Merge component took 44.7 s in all, so this step is
  about 22% of it. It compresses every precached file with brotli on every run, including `/_astro/`
  files whose name already changes with their content.

## Outcome

- Brotli sizes of content-hashed files are cached by filename between runs (files with no content hash, neither an
  /_astro/ name nor a manifest hash, are always measured), and the step takes under 5 s on a warm cache with the same verdicts.

## Acceptance

- [x] A unit test that a cached size is used for a hashed name and never for an unhashed one.
- [x] Measured cold and warm times recorded in the ticket.

## Measured (2026-10-28)

Apple M2 Pro, after `npm run build`, `node scripts/check-precache-budget.mjs` (output identical cold and warm, diffed with `--table`):

| run | time |
| --- | --- |
| cold (cache file deleted) | 13.3 s |
| warm | 8.5 s |
| warm again | 8.5 s |

The warm run was not under 5 s: 8.64 s of it was brotli on the 55 unhashed pages, which the second pass below addresses.

### Second pass: pages reused by the manifest's content hash

Pages and other non-`/_astro/` URLs are now cached under `url#<manifest.hashes[url]>` (MEM-22 hash of the final
bytes), cached only once the file's bytes match that hash; a URL with no manifest hash is still always compressed and never cached. Same machine and build:

| run | time |
| --- | --- |
| cold (cache file deleted) | 13.3 s |
| warm | 0.08 s |
| warm again | 0.07 s |

`--table` output is identical cold vs warm (diffed). The under-5 s bar holds.
