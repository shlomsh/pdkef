---
id: "MEM-40"
title: "The worker installs only what the page asks for, no home-page fallback"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-40 · The worker installs only what the page asks for, no home-page fallback

*Filed 2026-11-11*, the owner's rule: "download only what the page asks for".

## Why

The install always added the whole closure of `/` (`installPaths`) so an offline, uncached page could be
answered with the home page. That costs 9-12 requests on every tool visit that installs, for a fallback
the person never asked for. Measured after a file is opened: `/redact/` 42 requests, `/sign/` 45.

## What

- `installPaths` returns `/` (the document alone) plus the closures of the open and held pages. `/`'s own
  closure comes only when `/` is itself open or held. The `/` document stays: the install uses it to verify
  it is installing this build (`root_unreachable`, `root_mismatch`, `releaseOlderBuild`, MEM-29), not as a fallback.
- The navigate handler answers an offline, uncached page with the home page only when it is servable
  (`servableFromCache(cache, '/')`: opened, whole closure cached); otherwise `Response.error()`, so the
  browser shows its own offline page.
- The guards follow: `installPaths` and `largestPageInstall` in `check-precache-budget.mjs`, `installSet`
  in `check-request-count.mjs`; the after-open budgets drop to the measured 9 / 32 / 32.

## Done when

- [ ] A tool install set holds no home-only file; `/` open or held includes its closure; `/` is always present.
- [ ] Offline, an uncached page with an incomplete `/` gets a network error; with a complete `/` it gets the home page.
- [ ] The offline e2e pins both cases; the update-protocol specs are unchanged.
- [ ] Request guard after-open budgets lowered to the measured values.
- [ ] Docs match: `docs/request-budget.md` (D11) and the PWA rule.

## What changed after review

- An update no longer carries the home page for a person who never opened it: every install stores the `/` document for the build check, which the next build read as "`/` was held". `/` now counts as held only when a previous cache holds its whole closure (by the manifest that cache stored; no readable manifest, not held). Other pages still count by their document.
- Installing the app caches the home page: the installed app starts at `/`, so on `appinstalled`, or at load for an installed app or a device that remembers an install (`pdkef:app-installed`), the page sends `pdkef:cache-home` and the active worker caches `/`'s closure. A `/` cached whole this way is held, so it carries over at an update.

