---
id: "QUAL-40"
title: "A localized content or image change runs only the specs that use it"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: ["QUAL-34"]
---

# QUAL-40 · A localized content or image change runs only the specs that use it

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `src/content/localized-tools/<lang>/<tool>.yaml` and `public/images/<dir>/**` widen to everything
  today. In the replay window that was 5 pushes for images and 2 for localized content.

## Outcome

- These paths map to the specs that consume them (e2e/localized plus the tool's own specs; the pages
  that render an image directory), proven by a replay as ARCH-32 did, and anything unmapped still
  widens.

## Acceptance

- [ ] Unit tests for the mapping and for the unmapped fallback.
- [ ] A replay of past pushes showing no spec that failed on those pushes would have been skipped.
