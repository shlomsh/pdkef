---
id: "LOC-07"
title: "Is a second language worth building at all? The ROI judgment on LOC-01's evidence, and the languages it never measured"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-01"]
legacy_state: "Open"
---

# LOC-07 · Is a second language worth building at all? The ROI judgment on LOC-01's evidence, and the languages it never measured

## Scope and acceptance

**Why this exists.** [LOC-01](LOC-01.md) finished its measurement on 2026-09-11 and the numbers came
back lopsided: of the four languages it could measure, two are flat at zero on every instrument (Malay,
Hindi), one is small but free to review (Hebrew, already building under LOC-03), and one has real
in-language volume but the hardest field on the list (Indonesian). Shlomi's reaction to the Hindi and
Malay zeros was to ask whether the whole second-language effort is ROI-negative. That is the right
question, and LOC-01 deliberately did not answer it: the person who spent the day gathering evidence is
the wrong person to grade it. This ticket is for a fresh agent, starting from the evidence and not
from the enthusiasm.

**Read first, in this order.** The ROI note at the bottom of [LOC-01](LOC-01.md); the per-language
verdict table above it; then [docs/localized-search-research-brief-report.md](../../docs/localized-search-research-brief-report.md)
for the per-task Trends and SERP tables with the numbers. Do not re-run any of it. Every Trends
chart and SERP in there came from Shlomi's browser because this environment cannot fetch either
(findings doc, section 2), and the phrasing behind each chart was verified against competitors' own
localized pages before the link was built. The brief itself
([docs/localized-search-research-brief.md](../../docs/localized-search-research-brief.md)) is the
method; do not re-derive it.

**Part 1: the judgment, for Indonesian.** Write the ROI case both ways, then pick. The inputs are all
already recorded:

- Trends share: `kompres pdf` at parity with `compress pdf`, `tanda tangan pdf` near parity with
  `sign pdf`, merge at about half, pdf-to-jpg at about a fifth (report, section A).
- The field: iLovePDF, Smallpdf, Adobe, PDF24, Canva on every query, with `AggregateRating` counts of
  300k-700k (report, section B/C, Indonesian). Not one mixed-language or machine-translated incumbent
  to beat. The only unclaimed fact is on-device processing; PDF24 names its own German server.
- What this domain earns in English against the same field: `/merge/` at position 36.13, 0 clicks, on
  its own query (findings doc, section 3). A localized edition inherits the domain's authority, not
  the competitors'.
- Google already machine-translates our English page for Indonesian searchers (translated-results
  list, report, top section). The marginal gain of a native page is the difference between a
  machine-translated English page and a reviewed native one, not between nothing and something.
- Crawl budget: nine English pages never crawled (SEO-06), the two best pages recrawled least
  (SEO-28). Three `/id/` pages join that queue behind three `/he/` pages.
- Cost: a paid native reviewer per page, three pages. Machine translation reviewed by nobody is the
  version Google's spam policy names, and `src/content.config.ts` refuses it on purpose.

The expected-traffic estimate does not need to be precise; it needs to be honest about the position a
new page on this domain realistically lands at against that field, and what that position is worth in
clicks at Indonesian CTRs. If the answer is "page two, single-digit clicks a month", say so and stop.

**Part 2: the languages LOC-01 could not measure.** Filipino, Urdu, Bengali and Arabic got a light
pass only (romanized queries, no Trends, no `hl`/`gl` SERPs). India's other major languages - Tamil,
Telugu, Marathi, Gujarati, Kannada, Malayalam - were never touched, and all six are on Google's
translated-results list, which is Google saying each is large enough to build auto-translation for.
**Only open this if Part 1 comes out positive for Indonesian.** If a language with parity volume and a
free-to-bridge SERP is not worth building, one with unknown volume and an unknown field is not either,
and the measurement cost (a native speaker to verify phrasing before any Trends link is built, then
Shlomi's browser for every chart and SERP) is not free. If Part 1 is positive, run the same method:
verify phrasing off competitors' own localized pages, then hand Shlomi Trends links (five terms per
chart: English, two romanized, two native-script) and `hl`/`gl` SERP links, one language at a time,
Tamil and Telugu first by speaker count.

**What would change Part 1's answer, whichever way it goes.** (a) LOC-03's Hebrew pages producing
measurable in-language impressions - the only calibration this site will ever have for what a
localized page earns. Wait for it if the Hebrew recrawl is close. (b) An English tool page reaching
page one for its own query. (c) A GSC "Translated results" search-appearance reading showing
Indonesian searchers already arriving on the English page in numbers - that is demand a native page
would upgrade, not create, and it is the one number LOC-01 did not pull.

**Acceptance.**

- A written ROI case for Indonesian, both directions, with the position-and-clicks estimate and the
  assumptions named, ending in one of: proceed to [LOC-04](LOC-04.md), wait for a named signal from
  the list above, or close LOC-04 as not worth it.
- If "proceed": LOC-04's reviewer budgeted and named before it starts.
- If "close": LOC-04 retired with this ticket linked as the reason, the findings doc status board
  updated, and one line in the doc's section 2 recording the lesson - which is probably "in-language
  volume is necessary and not sufficient; the field and the domain's authority decide".
- Part 2 opened or explicitly declined, with the reason.
- No page built here.
