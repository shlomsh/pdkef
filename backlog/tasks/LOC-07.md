---
id: "LOC-07"
title: "Is a second language worth building at all? The ROI judgment on LOC-01's evidence, and the languages it never measured"
status: "done"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-01"]
legacy_state: "Done 2026-09-11"
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

## Judgment, 2026-09-11

### Part 1: the ROI case for Indonesian

**The case for proceeding.** Criterion 1 of LOC-01's decision rule cleared outright and on real
Trends data, not inference: `kompres pdf` runs at or above `compress pdf`'s level for the full 12
months, and `tanda tangan pdf` sits close to parity with `sign pdf`. That is two of the four anchor
tasks at real, sustained in-language volume, a stronger result than Hebrew got on any task. GSC
already shows leakage on the current English-only page (`gabung pdf free online`, `pdf combine
gratis`, one impression each) - real Indonesian searchers already typing in-language and landing on
us by accident. Indonesia is already our fourth-largest country by impressions on English queries
alone, and iLovePDF's own Similarweb numbers put ~22% of its global traffic there. And there is one
honest, unclaimed fact to lead with: PDF24 names its own German server in its Indonesian copy: nobody
in the field claims on-device processing.

**The case against.** Criterion 2 did not survive contact with a real SERP. The direct-fetch sample
that shaped LOC-04's original scope ("Indonesian is the Hebrew case again, just bigger") does not
match `hl=id&gl=ID` reality: all four anchor queries return iLovePDF, Smallpdf, Adobe, PDF24 and
Canva in the top five, every one native-quality, most carrying `AggregateRating` snippets of
300,000-700,000 reviews. That is not "a weak incumbent to beat" in the sense Hebrew's freepdfconvert/
AvePDF pair was; it is the same top-tier field this domain already loses to in English. And the loss
is not abstract: `/merge/` - same field, same five names, same review-count pattern one language over
- sits at position 36.13 with 0 clicks on its own head term (findings doc §3.2). Domain authority is
new (launched ~2026-06) against DR 59-83 incumbents (§3.6); a translated edition inherits the
domain's authority, not the competitors', and the domain's authority has not yet beaten this exact
field once. Indonesian is also on Google's translated-results list, so an Indonesian searcher can
already reach our English page auto-translated today; the marginal gain a native page buys is the
gap between a machine-translated English page and a reviewed native one, not between nothing and
something, and that gap has not been measured. Crawl budget is the binding constraint on this domain
right now, not URL count: nine English pages have never been crawled at all (§3.4, SEO-06), and the
two pages that earn the most (`/redact/`, `/split/`) are recrawled least for reasons nothing we
control explains (SEO-28). Three `/id/` pages would compete with that same scarce crawl budget before
the domain has absorbed what's already published. And unlike Hebrew, the cost is real: a paid native
reviewer per page, three pages, against a field this authority-poor domain has not shown it can move
in.

**The position-and-clicks estimate, honestly.** A new, reviewed Indonesian edition, on a three-month-
old domain with no Indonesian-web backlink profile, competing against the same five global players
that currently hold `/merge/` at position 36 in English, should be expected to land in the same place:
page two to three (roughly position 20-40) on the head terms (`kompres pdf`, `gabungkan pdf`, `tanda
tangan pdf`) for the first several months, with clicks in the low single digits a month at best - the
`/merge/` outcome repeated in a second language, not improved on, because nothing about translating
the page changes the authority gap that produced that outcome. The one lever that could move this - the
on-device-processing gap PDF24 leaves open - is unverified as a ranking factor and untested as a click
driver anywhere on this domain yet. **That is the "page two, single-digit clicks a month" case the
ticket asked to name plainly if the numbers came out that way. They did.**

**Verdict: close LOC-04, not proceed.** Not because criterion 1 failed - it is the strongest demand
signal any language in this epic has produced - but because criterion 1 alone does not carry the
decision. In-language volume only pays off if the resulting page can rank, and the one piece of direct
evidence this domain has about ranking against this exact competitive field (`/merge/`, position
36.13, 0 clicks, in English) says it currently cannot, and a translation does not change that. Spending
a paid reviewer's budget to relearn that lesson in a second language, before the free lesson (Hebrew,
LOC-03) has even produced its first indexed impression, is the wrong order to spend money in. This is
not a permanent verdict on Indonesian - it is a verdict on doing it now, before either of the two
things that would change the answer has happened:

- **The Hebrew pilot (LOC-03) producing measurable in-language impressions.** This is the one
  calibration this domain will ever have for what a localized page actually earns here, and it costs
  nothing further to get - LOC-03's three pages are drafted and mechanism-complete, waiting only on
  Shlomi's review and a publish + indexing request. Get that number before paying for a second
  language's pages.
- **An English tool page reaching page one for its own head-term query**, which would be direct
  evidence the domain's authority gap against this exact field (iLovePDF/Smallpdf/Adobe/PDF24/Canva)
  is closing. Nothing in section 3 shows this yet: the best English cluster positions (compress 9.8,
  blur/redact 13.5) are on differentiated long-tail intent, not the head terms Indonesian would have to
  win.

A third input named in the ticket - a GSC "Translated results" search-appearance reading for
Indonesian - was not pulled this pass; it would show whether Indonesian searchers are already reaching
the English page via Google's own translation in real numbers, which is the demand a native page would
upgrade rather than create. It is worth adding to the next Search Console pull (2026-10-08, section 6)
as a cheap, standing check, but it does not change today's verdict either way: even a large translated-
results number argues for waiting on the authority signal above before spending on native pages, and a
small one removes one more argument for proceeding.

### Part 2: the unmeasured languages (Filipino, Urdu, Bengali, Arabic, and the six untouched Indian
languages)

**Declined, per the ticket's own gate.** Part 1 came out negative for Indonesian - the language with
the clearest in-language demand this epic has found, a market where the domain already gets real
English-query traffic, and no reviewer-cost question mark (a reviewer was never confirmed, but demand
was never the blocker). If that language is not worth building now, a language with unmeasured volume
and an unmeasured field is not either, and the measurement cost the ticket itself names - a native
speaker to verify phrasing before any Trends link is even built, then Shlomi's browser time for every
chart and SERP, one language at a time - is not free. Re-open Part 2 only alongside a fresh case for
Indonesian (see the two signals above); there is no standalone case for measuring a harder-to-verify
language first.

### What this closes and what stays open

- [LOC-04](LOC-04.md) retired; see it for the full closure record.
- LOC-02/LOC-03 (Hebrew) are unaffected - Hebrew was decided on its own evidence, independent of this
  judgment, and stays in progress.
- [LOC-06](LOC-06.md) (per-locale measurement) still matters for Hebrew regardless of this verdict.
- [LOC-05](LOC-05.md) (Hebrew guides) is unaffected.
- The findings doc's status board and §2 lesson are updated in the same change as this ticket.
