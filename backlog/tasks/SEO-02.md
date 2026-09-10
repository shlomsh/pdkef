---
id: "SEO-02"
title: "A standings table against the competition that is maintained, not written once"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-01"]
legacy_state: "Open"
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
