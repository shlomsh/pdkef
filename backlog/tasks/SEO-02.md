---
id: "SEO-02"
title: "A standings table against the competition that is maintained, not written once"
status: "done"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-01"]
legacy_state: "Done 2026-09-10"
---

# SEO-02 · A standings table against the competition that is maintained, not written once

## Scope and acceptance

**Section 4 of [docs/seo-competitive-findings.md](../../docs/seo-competitive-findings.md) is a
baseline table with one date on it. Left alone it becomes a lie in about six weeks**, and the epic
loses the only instrument that can tell a real improvement from a busy one.

Make it a maintained artefact. Two halves, and the second is the one that gets skipped:

**The table.** Per winning term: our position and impressions from the latest Search Console export,
who ranks above us, whether the gap is rank or click-through, and the ticket that owns it. Plus the
non-ranking dimensions already in section 4 (authority, free-vs-freemium, privacy, open source,
language support, offline, indexed page count), because those are what the positioning reviews
(SEO-11) argue from and they need somewhere to be checked against reality.

**The refresh procedure.** A short, literal recipe: which Search Console export to pull, which columns,
how the cluster weighting in section 1 is computed, and where each number lands. Written so the next
agent reproduces the same numbers rather than inventing a compatible-looking method. Any scripted part
belongs in `scripts/`; anything manual is spelled out step by step.

**Two rules that keep it honest.** Every row carries the date it was measured, and a stale row stays
visible with its old date rather than being quietly dropped - a term we stopped tracking because it
went badly is exactly the row worth keeping. And competitor positions are recorded with their source
and sampling date, because they are the softest numbers in the file.

**Acceptance.**

- The refresh procedure is written into the findings doc and produces section 1's cluster table and
  section 4's standings table from a Search Console export, reproducibly.
- Every row in both tables carries a measurement date.
- One full refresh has been performed end to end by following the written procedure, and any step that
  turned out to be ambiguous has been rewritten.
- A cadence is stated (monthly, plus after any ticket claiming a ranking change) and the next refresh
  date is on the board.
- No ticket in this epic may claim a ranking improvement without a before and after row here.

## Progress (2026-09-10)

**Shipped:**

- `scripts/seo-refresh.mjs` - takes the unzipped Search Console "Performance on Search" export folder,
  prints section 1's By page/By country/By device tables exactly (from `Pages.csv`, `Countries.csv`,
  `Devices.csv` - complete aggregates, no ambiguity) and the By intent cluster table via a documented
  keyword-pattern classifier (`CLUSTER_PATTERNS` in the script), plus a list of unclassified queries
  with 2+ impressions so a reviewer can spot a missed cluster rather than silently losing queries.
- The refresh procedure is written into `docs/seo-competitive-findings.md` (top of section 1): the exact
  GSC export path and settings, the script invocation, what stays manual (competitor columns - Google
  blocks scripted SERP fetches, same wall SEO-04/SEO-05 hit), and the rule to replace rather than append
  when pasting output back in.
- **One full refresh performed end to end** against Shlomi's 2026-09-10 export. It surfaced a real
  ambiguity the ticket asked to expect: `Queries.csv` omits some individual queries to protect searcher
  privacy (standard, permanent GSC behaviour), which understates cluster impressions - confirmed by
  `Queries.csv` summing to 1,189 impressions against `Pages.csv`'s exact 2,318. It's a rounding error for
  large clusters (blur/redact: 717 vs the prior 718) but a real gap for small ones (unlock: 5 vs the
  prior 8) - documented as a stated lower bound in the findings doc rather than papered over. All six
  cluster numbers and the by-page/country/device tables in section 1, plus section 4's standings table,
  are now the script's exact output, each row carrying a `Measured` date.
- Section 4 also now records competitor-column sourcing per row (the 2026-09 deep research date, plus a
  2026-09-10 cross-check date on the two rows SEO-04/SEO-05 touched) - the "recorded with source and
  sampling date" half of this ticket. Competitor SERP positions themselves are still not captured
  (nothing here can read Google's actual ranked list for a competitor without the same blocked scripted
  fetch), so "Who is above us" stays names, not positions - an existing limitation, not a regression.
- Cadence stated: monthly, plus after any ranking/CTR-claiming ticket. Next refresh: **2026-10-08**,
  already shared with SEO-01/04/05's re-measurement date.

**Not automated, by design:** section 3's competitor landscape (authority, monthly visits) stays a
manual research task on its own cadence - there's no API access to a backlink/rank-tracking tool in this
environment, and it doesn't change monthly the way our own GSC numbers do. Marking this ticket done on
the acceptance criteria as written; section 3 refreshes are a separate future task if wanted.
