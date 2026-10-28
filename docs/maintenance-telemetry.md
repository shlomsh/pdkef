# Anonymous maintenance telemetry

PDkef processes PDF files, typed text, signatures, filenames, and saved drafts only in the browser. The hosted production site also uses Vercel Web Analytics for page views only. Four tool lifecycle events (`tool_file_accepted`, `tool_operation_started`, `tool_result_ready`, `tool_operation_failed`, each carrying only the tool's name) Sign's two maintenance events, the page-tree repair, the service worker's `sw_install` and, since SEO-46, the star rating `tool_rating` and its optional comment (see "Star ratings" below) go to PDkef's own address, `/api/report`, the same one error reports use. Every event is sent, with no sampling, up to 20 Sign maintenance events and up to 40 lifecycle events per page, and the endpoint stops counting for the day past its daily cap of 1,000 for error reports and Sign events and a separate daily cap of 3,000 for the lifecycle events. Delivery is best-effort: offline browsers make no telemetry call, delivery failures are ignored, and no event is queued. The one thing kept on the device is the service worker's own record: when it cannot finish installing it leaves a reason code and a count bucket in Cache Storage until a page reports it, and nothing else is stored.

There are two Sign maintenance events (the page-tree repair and `sw_install` are described after them). The first is `sign_export`. Its allowlisted fields are the outcome (`success` or `failure`), one coarse duration bucket (`under_1s`, `under_5s`, `under_30s`, or `30s_or_more`), and, only for failures, one stable error code (`unsupported_text`, `cancelled`, `invalid_document`, or `processing_failed`). The client never sends a PDF, bytes, filename, document or user ID, text, signature image, URL query/fragment, exception message, stack, or custom error fields.

The second is `sign_form_detection`, one event per document opened in the Sign tool, when the on-open form-field check finishes. Its allowlisted fields are the outcome (`success` or `failure`), one coarse count bucket on success (`none`, `one_to_five`, `six_to_twenty`, or `over_twenty`), optionally one `page_kind` on success (`text`, `vector`, `image`, or `none`: whether page 1 has a text layer, line or box ink, only an image, or none of these), and, only for failures, one stable error code (the four above, plus `modules_unavailable` for a detector whose own chunks never loaded and `not_started` for a run whose inputs were not all present, which throws nothing at all). It exists because a check that finds nothing and a check that never ran were indistinguishable from outside, which let a total detection failure ship unnoticed, and because a browser still being served a shell cached from before a deploy turns a working detector into a permanent silent zero. `page_kind` (FORM-35) is there to learn how often Sign opens scans before we build anything for them. It is decided on the device from the page's own content stream and text layer, and is never document content. No field label, filename, page count, document text, page dimension, exception message, or raw field count is sent; the client cannot express them at this boundary. The captured exception itself never reaches telemetry at all: it is sanitised separately (`src/tools/sign/lib/formDetectionDetail.ts`) for the person's own console and for the bug report they may choose to open.

The service worker's event is `sw_install` (MEM-24). A worker that cannot install, or cannot finish its precache, would otherwise fail without anyone seeing it, and a person would simply find the site not working offline. The worker itself sends nothing: it leaves a small record in Cache Storage, and the next time a page loads it reports that record once per build. It carries the outcome (always `failure`), a reason code (`other_build`, `manifest_unreadable`, `storage`, `root_unreachable`, `root_mismatch` or `files_missed`) and a count bucket of files missed (`0`, `1`, `2-5`, `6-20` or `21+`). Nothing from the device and no URL travels with it, and the endpoint rejects any other value or extra field. It is counted as `sw_install|failure|<reason>|<bucket>|<browser family>`, so `errors:read` shows it as its own row.

The Sign events are sent as a same-origin beacon and counted by the endpoint in the same Upstash Redis database as error reports, as daily counts by browser family and version (like `ios-17` or `chromium-140`), with no sample, no IP address and no full user agent, and deleted after 90 days. They count toward the same daily cap as error reports. `npm run errors:read` prints them under "Sign maintenance events".

The four lifecycle events are also sent as a same-origin beacon to `/api/report`, and are kept as daily counts per event and tool (no browser family, no sample, no IP address), deleted after 90 days, under their own daily cap of 3,000. `npm run errors:read` prints them under "Tool usage". The first event of its kind from a tool in a page load also carries `nav` (DEBT-57): how that page load started, as the browser's navigation timing names it (`navigate`, `reload`, `back_forward` or `prerender`). It tells one visitor reloading from many arriving and links no page load to another; `errors:read` prints it under "How page loads that opened a file started".

Vercel Web Analytics is the reviewed transport for page views only. Its analytics documentation describes anonymous aggregate collection without cookies; the dashboard reporting window is plan-dependent (one month on Hobby, twelve months on Pro, and twenty-four months on Web Analytics Plus/Enterprise as of 2026-09-04). PDkef does not configure Analytics Drains, so page views have no additional destination. Reassess the provider, retention, event allowlist, and this disclosure before adding an event or changing a field.

## Star ratings

When a file has been downloaded, a tool may ask for a rating with five stars. A tap sends one event, `tool_rating`, carrying only `{tool, stars}`: the tool's name from the same closed list as the lifecycle events and a whole number from 1 to 5. After the stars a person may add a few words; if they send them, a second event, `tool_rating_comment`, carries `{tool, stars, comment}`, the comment as typed, trimmed, up to 500 characters. Since SEO-48 the server also keeps, with each rating and comment, the country and region (a state or province) that Vercel reports for the request, and the day. No IP address, city, browser family, user agent, identifier or finer time is stored. The schema is `src/lib/telemetry/ratingSchema.ts` and the store is `src/site-lib/ratingStore.ts`.

The server keeps one count per tool and star value, in the same Upstash database, under `rating:<tool>`, and one record per rating or comment, `{tool, stars, day, country, region, comment}`, in the list `rating:entries`, trimmed to the latest 10,000. Unlike everything else on this page neither is deleted after 90 days: an average only means something over a long time. `npm run ratings:read` prints both. Ratings from before SEO-48 (2026-10-26) are counts only, with no record. Ratings and comments share their own daily cap of 300; past it a vote or comment is dropped silently, and a body that is not a valid rating is counted as a reject like any other.

The limit of one vote per tool per device is a marker kept in the browser's own storage. It stops accidents and casual repeats, not someone who clears it or posts to the address directly, so the tally is not fraud-proof. The aggregate is read from the store at build time and published on a tool's page only from 50 votes, so a handful of ratings never show as a badge or in the page's structured data.

## Anonymous error reports

Separately from the Sign events above, when something in our own code breaks in a tool, the browser may send one small anonymous report to pdkef.com's own address, `/api/report`. It is a same-origin beacon POST, so `connect-src 'self'` is unchanged. The schema is `src/lib/telemetry/errorReportSchema.ts`, the browser side `src/lib/telemetry/errorReport.ts`, and the endpoint is `api/report.ts`.

A report holds: the area of the app that failed (one of a fixed list), the error's name (like `TypeError`), the chain of positions in our own published JavaScript that led there (up to 8, each a file name and line number), a short label our code gives the step it was doing (like `export` or `render_thumbnail`), the page's path (like `/sign/`, never a query or anything after it), whether PDkef is installed as an app, whether a service worker served the page, roughly how long the page had been open (under 10 seconds, under a minute, under 10 minutes, or longer), and `actions` (DEBT-31): the last up to 10 things the person did in the tool, oldest first, as names from the closed list `ACTIONS` in `src/lib/telemetry/errorReportSchema.ts` (`add_files`, `replace_file`, `remove_file`, `clear_all`, `open_recent`, `undo`, `redo`, `reorder`, `sort`, `rotate`, `hide_page`, `delete_page`, `select_pages`, `change_setting`, `arm_tool`, `place_mark`, `move_mark`, `resize_mark`, `edit_mark`, `delete_mark`, `draw`, `detect_fields`, `fill_field`, `zoom`, `fullscreen`, `export`, `download`, `share`). An immediate repeat of the last name is recorded once, so the trail shows sequence, not counts, and a drag cannot push the history out of the ring of `MAX_ACTIONS` (10). A report from an older build without `actions` is accepted and stored with an empty list. A report also carries `build`, the first 7 characters of the commit the page was built from (like `abc1234`), read from a `Server-Timing: build;desc="<sha>"` header that `middleware.ts` puts on every page response (MEM-19; no page's HTML carries it, so a deploy changes no page bytes) and the page reads off its own navigation entry. It names the release, a position in our own history, nothing about a document or a person. It is optional: a cached older build, or a deploy with no commit, sends none, and it only travels beside `actions`. With it, `npm run errors:resolve -- <frames> --build <sha>` rebuilds that one commit instead of searching history. Names only: no file name, count, position, text or anything from a document. The trail (`src/lib/telemetry/actionTrail.ts`) lives in memory for the life of the page and is read only when an error is reported. It never holds the error's message, anything from a document, a filename, text, a signature, an IP address, or an identifier.

The server keeps daily counts of identical reports, plus the latest full example of each distinct error per day (including its `actions`), with a coarse browser family and major version (like `ios-26` or `chromium-140`) taken from the request. An iPhone browser other than Safari is named with its iOS version (DEBT-57): `ios-chrome-18+`, `ios-google-18+` (the Google app), `ios-firefox-18+`, `ios-edge-18+`, or `ios-app-18+` for any other in-app browser. They are stored in an Upstash Redis database connected to the project through Vercel, and deleted after 90 days. No IP address is stored.

When an error has no position in our own code, the browser sends a drop record instead of a report (DEBT-44): the area, step, a coarse type, a name from a closed list and the build. Since DEBT-57 it also carries `cause`, what the error's message says happened, matched on the device into a closed list (`module_load`, `network`, `file_read`, `memory`, `other`); the message itself never travels.

Each distinct report is sent at most once per page load, and at most 10 per page. Nothing is sent when offline, a report never blocks or slows a tool, and failures are ignored.

## The store, and what to do when it outgrows the free plan

Decided 2026-10-21: stay on Upstash. Everything above is counted in one Upstash Redis database,
created through the Vercel Marketplace and reached over Upstash's REST protocol only: plain `fetch`
POSTs to `${KV_REST_API_URL}/pipeline` with a Bearer token (`api/report.ts`,
`scripts/errors-read.mjs`), no SDK. At the time it held 105 keys, about 3.5 KB per day of usage
counts. Commands per event and the monthly worst case are budgeted in the comment at the top of
`src/site-lib/errorReportStore.ts`.

The free plan allows 500K commands a month. Past that, every command fails with
`ERR max requests limit exceeded` until the month turns, so counting stops; it does not slow down.
Funnel version 2 (DEBT-58) sends a page view on every tool page load, so this arrives sooner as
traffic grows. `errors:read` warns when a day reaches its own daily cap.

What we found when we looked for more room (prices read on 2026-10-21; check them again before acting):

| Option | Command limit | Cost at about 600K commands a month | Change needed |
| --- | --- | --- | --- |
| Upstash pay-as-you-go, same database | none, billed per use | about $1.20 ($0.20 per 100K, no free 500K once paid) | none: same database, same env vars |
| Upstash Fixed 250 MB | unlimited | $10 a month flat | none |
| Redis Cloud (formerly Redis Labs) Essentials free | none; 30 MB, 30 connections, 100 ops/sec, 5 GB bandwidth | $0 | a Redis client (`redis` or `ioredis`) in place of `fetch`, or a self-hosted REST proxy |
| Own Redis + `hiett/serverless-redis-http` proxy on Railway | none | about $5 a month (estimate) | two services to run and keep up |

No other host speaks Upstash's REST protocol, so nothing else is a true drop-in.

When the cap starts to bite, the plan is Upstash pay-as-you-go on the same database:

1. Add a payment method. Check first whether this Marketplace-made account takes it in the Vercel
   dashboard (Storage, then the database) or in the Upstash console; that was not confirmed.
2. Expect a 1 to 2 second blip while it switches. Adding a card moves every free Upstash database on
   the account to pay-as-you-go, not only this one.
3. Set a monthly budget on the database (a few dollars) so a bug cannot run up a bill; at the budget
   it is throttled, not charged.

Sources: upstash.com/pricing/redis, upstash.com/docs/redis/howto/upgradedatabase,
upstash.com/docs/redis/troubleshooting/max_requests_limit, and Redis Cloud's Essentials plan details
on redis.io (plan table updated December 2025).
