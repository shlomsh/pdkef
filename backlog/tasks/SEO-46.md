---
id: "SEO-46"
title: "Real star ratings: ask once when a tool finishes, bake an honest aggregate into each tool page, and win the SERP stars"
status: "in_progress"
priority: "P2"
epic: "search-and-languages"
horizon: "later"
---

# SEO-46 · Collect real ratings so a tool's search result can carry stars and "Free"

Filed 2026-10-21 from Shlomi's read of PDF24's Compress PDF result.

## Why

- PDF24's result for Hebrew `דחיסת PDF` shows `4.9 ★★★★★ (15,074) · Free`. Shlomi's read: on the SERP this is a very
  high-conversion call to action. SEO-04 saw the same row on all three blur SERPs (`4.9 (741) · Free`) and
  declined to chase it.
- Where it comes from (read from their served HTML and `common.js`, 2026-10-21): a "rate this page" section on each
  tool page, 1-5 stars with an optional comment (required at 3 stars or fewer), posted per tool (`pageId`) to
  their backend. The server writes the average and count into the page three times: the badge, the tooltip and a
  JSON-LD `aggregateRating` on a `SoftwareApplication` with a free `Offer`. Their count is per tool, over a rolling
  1825-day window. There is no sign-in and no visible vote deduplication, so it is an opt-in self-run tally.
- Google shows stars and "Free" for software only when the page carries real `aggregateRating` or `review` data. We
  carry neither, and the decision in `docs/seo-competitive-findings.md` stands: **no fabricated `AggregateRating`**.
  The only honest way to the same row is to collect real ratings.

## Design (decide in the build, constraints are fixed)

- **Ask once, quietly.** In each tool's done state, a small "How did it go?" with five stars, in the repo voice. It
  never blocks the result and is never asked twice on a device. One per tool, once a file has actually been
  downloaded. Cross-tool hand-offs already live in the done state, so this goes beside them without crowding them
  (`docs/ux-design-guidelines.md`).
- **Anonymous, same-origin.** A beacon POST to our own address, no file bytes, no accounts, no cookie, `connect-src
  'self'` unchanged. Payload is `{tool, stars}` and nothing else. The comment box is out of scope: it would be free
  text from people and a privacy surface.
- **A permanent store, not the telemetry counters.** `api/report.ts` keeps daily counts and deletes them after 90
  days (`docs/maintenance-telemetry.md`). A rating aggregate must be durable: per tool, a count per star value, kept
  without expiry, in the same Upstash database under its own keys. Update the telemetry doc and the disclosure
  before shipping, as that doc requires for any new event.
- **Per-device limit.** One vote per tool per device via a local marker. This stops accidents and casual repeats,
  not determined stuffing. Add a per-day server cap and an allowlist on `tool` and `stars`. Say plainly in the doc
  that it is not fraud-proof.
- **The SEO shell stays static HTML.** The average and count are fetched at build time and baked into the tool
  page's HTML and its JSON-LD; nothing is injected client-side. Rebuild cadence is a scheduled deploy or a deploy
  hook, to be chosen in the build.
- **Emit only when honest.** No badge and no `aggregateRating` until a tool has a real minimum of votes (start at
  50, revisit). The number on the page and in the JSON-LD must match, and the badge must say what it is.
- **Markup.** `SoftwareApplication` (`applicationCategory`, `operatingSystem`, `offers` price 0) plus
  `aggregateRating`, validated in Google's Rich Results Test. Check `test:seo` for how tool JSON-LD is asserted
  today.
- **Localized pages.** Each locale shows the same aggregate for the same tool. Do not translate a rating into a
  locale-specific number.

## Risks to name in the build

- We start at zero. PDF24's 15,074 took years of traffic; early counts will be small and may stay under the
  threshold for a while on the smaller tools.
- Google can ignore the markup, and stuffing can't be fully prevented with anonymous votes.
- The ask costs attention in the done state. Measure the vote rate and the effect on the hand-off click rate
  (`tool_result_ready` lifecycle events already count both sides).

## Acceptance

- Ratings are collected anonymously with no file bytes, no accounts and no new `connect-src`, and the disclosure in
  `docs/maintenance-telemetry.md` says what is stored and for how long.
- A tool below the minimum shows no badge and no `aggregateRating`; at or above it, the HTML, the badge and the
  JSON-LD agree and pass the Rich Results Test.
- `npm run check:push` and the CSP build checks pass. The SEO-04 "do not emit" note in
  `docs/seo-competitive-findings.md` is updated to say when it changes.
- Read the SERP for a rated tool in Search Console (CTR before and after) once Google has recrawled it.

## Not here

- Free-text reviews or comments, a testimonials section, or showing GitHub stars as a rating. A GitHub star count is
  a different, cheaper signal and is its own decision.
