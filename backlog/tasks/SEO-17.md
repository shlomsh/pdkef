---
id: "SEO-17"
title: "One content page on portal size limits, instead of three doorway pages"
status: "blocked"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-05", "SEO-06"]
legacy_state: "Open"
---

# SEO-17 · One content page on portal size limits, instead of three doorway pages

## Scope and acceptance

**The research recommended building `/compress-pdf-100kb/`, `/compress-pdf-200kb/` and
`/compress-pdf-500kb/`. That is rejected, and the reasoning is worth keeping** so it is not proposed
again. Three pages differing only in a number are the template-swapped doorway pattern CLAUDE.md rules
out. They would also compete with `/compress/`, whose h1 is already
`Compress PDF to 100KB Free: Reduce File Size` and which ranks at 10.39 for that cluster - so the pages
would split an asset rather than add one. And the site currently has nine URLs Google has not bothered
to crawl; three more near-identical ones is the worst possible thing to hand it.

**What the query really is.** The Search Console detail shows people arriving from
`compress pdf to 100kb with good quality`, `compress pdf 110 kb`, `pdf 80 kb to 100kb`,
`extreme compress pdf to 100kb`, `how do i reduce file size to 100kb`. India is the top country by a
wide margin. These are people with a specific number imposed on them by an application portal, who do
not know whether their file can reach it, and who will try three tools before giving up.

Nobody has written the page that answers the actual question: **what determines whether a given PDF can
reach 100KB, and what to do when it cannot.** That page teaches something verifiable, which is the bar
CLAUDE.md sets for a new content page, and it is a page a competitor selling compression has no
incentive to write.

**What it must contain to be worth publishing** - if the research cannot support these, the page should
not ship:

- Measured examples run through PDkef's own ladder, with the numbers: a one-page typed document, a
  one-page scan, a five-page scan, a ten-page scan, each with its starting size, its achieved size, the
  DPI and quality the search settled on, and an honest judgement of whether the result is still readable.
- The mechanism, in plain words: why page count is the dominant term, why a scan behaves differently
  from typed text, and why 100KB is achievable for some documents and not others.
- **The awkward fact, stated rather than buried:** a ten-page scan cannot reach 100KB and stay readable.
  What to do instead - split it, submit fewer pages, or ask whether the portal will take 200KB.
- The specific portals people are actually fighting with, with their documented limits and a citation for
  each. Uncited limits do not go on the page; a wrong number here is worse than no page.

**Mechanics.** A YAML entry in `src/content/content-pages/`, validated by the Zod schema in
`src/content.config.ts`, registered in `src/data/contentPages.js` with `hub: 'compress'` so it is
reachable and gets a sitemap entry. Body copy is the two-tag dialect: `<strong>` and `<a href="...">`
only, internal links slash-terminated, no classes in the content file. A `table` block carries the
measurements. Four to twelve FAQ entries.

**Acceptance.**

- The page exists as one YAML entry with a registry entry, and the build's two-registry cross-check
  passes.
- Every measurement in it was produced by running a real file through the shipped tool, and the files
  and results are reproducible from what the ticket records.
- Every portal limit cited to a source.
- The ten-page-scan limitation is stated in the body, not only in a FAQ answer.
- `npm run test:seo` passes; FAQ mirrored; single `<h1>`; trailing slashes correct.
- It is the only new URL shipped that week, per the epic's sequencing.

## Status 2026-09-11: blocked on the 2026-10-08 refresh

Shipped; nothing left to build, but **indexing has not been requested for `/pdf-wont-compress-to-100kb/`** - a new URL is not in any earlier batch, so this one needs its own request, dated here when made. The remaining work is reading the verdict from
the shared Search Console pull the findings doc schedules for **2026-10-08** (section 1 names the
check for this ticket). Marked `blocked` rather than `open` so the board shows only work that can move
today; close it, or reopen it with a finding, from that refresh.

**2026-09-11, later:** Shlomi attempted the indexing request for `/pdf-wont-compress-to-100kb/` and Search Console answered *Quota Exceeded* (the day's quota went to the three `/he/` tool pages). Still unrequested; retry on the next day and record the date here.
