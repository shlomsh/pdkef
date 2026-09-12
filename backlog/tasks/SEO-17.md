---
id: "SEO-17"
title: "Read 2026-10-08 · One content page on portal size limits, instead of three doorway pages"
status: "blocked"
priority: "P2"
epic: "seo-awaiting-read"
phase: "near-term"
depends_on: ["SEO-05", "SEO-06"]
legacy_state: "Open"
---

# SEO-17 · Read 2026-10-08 · One content page on portal size limits, instead of three doorway pages

*Re-filed 2026-09-12* from `search-acquisition` into `seo-awaiting-read`, read date 2026-10-08: live; first impressions and position.

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

**2026-09-12:** Shlomi reports the request for `/pdf-wont-compress-to-100kb/` went in on 2026-09-11
(a retry later that day went through after the quota error above, confirmed by Shlomi on 2026-09-12)
and he resubmitted it on 2026-09-12 together with
`/compress-image/` and `/photo-and-signature-size-for-forms/`. The eight-week read counts from
2026-09-11 and is due 2026-11-06. Dates also in `docs/seo-last-crawled.json` under `indexingRequested`.

## Photo and signature caps added (2026-09-12, SEO-19 follow-up)

Added one IBPS photograph/signature row to the portals table, one prose block, one FAQ entry, and a
link to `/compress-image/`. Reason: the person on this page has a form with three separately capped
uploads, photo, signature and document, and the page only answered the document one. LOC-11's
autocomplete sweep found that the photo query is what people type first in every locale, so leaving it
out was the bigger gap on the page, not a nice-to-have.

**Primary sources, both fetched 2026-09-12 from `ibpsreg.ibps.in`**, the domain the page already cites
for its 500 KB document cap:

- "Guidelines for scanning and Upload of Documents", IBPS CRP PO June 2025 cycle:
  `https://ibpsreg.ibps.in/crppoxvjun25/uploads/loadpdf.php?file=k7m5p+fQ15erzNvj0OHb1N7UnJp9sc%2FKYaao1bWrpok%3D&t=1LHArOLA2di0yczXwNDa083LmNWypw%3D%3D`
  - photograph: "Size of file should be between 20kb–50 kb"
  - signature: "Size of file should be between 10kb – 20kb"
  - left thumb impression: 20 KB to 50 KB, listed as its own row (not put on the page; out of scope
    for this ticket's document/photo/signature framing)
- "GUIDELINES FOR SCANNING & UPLOADING THE PHOTOGRAPH & SIGNATURE", RBI January 2026 cycle, hosted on
  the same IBPS portal:
  `https://ibpsreg.ibps.in/rbijan26/uploads/loadpdf.php?file=k7m5p+fQ15e6vNTdwteXoJjWzox%2FFppyXow%3D%3D&t=1LHArOLA2di0yczXwNDa083LmNWypw%3D%3D`
  - same photograph range; signature and thumb impression are phrased in one bullet: "10kb – 20kb for
    signature and left thumb impression should be between 20kb – 50kb"

Both cycles agree on the photograph and signature ranges, which is why the page states them as IBPS's
figures rather than citing a single cycle. The page links to the portal root
`https://ibpsreg.ibps.in`, not either PDF, because both PDF URLs are per-cycle tokenised links that
rotate when a new recruitment cycle opens, exactly the reason the page already cites the root for the
500 KB cap rather than a cycle-specific PDF.

**SSC considered and dropped.** Looked for an SSC equivalent of the same figures; only coaching sites
repeat them, and no primary `ssc.gov.in` document was fetchable. Not on the page.

**Read note.** The page was not indexed when this edit landed, its 2026-09-11 indexing request hit the
daily quota and was never remade (see above), so nothing indexed went stale from this change. The
eight-week read still starts from the date Shlomi requests indexing, recorded here when he does, and
it measures the page with this photo/signature addition already in it, not the pre-edit version.
Suggest `/compress-image/` gets requested the same day, so the two URLs run as one experiment against
the same portal-limit intent.
