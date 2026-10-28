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

- Brotli sizes of content-hashed files are cached by filename between runs (unhashed files are always
  measured), and the step takes under 5 s on a warm cache with the same verdicts.

## Acceptance

- [x] A unit test that a cached size is used for a hashed name and never for an unhashed one.
- [ ] Measured cold and warm times recorded in the ticket.

## Measured (2026-10-28)

Apple M2 Pro, after `npm run build`, `node scripts/check-precache-budget.mjs` (output identical cold and warm, diffed with `--table`):

| run | time |
| --- | --- |
| cold (cache file deleted) | 13.3 s |
| warm | 8.5 s |
| warm again | 8.5 s |

The warm run is not under 5 s. A CPU profile of a warm run puts 8.64 s of it in `zlib.brotliCompressSync` and
about 0.05 s in everything else (reading files, sha hashing, the guards). That time is the 55 prerendered
`index.html` pages (7.5 MB), which are unhashed and so always compressed at quality 11 by design. Reaching
the 5 s bar needs a decision about them (for example keying their size by a content hash of the bytes,
which the manifest's page hashes already provide), not more tuning of the hashed-file cache.
