---
id: "LOC-11"
title: "Two-month country and language re-check: has anything moved that should reopen localization?"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "later"
depends_on: ["LOC-10"]
legacy_state: "Open"
---

# LOC-11 · Two-month country and language re-check: has anything moved that should reopen localization?

**Due 2026-11-12.** Written when [LOC-10](LOC-10.md) removed page localization (2026-09-12). This is
the one standing check the epic leaves behind: a cheap, scheduled look at whether the countries and
languages have shifted enough to reconsider, so the removal is a decision with a review date rather
than a door closed for good.

## Baseline (2026-09-10 standings, 3 months)

India 36 clicks / 813 impressions at 12.66, by a distance. Israel 8 / 20 at 6.65 (40% CTR). United
States 4 / 360 at 31.97. Then Malaysia, Indonesia, the Philippines, Pakistan. Every India query in
English; Israel's four queries in English; Indonesia leaked two in-language queries onto the English
page (`gabung pdf free online`, `pdf combine gratis`, 1 impression each). Section 3.3 of
`docs/seo-competitive-findings.md` holds the table.

**The one language that had real demand was Indonesian** ([LOC-01](LOC-01.md): Trends parity with
English on compress and sign, merge about half, pdf-to-jpg a quarter; iLovePDF takes 12.8% of its
traffic from Indonesia). It was declined on field, not demand ([LOC-07](LOC-07.md)): the `hl=id` SERP
is owned by the majors at 300k-700k reviews each, and this domain loses to that field in English at
position 36 on `/merge/`. That is what would have to change.

## What to do

1. Pull GSC by country for the last three months and compare against the baseline. Note any country
   that has entered the top five or moved by more than 2x in clicks or impressions.
2. Run `npm run seo:refresh` on the export. Its non-Latin query clustering (kept from LOC-06 for
   exactly this) lists any in-language queries reaching English pages; report the count per script.
3. For Indonesia specifically: the position of `/merge/`, `/compress/` and `/sign/` on their own
   English queries with `gl=ID` (Shlomi's browser, `hl=en&gl=ID`). Field check, not demand check.
4. Only if a country moved: re-run that language's Trends comparison from LOC-01's report
   (`docs/localized-search-research-brief-report.md`), same five-term format.

## Top-languages sweep: is there untapped in-language traffic we cannot see?

Shlomi's standing concern (2026-09-12): users search in their own language, so a market can be
invisible in GSC simply because we have no page in that language for Google to rank. That is the SEO-27
blind spot, and GSC cannot measure it by construction: it only reports queries we already rank for.
The evidence so far says the intuition holds in some markets and not others, so it has to be measured
per language, never assumed either way:

- **Held:** Indonesian (Trends parity on compress and sign; in-language queries leaking onto the
  English page).
- **Did not hold:** India, the top country by a distance, where all 50 queries are English and Hindi,
  Telugu and Tamil are flat at zero on Trends; Israel, where the four queries are English and Hebrew is
  a third of English at best. The vocabulary of this niche ("pdf", "merge", "compress", "jpg") stays
  English inside most languages, which is why native terms come back flat more often than not.

**Method, per language (the LOC-01 three-source method, unchanged):**

1. Take the top ten countries by impressions from the refreshed table. Map each to its main search
   language. Already measured and closed: Hebrew, Indonesian, Malay, Hindi, Telugu, Tamil. Queued from
   LOC-01 and never run: **Filipino** (marked "later": competitor titles code-switch, Filipino verb plus
   English object) and **Urdu** (no evidence either way; next step was the GSC Pakistan filter). Any new
   country in the top ten gets its language added to the list.
2. For each unmeasured language: fetch the majors' own localized tool pages (`/<lang>/compress-pdf`
   and siblings on PDF24, Smallpdf, iLovePDF, Sejda) to lift real native phrasing, exactly as LOC-08 did
   for Telugu. A language none of them has built is a data point on its own.
3. Build the five-term Trends links (English, two romanized or code-switched, two native-script) and
   the `hl`/`gl` SERP links for the four anchor tasks, and hand them to Shlomi to screenshot, same
   format as LOC-08's "For Shlomi" section. Read the SERPs for two things: how many results carry
   Google's "translated, see original" badge (a SERP Google has to backfill with its own translations
   of English pages is thin native demand, LOC-08's lesson), and whether the related-searches block is
   in the language or in English.
4. Check Google's translated-results list for the language. On a listed language, our English page
   already reaches those searchers translated, so the untapped share is only what a native page adds
   over Google's translation of the same field.
5. Score against the ROI gate below. Record the verdict in this ticket in LOC-01's per-language table
   format, whatever it is, so the next check does not re-measure it.

Budget: one language at a time, Filipino and Urdu first because they are already in the top seven.
Do not build anything from this ticket; a language that clears both gates gets its own restore ticket.

## The ROI gate (also recorded in the findings doc, section 2)

Reopen page localization for a language only when **both** hold:

- **Demand:** in-language search volume for the anchor tasks of the order of the English page's own
  traffic from that country, measured on Trends and visible as in-language queries in GSC. Hebrew never
  met this; Indonesian did.
- **Field:** an English tool page already ranks in the top ten in that country on its own query, so the
  domain has shown it can compete in that field before a native edition asks it to. Indonesian never
  met this.

A language that clears both is worth restoring the mechanism for (git history at `464a067`, the last
commit before LOC-10). One that clears demand alone is LOC-07's answer again; one that clears neither
is LOC-08's. Do not reopen on brand or sentiment grounds; the origin story is served by Hebrew inside
the PDF, which the Sign tool still does.

## Acceptance

- Country table refreshed in the findings doc section 3.3, in-language query count per script noted.
- Every top-ten country's language either already closed in LOC-01/LOC-08 or measured here with a
  verdict row; Filipino and Urdu measured at minimum.
- A one-paragraph verdict here: nothing moved (close, and schedule the next check with the regular
  SEO refresh rather than a dedicated ticket), or a named language clearing both gates (open a
  restore ticket that starts from LOC-10's keep-list in reverse).
