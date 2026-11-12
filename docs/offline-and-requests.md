# Offline first, few requests: the reasoning and how to re-check it

Read this before changing what a page loads, what the service worker installs, how client code is bundled, or
any caching header. It records what was decided on 2026-11-11 and 12, why, the assumptions each decision
rests on, and how to measure whether those assumptions still hold. [request-budget.md](./request-budget.md)
is the original plan and its dated decision table; this file is the reasoning a future reader needs.

If an assumption below has stopped being true, the decision that rests on it is open again. That is the
point of writing them down.

## The stance

PDkef works like an app you install on a phone, without installing anything. No signup, no account, no
backend. Working with no connection is a main reason to choose it, and the tool pages say so in plain words:
"Turn on airplane mode and give it a try. It still works."

Two consequences follow, and both are the owner's call:

1. **Opening a tool means you intend to use it.** So a tool page fetches everything that tool needs on the
   first visit, whether or not a file is opened. Like an app, that downloads more than a quick look needs.
2. **Only that tool.** The home page, article pages and other tools are not fetched ahead of need. The unit
   of eager download is one tool.

When offline readiness and fewer downloads pull against each other, offline wins. What we optimise inside
that choice is the number of requests.

## The constraint

The site is on Vercel's Hobby plan: 1,000,000 CDN requests per rolling 30 days, and the project pauses when
that is exceeded. There is no monthly reset: each day the day from 30 days ago drops out and today is added.
On 2026-11-12 the count was 774,836, about 93% of it PDkef.

| Read on | Window | 30-day total | Newest whole day | Days about to drop out |
| --- | --- | --- | --- | --- |
| 2026-11-12 | Oct 13 to Nov 12, 3am | 775,714 | Nov 11: 32,395 (Nov 10: 32,758, Nov 9: 29,401) | Oct 13: 7,836, Oct 14: 20,140, Oct 15: 21,667, Oct 16: 9,847 |

Not yet turning down: the days leaving the window are smaller than the days entering it, so the total rises
until a day costs less than the one it replaces. MEM-43/44 landed on 2026-11-12, so Nov 11 is before them.
Read it the same way (Usage, CDN Requests, Last 30 Days, hover a bar for its day) and add a row.

The bill is per request, not per byte. That is why this work counts files, and why a 300 KB file and a 26
byte file cost the same.

| Kind of request | Counts toward the 1,000,000? | How sure |
| --- | --- | --- |
| A static file, whoever asks (page or worker) | Yes | Vercel docs: "Static assets and functions all incur CDN Requests" |
| A call to our function `/api/report` | Yes, and it is a function invocation too | Same sentence |
| A 304 "has it changed?" re-check | Yes, very likely | The docs list 304s as something to reduce; no explicit sentence |
| Vercel's own analytics script and pings (`/_vercel/...`) | Probably | The docs are silent |
| A file answered by the worker or the browser cache | No | It never reaches Vercel |

## Three visitors, three costs

Measured on the live site in a fresh browser, telling real CDN hits from on-device reuse by each response's
`x-vercel-id` (see "How to measure").

| Visitor | Requests that reach Vercel | Notes |
| --- | --- | --- |
| First visit to a tool (Redact) | about 43 to 46 | The page, then the worker installs the tool |
| Returning, has visited a tool before | about 2 per page view | Both are measurement pings; every file comes from the worker |
| First visit to the home page or an article | about 20 to 23 | No worker is registered on these pages |

Before this work a first visit to Redact cost about 325, then about 110 after the first round of fixes.

The whole cost is in first visits. A returning visitor is nearly free, so everything here is about making a
first visit cheap without giving up offline.

## What a first visit to Redact downloads

About 1.15 MB compressed in about 46 files (2026-11-12, by kind):

| Part | Files | Compressed | Why it is there |
| --- | --- | --- | --- |
| The page | 1 | 19 KB | |
| Stylesheets, first paint | 6 | 27 KB | One per CSS-carrying script chunk |
| Tool code, first paint | 3 | 171 KB | `redact-tool`, `editor-core`, `tools-common` |
| Site and UI glue, first paint | 8 | 33 KB | `site`, the UI library, small shared pieces |
| Images, font, app manifest | 6 | 93 KB | Favicon, video poster, flag sprite, logo, one font |
| Measurement | 4 | under 3 KB | An analytics script and three pings |
| PDF engine, installed in the background | 3 | 680 KB | Reader, its worker script, writer |
| Late code, installed in the background | 6 | 61 KB | What loads when a file is opened or exported |
| Late stylesheets | 4 | 19 KB | |
| Small images | 2 | 4 KB | |
| The worker's own files | 3 | 37 KB | Worker script, file list, the home document as a build check |

Two things to take from this table:

- **The weight is the PDF engine**, about 60% of the bytes in 3 files. It is shared by every tool, so a second
  tool reuses it. It is the real price of offline and bundling cannot shrink it.
- **The count is small things.** 28 of the files are under 10 KB each.

## The rule for bundling: the sweet spot

Merging files does not change how much is downloaded. It changes how many requests carry it, and it changes
what a person downloads that they may not need, or downloads again.

**Merge when it removes several requests and the possibly-unneeded download it adds is well under 100 KB.**
The owner's words: if eager loading costs one extra script of 100 KB, it is a no-brainer.

What "possibly unneeded" means in practice:

- Code a page loads but does not use (a shared bundle that carries another page's code).
- Bytes a person who opens a second tool downloads again, because each tool now has its own copy.
- Bytes a returning visitor downloads again after an edit. File names carry no fingerprint (MEM-25, MEM-31),
  so an edit to any module re-downloads the whole file it lives in.

How the rule was applied:

| Decision | Requests | Cost accepted | Ticket |
| --- | --- | --- | --- |
| Group first-paint scripts by which pages load them | Redact 52 scripts to 11 | about 20 to 30 KB more first-paint script per tool page | MEM-37 |
| Drop the tiny stub scripts that only point at another file | about 12 per page | none; the stubs stay on the server for cached pages | MEM-37 |
| One late bundle per tool, plus shared late bundles | Redact 57 to 43, Sign 53 to 43 | an edit to Redact's late code re-downloads 11 KB, not 2 KB | MEM-44 |
| Keep Sign's font library in its own file | Sign 43 to 44 | one request, so an edit to Sign re-downloads 11 KB and not 279 KB | MEM-44 |
| One sprite for the rating board's flags | 9 to 1, then 0 on later pages | a note approved after a build has no flag until the next build | MEM-42 |

Where the rule said no:

- **The PDF engine stays three files.** The worker script must be its own file, and merging the reader and
  the writer would make read-only tools download a 223 KB writer they never use.
- **Redact's three big first-paint scripts stay three.** One file would save 2 requests, but 130 KB of it is
  shared with other tools, so a second-tool visitor would download it again.
- **The home page's bundle stays off tool pages**, and the UI library stays off pages with no interactive
  part. Both happened by accident during bundling and are now guarded.

## The next four merges (not built yet)

Estimated to take Redact from about 46 files to about 23, with the same bytes:

| Merge | Files saved | Cost | Unknown |
| --- | --- | --- | --- |
| All of a tool's styles into one sheet (MEM-47 built a narrower version: a page links the browser build's sheet in place of the page sheets it holds whole, `scripts/linkClientSheets.mjs`; Redact 2 fewer, Sign 3; live on 2026-11-12: /redact/ 31 requests, /sign/ 29) | 9 | a second-tool visitor re-downloads about 46 KB | Whether the build can do it inside the styling rules (`.claude/rules/styling.md`). Not checked. |
| A tool's late code into one file, including the shared late files | 5 | a second-tool visitor re-downloads about 45 KB | |
| The small UI glue scripts into one | 6 | about 14 KB of partly unused code | It must not put the UI library on article pages again |
| One usage ping, no Vercel analytics script | 3 | Vercel's analytics dashboard | MEM-45 decides this |

Measure after each one. The estimates are sums of today's sizes, not builds.

## When the worker registers, and what it installs

| Page | Worker registers | Installs |
| --- | --- | --- |
| A tool page | On the first visit (MEM-43) | That tool's files. Not the home page (MEM-40). |
| Home, articles, `/drive/`, `/open/` | Only if a file was opened before on this device, or the app is installed (MEM-39) | The open page |
| The install page | On the first visit | The open page |
| Any page, app installed | At launch | The home page too, so the app opens offline (MEM-40) |

A device that already has the worker keeps it and updates as before. The update protocol (MEM-10) did not
change.

## Caching headers

- Files under `/_astro/` carry a fingerprint in the name; the host serves them for a year, immutable.
- Scripts and styles under `/shared/` and `/site/` have stable names with no fingerprint. They are served
  `max-age=0, must-revalidate`, so without a worker every page view re-checks each one with a 304, which is
  billed. **Do not give them a long cache.** With several deploys a day, a long cache would let a returning
  visitor run an old script beside a new page.
- `/flags/` and `/favicon.ico` are cached for thirty days, immutable. That is safe for the flag sprite only
  because its name carries a fingerprint of its content, and for the flag files because they never change in
  place. Anything given a long cache needs one of those two properties.

## The assumptions, and how to check each

| # | Assumption | What rests on it | How to check | If it stops being true |
| --- | --- | --- | --- | --- |
| A1 | Most visitors are new, use one tool once and rarely return | Paying about 100 KB of duplication per extra tool; per-tool installs | The daily telemetry read (`docs/maintenance-telemetry.md`): share of page views with a worker in control, tools per person | Move shared styles and late code back into shared files; a second tool then costs less |
| A2 | Tools change rarely once they settle | Accepting bigger re-downloads after an edit | `git log --since` on `src/tools/<tool>/` against returning-visitor share | Split the tool's bundles finer, vendor code first |
| A3 | The bill is per request, not per byte | Counting files; merging small files | Vercel's plan page and the usage dashboard | If bytes are billed, the engine's 680 KB becomes the target and merging stops mattering |
| A4 | A 304 re-check is billed | Not relying on the browser cache for stable-named files | Compare a day's CDN request count with the day's page views and the file counts here | If free, repeat visits without a worker cost almost nothing and less urgency applies there |
| A5 | Entering a tool means intending to use it | The first-visit install on tool pages (about 20 extra requests) | Share of tool page views that open a file (the page-load funnel, by lane) | If most people leave without opening a file, install on file open instead (MEM-39's rule) and change the airplane line |
| A6 | Offline is a reason people choose PDkef | The whole stance | Installs, offline sessions, what people write in the rating notes | Then the install is cost without benefit; revisit from the top |
| A7 | We stay on the Hobby plan | Treating 1,000,000 as a hard wall | The plan | A paid plan turns this into a money question, not a survival one |
| A8 | Deploys happen several times a day | No long cache on stable-named scripts | `git log` on main | With rare deploys, fingerprinted names and long caches may beat stable names |

## How to measure

**The build's own count.** `npm run build && npm run test:request-count` prints first-visit and
after-file-open requests for `/`, `/redact/` and `/sign/` and fails over budget. It reads the built HTML and
the precache manifest. It undercounts the live number by about 3 to 9 per page: it does not see images,
fonts requested by CSS, or pings.

**Guards that keep the shape.** `npm run test:lazy-modules` (no late bundle at first paint, no tool listing
another tool's late bundle, the home bundle only on the home page, the UI library only on pages with an
interactive part), `npm run test:precache-budget`, `npm run test:weight`, and the build's own steps
`scripts/dropStubRequests.mjs` and `scripts/check-flag-sprite.mjs`, which fail the build on a dangling
reference.

**The live number.** Load the page in a fresh browser context with Playwright, with
`PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` so the worker's requests are reported, and read each
response's `x-vercel-id` header. Every real response from Vercel has a unique id; a response reused from the
browser's cache repeats an id already seen. Count unique ids. Keep such sweeps small: Vercel challenges
scripted traffic.

**By eye, in DevTools.** In the Network panel's Size column: a number is a download, `304` rows are billed
re-checks with almost no bytes, `(ServiceWorker)` and `(memory cache)` or `(disk cache)` never reached
Vercel. Use an incognito window for a first visit.

**The number that matters.** Vercel dashboard, Usage, CDN Requests, last 30 days. It is a rolling window, so
compare the newest day with the day about to drop out.

## Traps we fell into

Each of these cost hours on 2026-11-11 and 12.

- **A build without the real notes is not the production build.** Local and CI builds have no notes store
  token, so the rating board is empty. The flag sprite passed every check and went 404 in production because
  boards with different notes named different files. Build with the real store before landing anything the
  notes feed, and let the build fail on a reference to a file it did not write.
- **A worktree with a symlinked `node_modules` has not run `postinstall`.** It lacks the PDF codec files
  until `node scripts/sync-pdfjs-wasm.mjs` runs. A reviewer read that as a missing-file bug.
- **A stale `dist/` in the main checkout looks like evidence.** Check when it was built.
- **Tests on battery are not tests.** On battery at 25% the unit suite went from 74 seconds to 20 minutes
  with timeouts in different tests each run. Check `pmset -g batt` before believing a slow or flaky run.
- **One heavy job at a time.** One run of the unit suite uses most of the machine. Two agents running suites
  and builds together produced timeouts that looked like regressions.
- **Timing bugs need evidence from inside the worker.** Two fixes written from outside observation were
  wrong. The one that worked came after logging both workers' lifecycles with timestamps and forcing the
  failure on demand. Prove a test fails without the fix before trusting that it passes with it.
- **`page.waitForFunction(async () => ...)` waits for nothing.** Playwright treats the returned promise as
  truthy. Poll with `expect.poll(() => page.evaluate(...))`.
- **A guard that models the build can drift from what is billed.** Re-measure live after every landing.

## Owner decisions on the airplane lines (2026-11-12)

- **The home page installs nothing on a first visit, and stays that way.** A first visit to the home page
  carries no intent to use a tool: people who want a tool search for it or go to it directly, and the home
  page is a hub and an introduction. So its line "Turn on airplane mode and give it a try right now." having
  no worker behind it on a first visit is accepted, not a gap.
- **The airplane line on a tool page is true by the time anyone reads it.** The install finishes about 2 s
  after arrival (measured live), and the line sits far enough down that a person scrolling to it gets there
  later; most never scroll to it. Not a gap either.

## Still open


- The four merges above.
- MEM-45: see real-visitor performance without spending requests on it; one usage ping, not two.
- MEM-44's "Still open" list: no allowance for slow or metered connections on the first-visit install; the
  going offline in the seconds before the install finishes shows an error that blames the file; the offline
  test opens a file but does not export.
- MEM-41: guards that could pass on a half-working build.
- MEM-40: a completion pass can still bring the home page in.
- QUAL-55: a tab that finishes loading just after the worker takes control stays outside it until its next
  navigation.
- Re-read this file and the decision table in [request-budget.md](./request-budget.md) on 2026-12-11.
