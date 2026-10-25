# PDkef analytics approach

Last updated: 2026-10-21

## Purpose

PDkef is a local-first PDF tool. Analytics exist to improve whether people can
successfully use a tool, not to identify people or inspect their documents.
The working baseline observed on 2026-09-09 was low-volume, search-led traffic:
111 visitors and 593 page views over the displayed seven-day window. Redact and
Sign were the most visited tools, followed by Split and Compress.

This document is the decision log for analytics. Update it when an event is
added, removed, or its purpose changes; do not treat an analytics provider as a
reason to broaden this contract.

## Non-negotiable privacy boundary

Never send any of the following to an analytics provider:

- PDF or image bytes, document text, thumbnails, pages, metadata, file names,
  file sizes, passwords, signatures, annotations, or local-storage keys.
- Email addresses, accounts, persistent IDs, IP addresses, raw referrers,
  query strings, fragments, or raw browser error messages/stacks.
- Session replay, heatmaps, recordings, or user-level profiles.

PDkef has no accounts and needs no cross-day identity. Events are anonymous,
aggregate maintenance signals. The app must continue to work when telemetry is
blocked, offline, or unavailable.

## Provider and configuration

- **Web Analytics:** Vercel Web Analytics. Its page views remain configured with
  `beforeSend` to strip query strings and fragments.
- **Performance:** Vercel Speed Insights. It is enabled in the base layout and
  reports real-user Core Web Vitals; it does not change PDF processing.
- **Collection:** production only, best effort, no client-side queue, no
  sampling at current traffic. Revisit sampling only after volume makes the
  dashboard materially noisier or creates cost pressure.

The six tool lifecycle events (see the vocabulary below, each with `{tool}` and the few closed
properties listed there) go to
PDkef's own `/api/report` address as daily counts per event and tool (no browser
family), kept for 90 days under their own daily cap of 2,400 (`USAGE_DAILY_CAP`), and
read with `npm run errors:read` under "Tool usage" and "Funnel (page loads)". Vercel Web Analytics is the
transport for page views only. Sign's
two maintenance events (`sign_form_detection`, `sign_export`) are separate events.
They also go to `/api/report`, like error reports, and are kept
as daily counts by browser family and version for 90 days. The product does not depend on
event delivery.

The first event of each kind a tool sends on a page also carries `first: true`, which counts
page loads next to runs. It marks nothing about the person or the file.

## Event vocabulary, version 2 (DEBT-58)

Usage and the funnel are read from the same events. Usage is how many people had a tool in front
of them and how they got there; the funnel is what they went on to do. Each funnel stage is read as
page loads (the `first` event of its kind on a page), with run counts beside it for volume, so a
person who exports three times is one page load that finished, not three.

| Stage | Event | When it fires | What it answers |
| --- | --- | --- | --- |
| 1. Visited | `tool_page_viewed` | The tool page loads | How many came to the tool, and whether they had been before |
| 2. File in front | `tool_file_accepted` | A valid local input is accepted, by any route, a replacement over a loaded file included | Which tool visitors actually begin using, and how the file got there |
| 3. Worked on it | `tool_first_edit` | The first deliberate change to that file: an element added, moved or deleted in Sign or Redact, a page moved in Edit Pages, a list changed in Merge, an option changed in Split or Compress (Compress Image too). Once per file. PDF to Image, Image to PDF, Unlock and Protect have no such step and skip this stage | Whether the person engaged, which tells a return from a reload |
| 4. Asked for it | `tool_operation_started` | The person starts merge, compress, conversion, edit, unlock/protect, signing, or redaction, by a tap. Background builds that make a Download instant are never counted (Merge since MERGE-12, Split since DEBT-46, Compress since DEBT-59) | Where an engaged file becomes a request |
| 5. Got it | `tool_result_ready` | That request's output is delivered | Successful completions by tool |
| | `tool_operation_failed` | A processing operation reaches a known failure state | Aggregate failure pressure by tool |

Properties, each from a closed list and only where it says:

- `source`, on every event but the page view: how the file it is about arrived. `pick`, `drop`
  and `paste` (chosen here), `replace` (chosen over a loaded file), `recent` (a recent-file tile on
  the home page), `handoff` (another tool's done row, with `from` naming that tool on the accepted
  event), and `restore` (the tool reopened the work it was on, with nobody asking). Because later
  events carry it too, the fresh lane (everything but `restore`) and the resume lane (`restore`)
  read apart from daily counts alone.
- `visit`, on the page view only: `new`, or returning `today`, `week` (1 to 7 days), `month` (8 to
  30) or `older`. The browser keeps the day it last opened a tool page in its own storage and works
  the bucket out on the device; the day and the key never leave it, and no two events can be tied
  together by it.
- `first`, `nav` and `build` as before.

Sign also emits `sign_form_detection` once per opened document, when the
form-field check finishes: `outcome`, a coarse `field_count_bucket` on success,
an optional `page_kind` on success (`text`, `vector`, `image`, or `none`: whether
page 1 has a text layer, line or box ink, only an image, or none of these), and
one `error_code` on failure (`modules_unavailable` when the detector's own
chunks never loaded, which is what a shell cached from before a deploy does,
and `not_started` when the run never happened because its inputs were not all
there - the one outcome with no exception behind it).
It answers one question no other signal can - whether detection is coming back
empty in the wild, and whether it is empty because the document has nothing in
it or because the detector never ran. `page_kind` (FORM-35) tells us how often
Sign opens scans before we build anything for them; it is decided on the device
from the page's content stream and text layer and is never document content. See
`docs/maintenance-telemetry.md`.

Sign also retains its existing `sign_export` maintenance event. It is now
unsampled and uses only the fixed `outcome`, `duration_bucket`, and, on failure,
`error_code` values defined in `src/lib/maintenanceTelemetry.ts`. It is a narrow
Sign performance/compatibility diagnostic, not a second product-event schema.

The `tool` values are a closed list: `merge`, `split`, `edit-pdf`, `compress`,
`pdf-to-image`, `image-to-pdf`, `sign`, `redact`, `unlock`, and `protect`.

## Anonymous error reports (DEBT-17, DEBT-27)

Separate from the analytics provider: when something in our own code breaks in
a tool, the browser may send one small anonymous report to PDkef's own
`/api/report` address. It carries the failing area (a fixed list), the error's
name, the chain of positions in our own published JavaScript that led there (up
to 8, file name and line number each), a short label our code gives the step it
was doing (like `export`), the page's path (like `/sign/`, never a query or
anything after it), whether PDkef is installed as an app, whether a service
worker served the page, roughly how long the page had been open (under 10
seconds, under a minute, under 10 minutes, or longer), and the last up to 10
UI action names (DEBT-31) from a closed list, oldest first, kept in memory until
an error is reported, and the 7-character commit the page was built from
(optional). Never the error message,
anything from a document, a filename, text, an IP address, or an identifier.
The server keeps daily counts of identical reports, plus the latest full
example of each distinct error per day with a coarse browser family and
version (like `ios-26`), in an Upstash Redis database connected through Vercel,
and deletes them after 90 days. Each distinct report is sent at most once per
page load, at most 10 per page; nothing is sent offline, and failures are
ignored. `connect-src 'self'` is unchanged. Details:
`docs/maintenance-telemetry.md`.

Do not infer an individual funnel from these events. Vercel’s privacy model is
aggregate and visitors are only recognised for a day. Instead, compare aggregate
counts in a shared time window: accepted → started → result ready. With current
traffic, inspect at least a 28-day window before making a product decision.

## Operating questions and review rhythm

Once enough data exists, review monthly:

1. Which search/referrer and landing-page combinations bring people to a tool?
2. Which accepted-file flows do not reach `tool_operation_started`? Improve
   instructions, capability explanation, or primary actions there.
3. Which started operations do not reach `tool_result_ready`? Compare failures,
   browser/device breakdowns, and Speed Insights before changing the tool.
4. Which tool has the most completed work, not simply the most page views?
5. Do mobile Core Web Vitals or a specific browser correlate with weaker
   completion counts? Treat that as an engineering investigation, not proof of
   a user-level causal story.

At the current traffic level, do not optimise against a single day, a one-event
difference, or bounce rate alone. Write any material conclusion and the
resulting product decision in the `Decision log` below.

## Next approved layer

After this baseline has at least 28 days of data, consider only the following
additions if their question remains unanswered:

- `tool_output_action` with `tool` and a coarse `action` (`download` or
  `share`) to distinguish an output being ready from an explicit handoff.
- A fixed, reviewed `reason` property for high-volume failures. Add only codes
  that can be produced without reading document data; never send raw errors.
- An internal entry-point event for selected calls-to-action, using a fixed
  category rather than URLs or referrers.

## Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-09-09 | Use Vercel Analytics and Speed Insights; do not add PostHog/replay. | PDKef handles sensitive documents locally and needs aggregate product-health signals, not behavioural surveillance. |
| 2026-09-09 | Remove the 10% sampling rate for approved maintenance events. | Traffic is low enough that complete aggregate counts are more useful and remain within the privacy boundary. |
| 2026-09-09 | Start with four lifecycle events and one closed `tool` property. | This supports tool usage, aggregate funnel stages, success, and failure while minimising collection and keeping Vercel breakdowns usable. |
| 2026-09-13 | Merge (MERGE-12) counts `tool_operation_started` on the Download tap, `tool_result_ready` when that tapped download is delivered, and `tool_operation_failed` on each entry into its error state; pre-merges on idle are not counted. | The explicit Merge step was removed, so the person's intent now lives in the Download tap, which is what `tool_operation_started` measured before. Counting every idle pre-merge would inflate "started" with work nobody asked for (each list change restarts one) and make the accepted to started to ready funnel in MERGE-16 incomparable with the pre-change baseline. Flagged for Shlomi. |
| 2026-10-01 | Add anonymous error reports to PDkef's own `/api/report` (DEBT-17), outside the analytics provider. | Defects on a person's device were invisible to us. A report names only the area, the error name and the position in our own code, so it can point at a line without touching a document. |
| 2026-10-01 | Widen anonymous error reports (DEBT-27): the chain of positions in our code, a step label, the page path, installed, service worker and page age, and the latest full example of each distinct error per day. | A single position was too little to troubleshoot from. Every added field is a position in our own code, a closed list, a bucket or a flag; still never a message, a document, a filename, text, an IP address or an identifier. |
| 2026-10-01 | Move the four lifecycle events from Vercel custom events to `/api/report` (DEBT-28). | Hobby never recorded custom events, so the funnel had never been seen; daily per-tool counts on our own address keep the same allowlist and add no browser detail. |
| 2026-10-02 | Error reports carry the last 10 UI action names (DEBT-31). | A crash's trigger was inferred from code, not read from the report (the DEBT-30 Merge crash); closed list of names, no free text, in memory until an error is reported. |
| 2026-10-04 | Split (DEBT-46) counts `tool_operation_started` on the Download tap or a completed Share and `tool_result_ready` when that download or share is delivered; idle prepares after each option change are not counted. | Production showed 1 accepted, 6 started, 0 ready on 2026-10-04 from background rebuilds, which made the funnel unreadable. Same model as Merge. |
| 2026-10-21 | Funnel version 2 (DEBT-58): add `tool_page_viewed` with `visit` and `tool_first_edit`; every arrival is counted, with `source`; later events carry the source of their file. A first attempt that stopped counting restores was reverted the same day. | A restore is real usage and dropping it also dropped recent-tile opens and hand-offs, which arrive the same way. Shlomi's call: count everything, label the intent. `visit` is a coarse bucket worked out on the device, not an identity: it links no event to another, so it stays inside the privacy boundary above. Counts before this date have no source or visit and are not comparable stage for stage. |
| 2026-10-22 | The home page sends `tool_page_viewed` with `tool: 'home'` and `visit` (DEBT-61), valid on that event only. It shares the one last-visit day with the tool pages. | Nobody who only saw the home page was counted, and it is where most people arrive. Sharing the day counts a person once a day, on the first PDkef page they see. So from this date, someone who arrives through the home page has their tenure on the home row and reads `today` on the tool page after it. Tool-page tenure before and after this date is not comparable. The visit day was first written on 21 Oct, so until then every earlier user read as `new`; from this change a browser with no visit day but with recent files (kept 28 days) reads as returning, aged by its newest file. Someone who only browsed before 21 Oct, or whose files expired, still reads as `new`, so `new` stays an upper bound until late November. |
| 2026-10-21 | Background builds no longer count as started or ready in Compress and Compress Image (DEBT-59). Split already counted taps only since DEBT-46 (its 11 Oct numbers predate that deploy); PDF to Image, Image to PDF, Unlock and Protect were audited and already count taps only. | Days with more results ready than files opened (Compress 8 Oct: 3 opened, 16 ready) were background builds after each option change; read per page load the funnel was sound every day. Same model as Merge and Split. |
| 2026-10-25 | Merge, Edit PDF and Split share one finish flow (GRID-05), and a completed Share counts as `tool_operation_started` then `tool_result_ready`, like a Download tap, in all three. A Download and a Share of the same output count as two. | Split already counted a completed Share (DEBT-46); Merge and Edit PDF counted only the Download tap. One flow now serves all three, and a Share is as much an explicit request for the result as a Download, so from this date Merge's and Edit PDF's started and ready counts include Shares and are slightly higher than before for the same use. |
