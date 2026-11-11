# Request budget: delivering PDkef in far fewer requests

*Drafted 2026-11-11, revised the same day after an independent architecture review and Shlomi's calls on
telemetry and worker timing. Status: accepted 2026-11-11 ("proceed with the plan"), building as MEM-33..38.
MEM-39 (2026-11-11) then moved the worker's install to after a file is opened, see D2 and D6; MEM-40 (2026-11-11) stopped it installing the home page as an offline fallback, see D11; MEM-43 (2026-11-12) made tool pages register on their first visit, see D2 and D6.*

## The problem

PDkef is hosted on Vercel's Hobby plan, which includes 1,000,000 CDN requests a month and pauses the
site when they run out (no overage billing). On 2026-11-10 Vercel reported 75% used, ten days into the
month. Vercel counts **requests, not bytes**, and the hosting plan stays as it is for now, so the delivery
design has to fit the request budget on its own.

The current design was tuned the other way round. MEM-19, MEM-25 and MEM-31 kept every module its own
small, stably named file so that a deploy re-downloads as few **bytes** as possible, and MEM-15 made the
service worker precache the whole app, every page included, on the first visit. Both multiply requests.

### Measured (2026-11-11, production, one fresh headless Chromium load each)

| Page | Page requests | Service worker precache | Total |
| --- | --- | --- | --- |
| `/` | 46 (42 by `load`) | 253 | ~299 |
| `/redact/` | 72 (65 by `load`), 60 of them JS | 253 | ~325 |

- The build emits 125 `/shared/*.js` chunks; 66 are under 2 KB (`merge.js` is a 254-byte icon).
- `/shared/` and `/site/` are served `public, max-age=0, must-revalidate`; only `/_astro/` is immutable.
- The worker's install fetches unhashed files with `cache: 'no-cache'`, so it requests again every
  file the page has just loaded.
- The precache list (251 URLs) holds 56 HTML pages (every guide and every `/he/` page), 4 icon sizes,
  3 pdf.js codec wasm files, `sample.pdf`, a guide video poster, `404.html` and the Google site
  verification file, besides the code.
- Each page view also costs Vercel Web Analytics (two scripts and an event), `/api/notes`, and one
  `/api/report` beacon per lifecycle event (a Redact job sends about five).
- MEM-32 (landed 2026-11-10) stopped deploys from re-downloading unchanged files on returning
  visitors; it does not touch the first visit.

Which project: the team Usage page's CDN Requests by project for the billing period Oct 12 to Nov 11
(770,689 of 1,000,000) gives pdkef 713,861 (92.6%), a deleted pdkef Drive test deployment 9,069 (1.2%),
shellysgphyisio 39,058 (5.1%), netta-shemesh 7,424 (1.0%) and the rest about 1,100. The budget is shared by
every project on the team, and pdkef is the one to fix.

Cross-check: about 280 page loads a day at about 300 requests each is about 84,000 a day, the pace
Vercel warned about.

### Who the visitors are (telemetry `errors:read --days 28`, and Shlomi)

| Tool | Page views | Share of tool views |
| --- | --- | --- |
| Redact | 2,482 | 68% |
| Sign | 269 | 7% |
| Merge | 207 | 6% |
| Compress | 191 | 5% |
| Highlight | 141 | 4% |
| Scan | 122 | 3% |
| Edit PDF, Image to PDF | 79, 65 | 2% each |
| Unlock, Split, Compress Image, PDF to Image, Protect | 117 together | under 1% each |

Home had another 1,986 views. Most visitors are new, use one tool (a few up to three) and do not come
back daily. Telemetry has no identifier, so which tools one person combines cannot be measured. Code
churn is expected to drop sharply now that a long run of cleanups is done.

## Goals

1. A new single-tool visitor costs **about 20-25 requests**, down from about 300.
2. **The tool is the unit**, over a small common layer, in **no more than 10-15 bundles**.
3. A change confined to one tool never makes a visitor of another tool download anything. (A change in
   the common layer or the PDF engine still reaches everyone; that is accepted.)
4. Keep every invariant in `CLAUDE.md`: no file bytes leave the device, CSP `connect-src 'self'`,
   the SEO shell stays static HTML, Nx boundaries, offline once provisioned.

## The decision this plan needs first

**What does "works offline" promise?** The site copy says, from MEM-15, "install it once and every tool
works offline", and an e2e case pins it (a fresh visit to `/` alone makes `/compress/` and `/he/merge/`
open offline). Keeping that promise means precaching every tool page's HTML as well as all the code,
because an offline visit to a page the worker does not hold is answered with `/` (`sw.js`:
`if (!fresh) return cache.match('/');`), so cached code without its page is useless.

| | Every tool offline (today's promise) | Tools you have used offline |
| --- | --- | --- |
| Worker install for a new visitor | ~40-50 requests (bundles plus ~25 tool pages) | ~5-8 requests |
| New Redact visitor in total | ~55-65 | ~20-25 |
| Copy and e2e | unchanged | rewrite the offline lines (2 content files plus MEM-15's list) and the e2e case |

Recommendation: **tools you have used work offline.** It matches how people use PDkef (one tool, rarely
back) and is still true and useful. The steps below assume it; under the other choice, step 2 changes and
everything else stands.

## Plan, in build order

### 0. A request-count guard first

On the production build, count what a fresh load of `/`, `/redact/` and `/sign/` requests, page plus
worker install, with a budget per page (like `test:weight`), and have the nightly update-cost job (MEM-21)
report requests beside bytes. Every later step is measured against it.

### 1. The worker stops re-downloading what the page just loaded

At install, fetch with `cache: 'force-cache'` first and check the bytes against the manifest hash (MEM-22
already does the check); fall back to today's fresh fetch (and MEM-29's reload) only on a mismatch or a
miss. All three engines accept a stale cached entry under `force-cache`, and the hash check makes that
safe. It helps `/site/` and `/shared/` (`/_astro/` already hits the HTTP cache) whenever the entry
survived in the HTTP cache.

### 2. Precache the tools a person uses, not the whole app

- **Install** caches `/` as one document (`REQUIRED_URL`, which `root_unreachable` and
  `root_mismatch` rely on; MEM-40: kept for the build check, no longer an offline fallback), the shell, and the closure of each tool page open at install time. The worker
  finds those pages itself with `clients.matchAll({ includeUncontrolled: true })`, which `sw.js` already
  uses, so the install needs no new message or per-page script URL.
- **A tool opened later** is cached as it is used: its page and code go into the current cache on first
  load, as fonts already do.
- **An update** re-precaches the closures of the tool pages the previous cache holds, so a returning
  visitor keeps exactly the tools they used. With MEM-32 the unchanged files are copied, not fetched.
  Without this, activate's `caches.delete(key)` would drop every runtime-cached page on each deploy.
- Guides, `/he/` pages a person never opened, extra icon sizes, `sample.pdf`, guide media, `404.html`,
  the verification file and the codec wasm leave the precache list.
- (Superseded by MEM-39, D6: registration now waits for a file.) The worker still registers on page load, after idle, as MEM-17 does: waiting for a file to be opened
  saves only a few requests once this step lands, and would put the install in the busiest moment, stop
  Android's share target (answered only by the worker) for new visitors, and change the update path.

### 3. Telemetry and page trims

- `/api/notes` (done, MEM-36): approved notes are baked in at build time, as the star rating already is (SEO-58); deploys
  are frequent enough to keep them fresh. One request and one function call less per visit.
- Vercel Web Analytics: our own funnel already counts page views per tool. Dropping it saves two or
  three requests per page view (10-15% of the new target) but loses referrers and countries. Shlomi's
  call.
- Lifecycle beacons **stay one per event**. A tab killed by the system (iOS running out of memory on a
  large PDF) would lose a batch, and `started` without `ready` is how a crash shows in the funnel. The
  saving would have been one or two requests.
- `refreshNavigation` in `sw.js` refetches the page on every cached navigation; skip it when the cached
  page is this build's (its hash matches the manifest).

### 4. Bundle by tool, incrementally

Grouping makes a chunk eager as soon as any member is statically reachable, in `manualChunks` and in
`advancedChunks` alike. This already happened once: a pdf.js entry "folded Vite's `__vitePreload` helper
into it, ... all 421 KiB became eager" (`astro.config.mjs`). So, in this order, each step measured by the
step 0 guard and the lazy-modules guard:

1. **Re-key `check-lazy-modules.js`** to the new group names before renaming anything.
2. **Merge the tiny chunks**: Rolldown `advancedChunks` with a `minSize`, which merges small chunks
   without crossing lazy boundaries. Most of the 60 JS requests on `/redact/` are these.
3. **Split out `editor-core`** (about 110 KB, shared by Sign, Redact and Highlight) as its own group, so
   no editor tool carries another tool's code.
4. **Tool groups**, only where the guard shows a gain:

| Bundle | Contents |
| --- | --- |
| `common` | Preact, hooks, signals, shell, the non-PDF part of `src/lib` |
| `site` | home and guide islands |
| `pdf-lib`, `pdfjs` | kept as today, lazy, never grouped with eager code |
| `editor-core` | shared by Sign, Redact, Highlight |
| `redact`, `sign`, `highlight`, `scan` | each tool's own code |
| `light-tools` | Merge, Split, Organize, Rotate, Remove pages, Extract, Add page numbers, Compress, Compress Image, Image to PDF, PDF to Image, Unlock, Protect, Edit PDF |

Names stay stable (`/shared/<group>.js`, MEM-25/31). A change in `common` can still change the bytes of
its importers when export names move; that is the accepted cost of goal 3's exception.

## Expected result

| Visitor | Today | After 0-4 |
| --- | --- | --- |
| New, opens a file in Redact | ~325 | ~20-25 |
| New, leaves without opening a file | ~300 | ~15-20 (~12-15 without Vercel Analytics) |
| Returning, worker installed | MEM-32: changed files only | changed files of the tools they use |

## Risks and trade-offs

- **Offline narrows** to the tools a person has used on this device. Copy and the MEM-15 e2e case change
  with it.
- **Bigger updates per change** once tool groups land: a change in Sign re-downloads `sign` (~350 KB).
  MEM-21's 500 KB byte target needs re-basing alongside the new request count.
- **Eager drift**: a grouped chunk can turn lazy code eager; step 4.1 and the guard catch it.
- **Old caches**: the first deploy of step 2 meets caches built by the whole-app install; the update path
  must treat their tool pages as "held" and keep those tools.

## Decisions and the assumptions behind them (revisit 2026-12-11)

Each decision below rests on assumptions that were true, or believed, on 2026-11-11. On 2026-12-11 check
each assumption against the figure named, and reopen the decision if it no longer holds.

| # | Decision (2026-11-11) | Assumption it rests on | Check on 2026-12-11 |
| --- | --- | --- | --- |
| D1 | Stay on Vercel Hobby and fit the 1M monthly request budget by design | The plan brings usage well under 1M a month with room for growth | Vercel usage page: CDN requests per day after the steps landed, against the ~33K a day the budget allows |
| D2 | Offline covers the tool pages a person has visited, not every tool and not every other page view (Shlomi, "proceed with the plan"; narrowed by MEM-39, 2026-11-11, then widened to the visited tool page by MEM-43, 2026-11-12: every tool page says airplane mode still works, and measured live a first-time visitor who went offline and picked a file got "This PDF didn't open" on Redact, Sign, Merge and Compress) | Most first visits never return; a person who opens a file is the one who benefits from offline | Share of page loads served by the worker (returning) vs fresh; returning-visitor share rising, or any report or note about a tool not working offline after only being viewed |
| D3 | The tool is the unit, over a common layer, in 10-15 bundles | Code churn drops sharply after the November cleanups, so per-tool bundles rarely re-download | Deploys per day (`main` first-parent pushes; 44 a day on 2026-11-01..10) and MEM-21's nightly update cost |
| D4 | Bundles are cut by the usage table (Redact 68%, Sign 7%, Merge 6%, Compress 5%, the rest light) | Tool shares stay close to the 28-day read of 2026-11-11 | `npm run errors:read -- --days 28`: any light tool above ~5% may earn its own bundle |
| D5 | Lifecycle beacons stay one per event (Shlomi) | The crash signal (`started` without `ready`) is worth 1-2 requests per job | Whether the funnel still drives fixes; beacon requests as a share of the total |
| D6 | The worker registers on a tool page at its first visit (the page carries `data-tool-page`; MEM-43, Shlomi 2026-11-12, accepting about +26 requests on a first visit to Redact), and on every other page only once a file has been opened in a tool (`pdkef:file-opened`, MEM-39), then at load on later visits; a device that already has the worker keeps it, the installed app registers at launch, and `appinstalled` also triggers it (Shlomi, MEM-39, 2026-11-11; replaces the MEM-17 timing) | The install is about 34-40 of a first visit's requests, and most visitors use one tool once; measured on the bundling branch, `/redact/` first visit 72 requests with the install and about 32 without (about 60 and 26 with the stub-script step) | Step 0 guard: first-visit and after-a-file-opened budgets; returning-visitor share; reports of offline failing after a first view; Android share-target use by new visitors |
| D7 | Vercel Web Analytics stays for now (open: Shlomi's call) | Referrers and countries are worth 2-3 requests per page view | Whether anyone read Vercel Analytics in the month; its share of requests |
| D8 | Approved notes are baked in at build, not fetched from `/api/notes` | Deploys are frequent enough that a new note shows within hours | Same deploy rate as D3: if deploys slow to a few a week, notes go stale and this needs a scheduled rebuild or the fetch back |
| D9 | Precache leaves out guides, unopened `/he/` pages, extra icons, `sample.pdf`, guide media, `404.html`, the verification file and codec wasm | Nobody needs those offline before opening them once | Reports of an offline page falling back to `/` |
| D10 | Traffic baseline: ~280 page loads a day, ~300 requests each before the plan | The 2026-11-11 measurement is representative | Page loads a day from the funnel; step 0 guard's per-page counts |
| D11 | The install downloads only what the page asks for: `/` is one document kept for the build check, and the home page's other files come only when `/` is itself open or held; an offline, uncached page is answered with the home page only if the person opened it (else the browser's own offline page) (Shlomi, MEM-40, 2026-11-11; replaces MEM-35's always-complete `/` fallback) | Offline matters for tools a person opened, and the home page's 9-12 files per tool visit were bought for a fallback nobody asked for; measured after a file is opened: `/redact/` 36 to 33 requests, `/sign/` 35 to 30 | `test:request-count` after-open budgets; reports of a blank browser offline page where the home page used to appear |
| D11a | The home page is cached when the app is installed (`appinstalled`, or an installed app or remembered install at load sends `pdkef:cache-home`), because the installed app starts at `/`; `/` is held at an update only when its whole closure is cached (Shlomi, MEM-40 review, 2026-11-11) | A tool-only person's update no longer pulls the home page (a bare `/` document is not "held"), while an installed app still opens offline | e2e `offline-workflows` and `app-update` specs; `test:request-count` unchanged (the install adds no first-visit request) |

## Not taken, and why

- **One beacon per page**: loses the crash signal (step 3).
- **Registering the worker only after a file is opened**: first set aside as a small saving once step 2 landed, then taken as MEM-39 once the measurement showed the install is still about 34-40 requests of a first visit (D6).
- **`inlineStylesheets: 'always'`**: already `'auto'`; MEM-27 measured 'always' at 787 KB per CSS edit.
- **A short `max-age` on `/site/` and `/shared/`**: little gain while the worker answers returning
  visitors, and a version-skew risk (MEM-28).
- **A CDN in front of Vercel**, or another host: the biggest lever of all, set aside while the hosting plan
  stays as it is.
