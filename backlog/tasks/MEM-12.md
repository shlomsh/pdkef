---
id: "MEM-12"
title: "An alert when people are stuck on an old build"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
depends_on: []
---

# MEM-12 · An alert when people are stuck on an old build

*Filed 2026-10-01*, as the follow-up Shlomi chose to keep separate from [MEM-10](MEM-10.md) (related,
and where it came from). It is not a dependency: MEM-10 ships without it.

## Why

MEM-10 lets a waiting build take over open tabs only when it is safe: a navigation with every tab
idle. We have no signal from production about whether old builds linger anyway. The cheapest signal Vercel already has is its own request logs: requests for
content-hashed `/_astro/*` chunks that return 404 (a page from a previous build lazy-importing a chunk
the current deploy no longer serves), and the request patterns around `/sw.js` and
`/precache-manifest.json`. Nothing is added to the app, there are no cookies, and nothing comes from the
device.

## Scope

Set up a Vercel alert on the 404 rate for `/_astro/*`, using a log drain or an Observability alert,
whichever the plan allows. Pick the threshold after a week of baseline. Document where the alert lives
and who receives it.

Out of scope: any client-side reporting.

## Acceptance

- The alert exists and fires on a synthetic 404 burst against a preview deploy.
- This ticket records the threshold and the baseline week it came from.
- The location of the alert and its recipients are written down here.
