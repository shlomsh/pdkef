---
id: "LOC-06"
title: "Per-locale measurement: extend the refresh procedure so localized pages are read separately"
status: "open"
priority: "P3"
epic: "localized-search"
phase: "near-term"
depends_on: ["LOC-03"]
legacy_state: "Open"
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
