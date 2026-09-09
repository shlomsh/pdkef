# PDkef analytics approach

Last updated: 2026-09-09

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

Custom events require Vercel Pro. Until the deployed project is on a plan that
accepts them, page and Speed Insights data still work, and the product does not
depend on event delivery.

## Event vocabulary, version 1

Every event has exactly one `tool` property. That preserves room within the
standard Vercel property allowance and makes breakdowns consistent.

| Event | When it fires | What it answers |
| --- | --- | --- |
| `tool_file_accepted` | A valid local input is accepted by a tool | Which tool visitors actually begin using |
| `tool_operation_started` | The user starts merge, compress, conversion, edit, unlock/protect, signing, or redaction | Where an accepted file becomes active work |
| `tool_result_ready` | Local processing completes and an output is ready | Successful completions by tool |
| `tool_operation_failed` | A processing operation reaches a known failure state | Aggregate failure pressure by tool |

Sign also retains its existing `sign_export` maintenance event. It is now
unsampled and uses only the fixed `outcome`, `duration_bucket`, and, on failure,
`error_code` values defined in `src/lib/maintenanceTelemetry.ts`. It is a narrow
Sign performance/compatibility diagnostic, not a second product-event schema.

The `tool` values are a closed list: `merge`, `split`, `edit-pdf`, `compress`,
`pdf-to-image`, `image-to-pdf`, `sign`, `redact`, `unlock`, and `protect`.

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
