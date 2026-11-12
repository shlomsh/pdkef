---
id: "MEM-45"
title: "We see how the site performs for real visitors without spending server requests on it"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-45 · We see how the site performs for real visitors without spending server requests on it

*Filed 2026-11-12*, asked by Shlomi. The field is tight and the experience has to be the best in it, so a
problem real visitors hit and nobody sees is the risk this ticket removes.

## Why

PDkef was meant to cost almost no server requests: everything runs on the device and is cached. Measured on
2026-11-11 and 12, a returning visitor with the worker in control makes 2 billed requests per page view, and
both are measurement: PDkef's own usage ping (`/api/report`, sent twice per page view) and Vercel Web
Analytics' `view`. A first visit to a page adds two Vercel scripts and their pings. Vercel's docs say
functions count as CDN requests ("Static assets and functions all incur CDN Requests"); whether its own
`/_vercel/insights/*` requests count is not stated, and the usage dashboard is the way to settle it. The
plan allows 1,000,000 CDN requests per rolling 30 days and the site pauses beyond it (774,836 on 2026-11-12).

Speed Insights was taken off the site on 2026-11-12 (this ticket's first commit). Its free allowance is
10,000 events per 30 days; the dashboard showed "Data collection for all free projects is paused until Nov
16" and "No data was reported", so it was costing a script and a ping on every page view and recording
nothing. The dashboard offered no switch to disable it while paused, only an upgrade; the package
`@vercel/speed-insights` is still a dependency and can go with the rest of this ticket.

That leaves no measurement of how fast the site feels to real people, which is the thing we cannot afford
not to know.

## What

1. **Decide what we need to see**, per tool and per device class: how long until the tool is usable (largest
   contentful paint, and our own "island hydrated" mark), how quickly a tap responds (interaction to next
   paint), how much the layout moves (cumulative layout shift), how long opening a file takes, how long an
   export takes, and failures by kind. Write the list and the thresholds that mean "fix this" here first.
2. **Carry it on the ping we already send.** The browser reports these itself (`PerformanceObserver`:
   `largest-contentful-paint`, `event`, `layout-shift`; Resource Timing for requests), so the usage ping can
   hold a few numbers per page view with no new request, no quota and no third party. The request counts per
   page view (reached the network / answered on the device) are the first of these and are built separately
   (see the request-count telemetry commit); this ticket adds the experience measures.
3. **Spend fewer requests on measuring.** One usage ping per page view, not two; find out why there are two
   (`git grep -n "api/report"`, `src/lib/telemetry/`). Decide whether Vercel Web Analytics stays: it has its
   own allowance (50,000 events per 30 days), costs a script and a `view` per page view, and what it tells us
   (pages, referrers, countries) may be answerable from our own ping.
4. **Make it readable.** The daily read (`docs/maintenance-telemetry.md`) gains the experience measures per
   tool, today against yesterday, and the 30-day CDN request total from the Vercel usage page.
5. Remove `@vercel/speed-insights` from `package.json`, the license inventory and `SITE_WIDE_ENTRY` in
   `astro.config.mjs`.

Constraints that stand: nothing leaves the device except to this site (`connect-src 'self'`); telemetry is
anonymous and allowlisted and never blocks a tool; no file names or contents.

## Done when

- The list in step 1 is written and agreed.
- A day's real traffic shows those measures per tool in the daily read, with no request added per page view.
- A returning visitor's page view costs at most one billed request.
- The dependency is gone.
