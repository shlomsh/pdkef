---
id: "DEBT-45"
title: "WebKit's recent-tile e2e is interrupted by a late second navigation to /sign/"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-45 · WebKit's recent-tile e2e is interrupted by a late second navigation to /sign/

*Filed 2026-10-12.* `e2e/home/recent-files.spec.js:144` ("opening a recent tile > sets the tool
pointer with no confirmation, and does not disturb the other tile") fails intermittently in the
`webkit` project:

```
page.goto: Navigation to "http://127.0.0.1:4173/" is interrupted by another navigation to
"http://127.0.0.1:4173/sign/"
```

at the `await page.goto('/')` that follows clicking recent tile B, `waitForURL('**/sign/')` and
`waitForLoadState('load')`. Seen in CI runs 37810701063 and 37814416340 (2026-10-08) and 38248935677
(2026-10-12). Locally on a production build it fails about 1 run in 6-8 with `--repeat-each=8
--workers=2`, typically the first test in a fresh worker, taking ~45s.

## Outcome

Whatever issues the second navigation to `/sign/` is found and named. If the product navigates twice,
the product is fixed; otherwise the test waits for the real settled state. The spec is shown red
before and green after on a repeat run.

## What it was

**A product bug, not a test race: a first visit's page reloaded itself.** `startAppUpdates`
(`src/site-lib/appUpdate.ts`) decides whether the service worker's first claim is a first install
(ignore) or an update (reload) with `if (reg.active) controlled = true` right after `await
register()`, meant for a hard reload beside a worker that already existed. In WebKit `register()` can
resolve after install and activation, so a brand-new visit also sees `reg.active`, marks itself
"controlled", and the `controllerchange` that follows calls `location.reload()`.

In the spec that is the home page's first load of the run: `page.goto('/')` returns, the worker claims
~100ms later, and the page reloads `/` while the test has already clicked tile A and `/sign/` is
loading. Playwright then sees a navigation interrupted by another one (CI: `goto('/')` interrupted by
`/sign/`; locally the same race more often ended as `waitForURL('**/sign/')` hanging to the 45s test
timeout). A person clicking a tile in the first second of their first visit had the same race.

Evidence: a temporary init script logging `performance.getEntriesByType('navigation')[0].type`,
`controllerchange` and worker state showed a `nav=reload ctl=activated` load of `/` ~10ms before each
failing `/sign/` navigation, in the runs that failed and in some that passed. Locally on a production
build (port 4397, webkit, `--workers=2`): 1 red of 8, 3 of 16, 1 of 16 before the fix.

## Fix

`getRegistration()` is asked before `register()`; only a worker that already existed then counts as a
hard reload. `src/site-lib/appUpdate.test.ts` has the unit test, seen red first ("a first install whose
worker is already active when register() resolves is still a first install"). The spec is unchanged.

After the fix, rebuilt: the instrumented spec ran 32/32 green with no self-reload after first
activation, and the unmodified `recent-files.spec.js` ran 120/120 (24 repeats of its five tests) on
webkit.
