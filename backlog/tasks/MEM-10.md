---
id: "MEM-10"
title: "A shipped fix has no way to reach someone who keeps the app open"
status: "open"
priority: "P1"
epic: "one-memory-space"
phase: "near-term"
depends_on: []
---

# MEM-10 · A shipped fix has no way to reach someone who keeps the app open

*Filed 2026-09-20*, out of the recent-thumbnail data-loss bug. The fix was deployed and verified
against production within minutes, and the person who reported it still reproduced the bug
afterwards, because they were still running the previous build and had no way to know.

## What happens today

`public/sw.js` serves HTML cache-first and refreshes in the background, and deliberately never calls
`skipWaiting()`: deleting the old build's cache under a live page breaks that page's lazy imports.
Both choices are right on their own and neither is up for reconsideration here.

Together they mean a new build takes over only once **every** tab of the site has closed. A person
who keeps the tab open, or an installed app that is never fully quit, can sit on an old build
indefinitely with nothing telling them so. For an ordinary change that is fine. For a fix to
**silent data loss** it is not: the person most motivated to retry is the one still running the code
that loses their work, and the honest instruction we had to give was "quit the browser entirely,
twice".

## What to build

The standard pattern the no-skipWaiting rule already allows: when the waiting worker signals an
update is ready, surface it quietly and let the person choose, rather than taking the page over.
A line in the shell's existing status vocabulary ("A new version is ready · Reload"), reload on the
click, `skipWaiting` sent to the waiting worker at that moment only, when no editor has unsaved
in-flight work. Never automatic, never a modal, and never mid-export.

Worth deciding in the same ticket: whether a build that fixes data loss should be able to mark
itself as one, so the prompt can be more insistent for that case than for a copy change.

## Acceptance

- With an old build live in one tab and a newer one deployed, the update line appears and reloading
  lands on the new build, with the tab's work intact across the reload.
- Nothing appears when there is no waiting worker.
- The prompt never fires during an export or with an unsaved editor change in flight.
- A Playwright guard covers the appear-and-reload path; the existing service-worker specs keep
  passing, `skipWaiting` still never runs on its own.
