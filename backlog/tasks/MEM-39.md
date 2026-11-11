---
id: "MEM-39"
title: "The worker installs once a file is opened, not on a first page view"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-39 · The worker installs once a file is opened, not on a first page view

*Filed 2026-11-11*, Shlomi's call, after MEM-35 and the bundling measurements.

## Why

Vercel bills per request and pauses the Hobby plan at 1M a month ([docs/request-budget.md](../../docs/request-budget.md)).
The worker's install is about 34-40 of a first visit's requests, and most visitors use one tool once and
do not return. Measured on the bundling branch: `/redact/` first visit is 72 requests with the install and
about 32 without; with the stub-script step, about 60 and 26. D6 there ("registers on page load after
idle") assumed the saving was only a few requests; the measurement says otherwise.

## What

The worker registers after a person has opened a file in a tool, not on a first page view. After that the
device remembers (localStorage `pdkef:file-opened`), so later visits register at load. New module
`src/lib/appUpdate/engagement.ts` with `markFileOpened` and `whenEngaged`, wired through the `ready`
promise in `BaseLayout.astro`. Unchanged: a device that already has the worker keeps it and its updates,
the installed app registers at launch, and the browser's `appinstalled` event also triggers it. The
request guard budgets "first visit" and "after a file is opened" separately. The promise becomes: a tool
works offline once a file has been opened in it online. The install page copy says so.

## Done when

- [ ] A first visit with no file makes no `/sw.js` request and leaves no registration.
- [ ] Opening a file registers the worker, and the tool then works offline.
- [ ] A returning device that already has a worker still updates.
- [ ] The guard's first-visit budget excludes the worker; a separate budget covers after a file is opened.
- [ ] Copy matches: the install page and its Hebrew twin, `docs/request-budget.md` D2 and D6, and the PWA rule.
- [ ] Measured on the live site after landing.
