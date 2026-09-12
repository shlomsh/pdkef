---
id: "SEO-16"
title: "Positioning review: Merge, Split and Protect & Unlock"
status: "open"
priority: "P3"
epic: "english-base"
phase: "later"
depends_on: ["SEO-11", "SEO-09", "SEO-10"]
legacy_state: "Open"
---

# SEO-16 · Positioning review: Merge, Split and Protect & Unlock

*Re-filed 2026-09-12* from `search-acquisition` into `english-base`: after SEO-35, the merge half of this review is settled: say it has only the general claims and stop.

## Scope and acceptance

**Run as a dedicated review, per SEO-11.** Last of the review tickets, and deliberately so: these three
are the most commoditised tools in the suite and the ones where our differentiators are the general four
rather than anything tool-specific. That is a legitimate finding, and this review is allowed to reach it.

Current standing: `/merge/` 47 impressions at position 36.13, no clicks. `/split/` 203 at 65.54, no
clicks. `/unlock/` 81 at 34.58, one click.

**What is already covered elsewhere**, so this review does not redo it: SEO-09 owns `/split/`'s extract
vocabulary, SEO-10 owns `/merge/`'s no-limit framing. Both should have shipped before this starts. This
review is the wider read of all three together.

**Unlock is the one with an unexamined story.** It handles both directions - add a password, remove one
you know - and auto-detects which. It also refuses to crack anything, and the query log shows people
arriving on `crack pdf` (position 90) and `pdf crack`. The refusal is the correct product decision and
saying it clearly is both honest and a differentiator, since it sets an expectation before someone wastes
their time. Whether it is worth *ranking* for those queries is a separate question the review should
answer, and "no" is a reasonable answer.

**The thing to resist.** These are the tools where a reviewer under pressure to produce a finding will
invent a differentiator. If Merge is simply a good, free, private merge tool with no cap, the correct
output of this review is to say so, sharpen the copy, and stop. An overclaim on a commodity tool costs
more credibility than it buys clicks.

**Acceptance.**

- SEO-11 method followed and recorded for all three.
- For each, either a named differentiator with evidence, or an explicit statement that it has only the
  general claims. Both are acceptable outcomes; a manufactured one is not.
- A recommendation on whether `/unlock/` addresses password-cracking intent at all, with reasoning.
- No overlap with SEO-09 or SEO-10; where this review disagrees with what they shipped, it says so
  rather than silently re-editing.
- Concrete copy as a diff; `npm run test:seo` passes.
