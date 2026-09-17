---
id: "LOC-17"
title: "Read 2026-11-08 · Indonesian pilot: kompres pdf 1 mb / di bawah 1 mb family"
status: "blocked"
priority: "P1"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: ["LOC-15"]
---

# LOC-17 · Read 2026-11-08 · Indonesian pilot: kompres pdf 1 mb / di bawah 1 mb family

*Filed 2026-09-13* to close [LOC-15](LOC-15.md): everything buildable there has shipped (page
published, portal limits cited and sourced, inbound link from `/pdf-wont-compress-to-100kb/`,
indexing requested), and the only thing left is a dated Search Console read. Splitting it out so
LOC-15 can close instead of sitting open for eight weeks with nothing left to do.

## Baseline

`/id/kompres-pdf-di-bawah-1-mb/` published, merged to `main`. Indexing requested 2026-09-13 (Search
Console, URL Inspection). Reviewer gate waived by Shlomi (no paid native reviewer sourced; an AI
review stands in - `reviewer: 'Claude (AI review, no native speaker)'` in the page's front matter).
Target keyword family per LOC-14's Keyword Planner read: `kompres pdf 1 mb` at 50,000/month plus
40-plus variants at 500-5,000 each; the "di bawah 1 mb" ("under 1 MB") phrasing is the one to lead
on, `+900%` YoY against a flat "jadi 1 mb" ("to 1 MB").

## What to do

1. At eight weeks from the indexing-request date (2026-09-13 → 2026-11-08), pull GSC filtered to
   Indonesia for `/id/kompres-pdf-di-bawah-1-mb/`: impressions and position on `kompres pdf 1 mb`,
   `di bawah 1 mb`, `kurang dari 1 mb`, `dibawah 1 mb`, `kompres foto 200 kb` and close variants.
2. Confirm the page was actually recrawled with current content (URL Inspection "last crawled" vs.
   the publish date), not just indexed once and stale.
3. Record the outcome in this ticket and in the languages page (`docs/i18n-status/`), which still
   lists Indonesian as `building`/`live` pending this read.

## Acceptance

- **Success:** top ten on at least one of the target phrasings for Indonesia. Any impression at
  all is already the first real signal, since the English pages' entire Indonesian footprint is
  151 impressions a quarter (GSC, 3 months, per LOC-15).
- **Kill:** no impressions on any of the target phrasings, the same bar this epic's other reads
  use (e.g. SEO-17).
- One-paragraph verdict written here either way. A pilot that finds no demand is a finished pilot;
  it does not reopen LOC-14's gate, it closes this line of work.
- **No second Indonesian page and no second language starts before this read is in** - the rule
  carries over unchanged from LOC-15.

*2026-09-17:* second indexing request the same day (the page was absent from the Coverage -> Valid
export). The field was re-read with `hl=id&gl=id`: not thin at 1 MB, and gethonestpdf.com now holds the
on-device claim natively at position three; full capture and the two decisions (reviewer deferred to
this read; any second page is 100 KB) are in LOC-15. Read this ticket against that: page two on
`kompres pdf 1 mb` / `di bawah 1 mb` is the success bar, and the 100 KB family's impressions are the
signal for the next page.
