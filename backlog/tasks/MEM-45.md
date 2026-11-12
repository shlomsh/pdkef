---
id: "MEM-45"
title: "We see how the site performs for real visitors without spending server requests on it"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-45 · We see how the site performs for real visitors without spending server requests on it

*Filed 2026-11-12*, asked by Shlomi. A problem real visitors hit and nobody sees is the risk this ticket removes.

## What is built

- **Cohort.** `since` (first, day, week, month, quarter, older) rides on `tool_page_viewed` beside `visit`,
  from a first-view day kept on the device in `pdkef:first-visit`, written once
  (`src/lib/telemetry/visitRecency.ts`). `visit` still says whether this browser was already here today.
  Only buckets travel, never a date or an id. `errors:read` prints it per tool.
- **An optional second destination** for the usage and maintenance events: `src/lib/telemetry/analyticsSink.ts`,
  switched on by two build variables (`PUBLIC_ANALYTICS_HOST`, `PUBLIC_ANALYTICS_KEY`; both or neither, one
  alone fails the build). The address is a PDkef address and is not in the repo. A build without the
  variables sends nothing and keeps `connect-src 'self'`, so forks and CI send nothing. The CSP origin comes
  from `scripts/analyticsOrigin.mjs`, and `verify-csp.js` pins the exact `connect-src` list.
- Error reports, drop records and ratings go to `/api/report` only.

## Constraints that stand

Nothing leaves the device except anonymous, allowlisted events to PDkef's own addresses (and `/drive/`'s
Google calls, as today). Telemetry never blocks a tool, is best-effort and offline-silent. No file names,
contents, text, signatures, URL queries or fragments, or exception messages are sent. No cookies, no
accounts, no replay, no id that outlives a page load. On the device: the first-view and last-visit days,
nothing else.

## The list (agreed with the owner, 2026-11-12)

Carried as buckets, never raw values. "Fix this" reads the 75th percentile per tool.

| Measure | Where | Buckets | Fix this when |
| --- | --- | --- | --- |
| Requests that reached the network (`net`) | `tool_page_viewed`, Resource Timing, `transferSize > 0` | `0`, `1`, `2-5`, `6-15`, `16-30`, `31-50`, `51+` | a returning view above 1 (read apart from new views, by `visit`) |
| Requests answered on the device (`local`) | `tool_page_viewed`, Resource Timing, worker or cache | same | context only |
| Largest contentful paint (`lcp`) | `tool_page_viewed`, PerformanceObserver | `le1s`, `le2.5s`, `le4s`, `gt4s` | above 2.5 s |
| Tool ready (`ready`) | `tool_page_viewed`, the island's mount | same | above 2.5 s |
| Time to open a file (`ms`) | `tool_file_accepted` | same | above 2.5 s |
| Export time (`ms`) | `tool_result_ready` | same | above 4 s |
| Interaction to next paint | not yet | `none`, `le200ms`, `le500ms`, `gt500ms` | above 200 ms |
| Layout shift | not yet | `le0.1`, `le0.25`, `gt0.25` | above 0.1 |

**When the ping is sent: at load, as today (owner, 2026-11-12).** Interaction speed and layout shift are only final
when a person leaves; carrying them would mean sending the ping when the page is hidden, which some phones drop,
so the view count would read low by an amount nobody can measure. They wait, together with that timing question. The page-view ping is sent once the page has loaded, so its request
counts cover the page's own load (a worker's install runs in the worker and is not in the page's Resource Timing).

**One request per page view is not reachable while Vercel Web Analytics stays**, and it stays for now (owner,
2026-11-12): its `view` is the second billed request of a returning view. Code sends one `/api/report` per page view
already (the "twice" above was that ping and Vercel's `view`, measured live).

## Done when

- The cohort says how long since the first view.
- A day of real traffic shows the funnel, the cohort and the speed measures per tool, readable by an agent
  without a hand-written report.
- A returning visitor's page view costs no billed request for measurement.
- No service address or key is in the repo, the privacy words and CSP guards say what is true, and
  `npm run check:push` is green.
