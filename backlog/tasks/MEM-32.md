---
id: "MEM-32"
title: "An update fetches only the files that changed, not every page and /shared/ chunk"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-32 · An update fetches only the files that changed, not every page and /shared/ chunk

*Filed 2026-11-10* from Vercel's notice that the free team had used 75% of its 1,000,000 monthly CDN
requests.

## Why

`planPrecache` in `public/sw.js` copied a file from the previous build's cache only when it was a
content-hashed `/_astro/` URL. In the build of 2026-11-09 that was 8 of the 251 precached URLs. The other
243 (every page, every `/shared/` chunk MEM-25 gave a stable name, icons, the redaction sample) were
requested again on every deploy, by every visitor with the worker installed, even when the bytes were the
same (a 304 at best, still one CDN request each). `main` saw 438 first-parent pushes from 2026-11-01 to
2026-11-10, about 44 deploys a day.

MEM-21's nightly measures update cost in bytes, where a 304 is nearly free, so it never showed this.

## What

The manifest already carries a hash for every unhashed URL (MEM-22). Install now reuses a held unhashed
file when its cached bytes hash to this build's value, trying each previous own cache in turn, and fetches
it only otherwise. A URL with no manifest hash is still fetched.

A copy keeps the response headers it was stored with, and `vercel.json`'s headers (the CSP among them) are
not in `dist/`. So `scripts/generate-precache-manifest.mjs` fingerprints `vercel.json`'s `headers` into
the manifest (`headers`) and into the build id, and only a previous cache whose stored manifest carries the
same fingerprint may lend a file. Folding it into the build id also closes an older gap: a headers-only
deploy left `dist/` unchanged, so the worker never updated and installed clients kept the old headers.
`scripts/updateCost.mjs`'s comment describes the new rule; its byte model was already right.

Accepted edge, from review: a running old worker refreshes a page from the network after checking only its
bytes, so in a headers-only deploy followed by a revert before that old cache is deleted, the revert's install
could copy a page carrying the middle deploy's headers. It lasts until the next install replaces that page.

## Done when

- [x] Unit tests in `scripts/sw.test.mjs` show an unchanged page and `/shared/` file copied with no
      request, a changed one fetched, and everything fetched when the headers fingerprint differs or is
      missing; `generate-precache-manifest.test.mjs` shows a headers change moves the fingerprint and the
      build id.
- [ ] Landed on `main`.
- [ ] A week after landing, the Vercel usage page shows the daily CDN request rate down; the figure
      goes here.
