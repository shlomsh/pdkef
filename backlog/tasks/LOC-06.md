---
id: "LOC-06"
title: "Per-locale measurement: extend the refresh procedure so localized pages are read separately"
status: "done"
priority: "P3"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-03"]
legacy_state: "Done 2026-09-11"
---

# LOC-06 · Per-locale measurement: extend the refresh procedure so localized pages are read separately

## Scope and acceptance

**Why.** The monthly refresh (`scripts/seo-refresh.mjs`, findings doc section 6) clusters queries by
English intent words (`blur`, `compress`, `sign`), so a Hebrew query lands in no cluster and a
`/he/compress/` row is invisible in the intent table even though it appears in `Pages.csv`. Once
LOC-03 ships, the refresh has to answer two new questions or the pilot cannot be judged: which
non-English queries now appear at all (the direct test of LOC-01's blind-spot claim), and how each
localized page performs against its English sibling.

**Scope.**

- `seo-refresh.mjs` gains a per-locale section: pages grouped by URL prefix (`/he/`, later `/id/`),
  with clicks, impressions, CTR and position, next to the English sibling for the same tool.
- Query clustering detects script (Hebrew, Arabic, Devanagari, Latin) and reports non-Latin queries as
  their own cluster with the raw strings, so the phrasing LOC-01 predicted can be checked against what
  actually arrived.
- A country breakdown filtered to the pilot country, since the Hebrew page's whole audience is Israel
  and a site-wide average hides it.
- Section 3 of the findings doc gets a 3.7 "By locale" table produced by the script; section 6's
  procedure gets the one extra step.

**Acceptance.** The script reproduces the new table from a real export; the first run after LOC-03's
recrawl is recorded in the findings doc and in LOC-03's outcome. Keep the privacy-filter caveat: a
small locale's query list is a lower bound more than usual.

## Done 2026-09-11

The mechanism shipped; the first real read is still the 2026-10-08 refresh (LOC-03's recrawl has not
happened yet), so this ticket is done on "the refresh can now answer the question," not on "the
question has been answered." That answer is 2026-10-08's job, described below.

**What shipped.**

- **Per-locale section** (`scripts/seo-refresh.mjs`, section 3.7 of the findings doc). Pages are
  grouped by URL prefix read from `src/i18n/localePrefixes.js`'s `LOCALIZED_PATH_PREFIXES` (not
  hard-coded to `/he/` - a second locale's pages appear automatically once it has rows in
  `Pages.csv`), each localized page listed with clicks/impressions/CTR/position next to its English
  sibling (same path, prefix stripped). A localized page whose sibling has no row in that export's
  `Pages.csv` prints `sibling: null` rather than a false zero, so "no English traffic this period" and
  "genuinely no English page at that path" both show honestly.
- **Script-aware query clustering.** `detectScript()` uses `\p{Script=...}` Unicode property escapes
  to classify a query as Hebrew, Arabic, Devanagari, Bengali, Tamil, Telugu, Thai, CJK or Latin, in
  that priority order - a query is classified by the first non-Latin script it contains (nearly every
  Hebrew query here also contains the Latin word "PDF"), so mixed-script queries land correctly instead
  of falling through to Latin. `groupQueriesByScript()` reports every non-Latin query as its own row
  under its script, raw string and all, sorted by impressions - the direct check of whether phrasing
  like "כיווץ" over "דחיסה" (LOC-01's prediction) is what actually shows up. Romanized queries (e.g.
  Indonesian "kompres pdf gratis") are Latin by script and intentionally excluded from this table; they
  already have a home in the existing by-intent clusters (documented in the test file, since it is easy
  to expect script clustering to mean language clustering).
- **Country breakdown for the pilot country.** `documentationLocales.ts` carries no country field (a
  documentation locale is a language, not a country), so a small `pilotCountry` map was added next to
  `LOCALIZED_PATH_PREFIXES` in `src/i18n/localePrefixes.js` (currently `{ he: 'Israel' }`), with a
  comment saying why it lives there instead of being derived from the locale registry. The printed
  breakdown is explicitly labeled site-wide (Search Console's `Countries.csv` isn't itself filterable
  by page), not "Israel traffic to `/he/` pages specifically" - stating that limitation is part of what
  shipped, not a gap in it.
- **Findings doc.** Section 3.7 "By locale" added, marked "not yet run" with the table shapes the
  script prints and no invented numbers; section 6's procedure note updated to say the script now
  prints 3.1-3.3 and 3.7 in one pass; the privacy-filter caveat is restated as sharper for a small
  locale, per the ticket's instruction to keep it.
- **Tests.** The pure logic (`parseCsv`, `weightedPosition`, `detectScript`, `groupQueriesByScript`,
  `normalizePagePath`, `groupPagesByLocale`, `countryRowForLocale`) was factored into
  `scripts/seoRefreshLib.mjs`, a plain module with no CLI entry point, imported by both
  `scripts/seo-refresh.mjs` and `src/lib/seoRefresh.test.js` (27 tests, inline CSV fixtures with
  Hebrew, Telugu and Latin/romanized queries, no real Search Console export committed). `seo-refresh.mjs`
  itself was smoke-tested end to end against a throwaway fixture folder (not committed) to confirm the
  printed section 3.7 renders correctly; that run is not the acceptance criterion's "real export," it
  only proves the code path works.

**What the 2026-10-08 run must do**, once LOC-03's recrawl (or a fresh natural crawl) gives Hebrew
pages real Search Console rows:

1. Run `node scripts/seo-refresh.mjs <export folder>` per section 6's updated procedure - it now
   prints section 3.7 in the same pass as 3.1-3.3.
2. Paste the printed 3.7 tables over the "not yet run" placeholder in the findings doc - replace, not
   append, same rule as every other section 3 table.
3. Read whether `/he/compress/`, `/he/merge/` and `/he/sign/` show any impressions at all (LOC-01's
   blind-spot claim, directly testable for the first time), compare each to its English sibling, and
   check the non-Latin query list against the phrasing LOC-01 predicted.
4. Fold the result into LOC-03's eight-week outcome, per that ticket's own next-check note.
5. If a second locale (e.g. `/id/`) has shipped by then, confirm its section prints automatically
   (it should, since the grouping reads `LOCALIZED_PATH_PREFIXES` rather than a hard-coded list) and
   add its `pilotCountry` entry first if it's missing.
