---
id: "SEO-09"
title: "Split ranks at 85 for extract queries because it never uses the word"
status: "blocked"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SEO-09 · Split ranks at 85 for extract queries because it never uses the word

## Scope and acceptance

**`/split/` drew 203 impressions and no clicks at position 65.54**, and the query detail shows why the
average is so bad: the page is being shown for a vocabulary it barely uses. `extract pdf` (32
impressions, position 91.12), `pdf extract` (16 at 82.69), `pdf extractor` (6 at 89.33),
`pdf page extractor` (4 at 97.25), `extract pdf pages` (3 at 97.33), plus a dozen more - roughly 92
impressions across the extract cluster at a weighted position of 85.

The tool does exactly this. Its own FAQ has an entry titled "Is this a PDF page extractor?" answering
"Yes. Splitting and extracting are the same operation here." That answer is buried in a FAQ while the
title, h1, subhead and step copy all say split.

There is also a long tail of typo and non-English variants in the same cluster - `split pf`, `splitpdg`,
`cut pf`, `divide pdg`, `pdf breaker`, `sparge pdf`, `pef split` - which is what a page looks like when
Google has classified it correctly but ranks it nowhere. Those are not targets; they are a symptom.

**Before starting (added 2026-09-11):** `/split/` was last crawled by Google on **2026-07-05**. The
position-85 numbers above describe that snapshot. `Extract Pages` has been in the title and h1 since
2026-07-04, so Google did see that - but `bb88469` (2026-08-09, "Answer the 'extractor' and custom-target
searches people already make"), including the FAQ entry this ticket calls buried, has never been indexed
at all. Two consequences: the baseline for this ticket is a page a month older than the one in the repo,
and whatever vocabulary change ships here is not done when it merges - it is done when it is recrawled.
Request indexing for `/split/` as part of finishing, and confirm with `npm run seo:crawl-staleness`.

*Update 2026-09-11:* Vocabulary work landed (freeNoteLead cross-links between `/split/` and `/edit-pdf/`
stating the extract-vs-remove distinction each way, and the "Is this a PDF page extractor?" FAQ entry
reconciled to name Edit PDF Pages as the alternative) - h1/subhead/steps already said "extract" before
this ticket was filed, so no change was needed there. Indexing requested for `/split/` again today
(Shlomi, still showing **2026-07-05** as of this commit - too soon for Google to have acted on it).
Re-run `npm run seo:crawl-staleness` at the next capture to confirm the recrawl landed before reading
position movement on the extract cluster.

**The work is vocabulary, not features.** Decide where "extract" belongs in the title, h1, subhead and
step copy without losing "split", which is the higher-volume head term and is currently the whole
identity of the page. The two are the same operation to a user, so this is a phrasing problem with a
correct answer, not a trade-off between two audiences.

**One thing to check before editing:** whether `extract pages` intent is actually better served by
`/edit-pdf/` (which removes pages) than by `/split/`. They are different operations that people describe
with the same words, and sending the query to the wrong page is worse than ranking poorly. If they split,
say which query goes where and make the two pages link to each other on exactly that distinction.

**Acceptance.**

- "Extract" appears in `/split/`'s h1 or title, and in the subhead, without "split" being displaced from
  the title.
- The split-versus-remove-pages distinction is stated on both `/split/` and `/edit-pdf/`, each linking to
  the other on it.
- The existing "Is this a PDF page extractor?" FAQ entry is reconciled with the new copy rather than left
  as a duplicate answer.
- FAQ changes mirrored into `<SeoSchema>`; `npm run test:seo` passes; single `<h1>`; primary keyword
  retained in title and meta description.
- Position for the extract cluster recorded before and after in the SEO-02 table. Expect movement from
  85 to be slow and partly authority-bound; a small improvement here is a real one.

## Status 2026-09-11: blocked on the 2026-10-08 refresh

Shipped and indexing requested; nothing left to build. The remaining work is reading the verdict from
the shared Search Console pull the findings doc schedules for **2026-10-08** (section 1 names the
check for this ticket). Marked `blocked` rather than `open` so the board shows only work that can move
today; close it, or reopen it with a finding, from that refresh.
