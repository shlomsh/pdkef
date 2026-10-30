---
id: "SEO-51"
title: "Redact gets ten times the searches of blur: read where /redact/ ranks on redact queries before touching its title"
status: "blocked"
priority: "P2"
epic: "search-and-languages"
waiting_on: "A Search Console read of /redact/ on redact queries"
needs: "Search Console, Performance, page /redact/, query containing \"redact\", last 3 months: impressions, clicks and position per query, plus the same for \"blur\""
---

# SEO-51 · Redact gets ten times the searches of blur

Filed 2026-10-29 after Shlomi asked which is the better keyword, blur or redact.

## What we measured

Keyword Planner, saved-keywords plan, all locations, all languages, Google, Oct 2025 to Sep 2026
(Shlomi's screenshot, 2026-10-29):

| Keyword | Avg. monthly searches | 3-month / YoY | Ad competition | Top-of-page bid |
| --- | --- | --- | --- | --- |
| `blur pdf` | 1K - 10K | 0% / 0% | Low | ₪0.06 - 1.56 |
| `redact pdf` | 10K - 100K | 0% / 0% | Medium | ₪0.54 - 9.49 |

One bucket apart: redact has about ten times the demand, and advertisers bid about six times more for it,
which reads as task intent. Free keyword sites publish no volume for either; Google Trends answered this
session with a 429.

## What this corrects

DEMO-02 and DEMO-07 (both done) said "redact is a lawyer's word and nobody searches for it". That was
never measured. Blur looked stronger in Search Console because `/redact/`'s title has led with
"Blur PDF" since DEMO-07, and Search Console shows the queries a page already ranks for.

## Why the title does not change yet

- `/redact/` carries 81% of the site's clicks, and the late-October rise in visitors (Vercel, Oct 22 to 29,
  384 of 529 visitors on `/redact/`, 302 of them from Google) is happening on the current title.
- `redact pdf` is the incumbents' head term: Adobe, Smallpdf, iLovePDF and Sejda all slug it. SEO-45 is
  what a head-term page-one test looks like on this domain: a sample that ended.
- The live title, `Blur PDF Online Free - Blackout & Redact Text`, already carries "Redact" but not the
  exact phrase `redact pdf`.

## The freeze (Shlomi, 2026-10-29)

`/redact/`'s URL, title, H1, meta description and intro copy stay as they are. Shlomi's concern: the page
brings most of the site's traffic, and a change to it costs work and can cost the ranking, as `/merge/`
showed. The freeze is written into `.claude/rules/content-and-copy.md` so any agent editing
`src/data/tools.js` sees it. It lifts only when all of these hold:

- the read below shows redact queries already near page one;
- the change adds the redact phrase without taking blur out of the title or H1;
- Shlomi says yes to that specific change;
- it ships with one indexing request, a dated read, and a revert if blur clicks drop at matched positions.

Redact demand can be chased without touching the page: SEO-03 (external links), and one indexing request
for `/permanently-delete-text-from-pdf/`, which already answers the "permanently redact" searches and was
never crawled as of 2026-10-08. A second Redact tool page waits on this read and on SEO-47's new pages
being crawled; it would need its own job (removal, opening the tool in Delete) to be more than a doorway.

## The read, and what each answer means

Search Console, `/redact/`, queries containing "redact" against queries containing "blur", last 3 months.

- **Redact queries already sit around positions 8 to 15 with real impressions:** the page is close on the
  bigger term. Test a title that carries both exact phrases (for example `Blur & Redact PDF Online Free`),
  one indexing request, and read it against the blur queries at matched positions, so blur's clicks are
  shown not to drop. Only with the freeze's conditions met.
- **Redact queries are absent or beyond page two:** it is an authority fight (SEO-03), not a title. Blur
  keeps the lead and this closes.

## Evidence so far

- **2026-10-30, Shlomi:** `/redact/` does not show for `redact pdf online free`. That leans toward the second
  branch, but one search cannot tell position 25 from no ranking at all, and results vary by searcher and
  place. The Search Console read still decides: whether redact queries have impressions on `/redact/` at all,
  and at what position.
