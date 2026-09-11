---
id: "SEO-14"
title: "Positioning review: Blur and Redact, the cluster we are already winning"
status: "done"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-04"]
legacy_state: "Done 2026-09-11"
---

# SEO-14 · Positioning review: Blur and Redact, the cluster we are already winning

## Scope and acceptance

**Run as a dedicated review, per SEO-11.** `/redact/` is 64% of the site's clicks and 58% of its
impressions. It is the one page where the risk is not failing to grow but breaking what works, so this
review is held to a higher bar of evidence before it changes anything.

**Start from what is already true.** DEMO-07 established blur as the leading term with redact secondary,
and the numbers since have justified it: `blur pdf online` at position 8.78, an entire cluster of blur
phrasings on page one. SEO-04 handles the click-through defect on thirteen of those queries. This review
is the wider question: what does the page say, and what should it say, to someone about to hide something
they are afraid of exposing.

**The differentiator here is unusually strong and unusually explainable.** A blackout or blur box causes
the page to be flattened to an image on export, so the text underneath is gone rather than covered. Most
tools draw a rectangle over live text, and the classic failure - select, copy, paste, and read the
"redacted" text - still works on their output. Ours is checkable in ten seconds by the reader. Adobe and
Sejda rank at the top of `permanently redact pdf` on exactly this distinction, explained well.

**The caveat that must survive the review.** Blur is not removal. It alters pixels, and enough of the
original may be recoverable to matter. The page says so today and it stays said, prominently, even
though blur is our highest-volume term. A tool that is trusted with a medical bill has to be right about
this. It is also, incidentally, the most persuasive thing on the page.

**Also in scope:** the relationship between `/redact/`, `/blur-vs-blackout-vs-delete-pdf/` and
`/permanently-delete-text-from-pdf/`. Both content pages are unindexed (SEO-06) while their hub is the
site's strongest page. The review should say whether that is a linking problem, a distinctiveness
problem, or a sign the three pages should be two.

**Acceptance.**

- SEO-11 method followed and recorded, including the top ten for `blur pdf online` and
  `permanently redact pdf`.
- Any proposed change to the page's leading terms is argued against the current Search Console numbers,
  which are good. The default is no change.
- The blur-is-not-removal caveat is present in whatever ships, at no less prominence than today.
- A recommendation on the three-page cluster, coordinated with SEO-06 rather than duplicating it.
- Concrete copy as a diff; `npm run test:seo` passes; FAQ changes mirrored into `<SeoSchema>`.

## Progress (2026-09-11)

**Run end to end, per the SEO-11 method. Finding: the page's numbers and its core copy are already
right, and the review's one narrow gap - the "permanently" differentiator existing only in a FAQ answer,
not in the visible "How it works" copy - is the same shape of finding SEO-13 made for Compress, so it
ships the same way: elevate one sentence, touch nothing else. The three-page cluster question resolves
to "not a distinctiveness problem," verified by measurement rather than read.**

**1. Query list.** From section 1's By page table: `/redact/` is 45 clicks, 1,284 impressions, 3.50%
CTR, position 13.62 - by a wide margin the site's best page (64% of clicks, 58% of impressions site-
wide). The "blur / redact" intent cluster (section 1's By intent cluster table) is 22 clicks, 717
impressions, weighted position 13.5, read as "the franchise. Already page one on the specific terms."
Section 4's standings rows: `blur pdf online` at position 8.78 / 160 impressions (2026-09-10, cross-
checked against Bing/DuckDuckGo the same day), `blur text in pdf` at 11.44 / 32 impressions - both
flagged as SEO-04's territory (snippet CTR, not rank). Checked the query-to-page mapping per SEO-11's
amended step 1 (added by SEO-12 after Sign's cluster turned out to rank on the wrong pages): every blur/
redact query in section 1 and section 4 lands on `/redact/` itself - no misattribution risk here. No raw
per-query CSV is committed beyond what section 1 and section 4 already carry, so this review works from
that snapshot, per the same approach SEO-13 took rather than inventing finer numbers.

Separately, SEO-04's own ticket (read in full, since it depends on this review) found on 2026-09-11 that
Google's indexed snippet for `/redact/` is stale - it still serves the pre-2026-08-29 title/meta, last
crawled 2026-07-07. That matters directly for what this review can and cannot conclude: any copy audited
below is the *live* copy, not yet what a searcher sees in the SERP. The recrawl-recency problem itself is
scoped separately as SEO-28, per SEO-06's note, and is not re-solved here.

**2. Top-ten analysis**, `blur pdf online free` and `permanently redact pdf` (using "free" on the first
since the bare ticket phrase and the free variant return the same field - the same substitution SEO-13
made for its own two named queries). WebSearch (Bing/DuckDuckGo-style proxy; direct Google fetches are
blocked in this environment, confirmed again by SEO-04/05/12/13), sampled 2026-09-11.

- `blur pdf online free`: **PDkef's own `/redact/` appears in the results** (position unknown - WebSearch
  is not a rank tracker - but present in the top handful alongside Swifdoo, DocHub, Wondershare, Smallpdf,
  DonePDF). The auto-generated summary line for us, built from our own served copy, reads: *"runs entirely
  in your browser with your file never uploaded or stored outside your own device. It performs 'True
  Redaction' by converting the page into a flattened image, permanently destroying the underlying text
  data."* That is an external system independently landing on the exact differentiator this ticket names,
  built only from what the page already says - direct evidence the copy already communicates the claim
  clearly enough to be extracted by another program, without ever having used the word "permanently" in
  the site's own visible copy at the time this was sampled (only in one FAQ answer, per SEO-04). DonePDF's
  own snippet is a plain feature list ("FREE tool, no watermarks, no registration"), no mechanism claim.
- `permanently redact pdf`: Smallpdf, Xodo, iLovePDF, Adobe, PDFgear, PDF Complete, Gonitro, and
  saferedact.app - whose own title is literally *"How to Redact a PDF for Free - Permanently, Not Just
  Black Boxes."* The field's shared framing, read across all of these: "drawing a black box over text...
  doesn't actually redact it - the text is still there underneath, fully recoverable by anyone who knows
  how to select and copy it," against "real redaction removes the underlying data from the PDF file
  structure entirely... not hiding text behind a shape - it's deleting the text from existence." This is
  exactly the failure mode the ticket names, confirmed from the competitor side rather than assumed.
- Followed up specifically on Adobe and Sejda, since the ticket calls them out by name as ranking well on
  this distinction (their pages, not their names, may appear in our own analysis per SEO-11's rule - never
  in shipped copy). **Adobe** explains it as an *applied vs. unapplied* distinction: a redaction mark is
  reversible until the user clicks "Apply Redaction" and saves, at which point the underlying characters
  and pixels are purged from the file; a black rectangle drawn with the Comment/Draw tool, by contrast,
  is "not secure, as anyone can select and delete the black shape to view the text underneath." **Sejda**
  explains it as: draws filled rectangles directly onto the PDF content layer (not a separate object a
  reader can move), so covering and permanence are the same action, distinct from a draw-tool box that
  "can be removed by copying text or modifying the PDF." Both explain the *why*, not just assert the
  claim - which is the register SEO-11's claims table asks every review to hold itself to.
- Neither Adobe's nor Sejda's page, nor any of the eight other results sampled, gives the reader a way to
  *check* the claim themselves on their own output (open the file, search for the word, confirm it's
  gone). That is the one thing PDkef's FAQ answer already does that the field does not - see point 5.

**3. Word-by-word comparison.** Read `src/pages/redact.astro` (a two-line wrapper, all copy lives in
`tools.js`, same shape as `compress.astro`) and the full `redact` entry in `src/data/tools.js`
(`seoTitle`, `seoDescription`, `h1`, `subhead`, `gridDescription`, `aboutLead`, `freeNoteLead`, all three
steps, all seven FAQ answers). Confirmed the flattening mechanism against the actual code before
describing it, rather than trusting the copy: `src/editor/adapters/pdf/applyPageEdits.js` runs deletions
first (vector-preserving, via `deleteObjectsFromPdf` - the underlying PDF object is removed, the rest of
the page stays selectable) then `src/editor/adapters/pdf/redact.js`'s `redactPdf()` for anything else -
which renders each marked page to a canvas via pdf.js, draws the blackout/blur/whiteout instructions onto
it, re-embeds the result as a JPEG, and builds a brand-new page from that image; every page with no
redaction box on it is copied losslessly, untouched. This is exactly what the copy claims: Delete removes
an object (searchable text survives elsewhere on the page); Blackout/Blur/Whiteout flatten the whole
marked page to a raster image (no text layer survives on that page at all). No embellishment found in
either direction - the copy does not claim more than the code does, and does not undersell it either.

Where the differentiator actually lives, checked place by place:

- **Steps** (`steps[2].text`, visible, not collapsed - the FAQ accordion is closed by default per
  CLAUDE.md's disclosure invariant): *"Delete removes the selected element from the page. Pages with
  Blur, Blackout or Whiteout flatten automatically into one image, making that export a one-way change
  with no selectable or searchable text on the marked page."* This already states the substance of the
  differentiator (flattened, one-way, no searchable text) above the fold, in the "How it works" section a
  scanning visitor reads before any FAQ. It does not use the word "permanently," and does not use the
  legal term "redaction" - both of which appear in the query the ticket names and in the WebSearch summary
  that independently extracted our own claim (point 2).
- **`aboutLead`** (also visible, same card, directly under the H2): before this review, stated only *what*
  each tool does (Delete/Blur/Blackout/Whiteout), not the flattening consequence at all. This is the gap -
  the same shape SEO-13 found in Compress's `aboutLead` for its own honest-miss claim: a true, differentiating
  fact that existed only in a FAQ answer nobody opens by default.
- **FAQ** ("Can someone remove the blur or black box after download?"): already carries "permanently"
  (added by SEO-04, 2026-09-10) and the full reader-runnable test - *"open the downloaded PDF and search
  for the word you covered; it will not be found, because it is no longer there as text"* - which is
  exactly SEO-11's `/open-source-pdf-editor/` devtools-test pattern applied to this claim: a test the
  reader can run in ten seconds on their own machine, not an assurance to take on faith. The blur caveat
  ("Blur still leaves altered pixels that may reveal clues, so it is not a substitute for a solid
  blackout") sits in the same answer, immediately after.
- **`subhead`**: states flattening ("Marked pages flatten automatically when you download") but not the
  word "permanently" or its consequence. Left alone - see "What did not ship" below.

**4. Named differentiator, evidenced.** The flattening-makes-redaction-permanent claim, evidenced three
ways: (a) code-level, per point 3 above, verified against `redact.js`/`applyPageEdits.js` directly, not
inferred from copy; (b) competitively, across ten-plus results on two queries and two proxy engines, the
winning pages (Adobe, Sejda, saferedact.app) all lead with exactly this distinction, explained with a
mechanism, which confirms it is the thing that ranks well when stated with evidence, per the ticket's own
framing; (c) externally, a WebSearch-generated summary of our *existing* copy on `blur pdf online free`
independently reconstructed the claim in almost the ticket's own words ("permanently destroying the
underlying text data") without the word "permanently" appearing anywhere in our visible copy at sampling
time - meaning the substance was already legible to an outside reader/summarizer even before this
review's edit, and the edit makes it explicit rather than introducing a new claim.

**5. Caveat prominence, checked before and after.** The blur-is-not-removal caveat
("Blur still leaves altered pixels that may reveal clues, so it is not a substitute for a solid
blackout... Check repeated details and hidden information elsewhere in the PDF too") lives in the same
FAQ answer as the permanence claim and the reader-runnable test, unchanged by this review. It is not
touched by the one shipped edit (which is to `aboutLead`, a different field), so it carries exactly the
prominence it had before: present, in the same answer, same position, same wording. No FAQ text changed
at all this review, so `<SeoSchema>`'s generated `faq` array needs no re-mirroring - confirmed by reading
`SeoSchema.astro`, whose `faq` prop is built straight from `tool.faq`.

**6. The three-page cluster.** Read both content-pages YAML files in full
(`src/content/content-pages/blur-vs-blackout-vs-delete-pdf.yaml`,
`src/content/content-pages/permanently-delete-text-from-pdf.yaml`) end to end, not just their frontmatter.
They are not near-duplicates of each other or of `/redact/`:

- `/redact/` is the transactional tool page: pick a mode, use the editor, download.
- `/blur-vs-blackout-vs-delete-pdf/` is a **decision guide across all four options** (Delete, Whiteout,
  Blackout, Blur) - one real-editor screenshot and a worked use case per option, a comparison table, and a
  dedicated section on what flattening changes, aimed at "which one do I want."
- `/permanently-delete-text-from-pdf/` is a **deep dive on Delete specifically** - the one option that
  does *not* flatten, aimed at "I have a specific value to remove and replace," with its own worked
  examples (replace form data, clean up a page, remove an image) that don't appear on the comparison page.

Ran SEO-06's own method on this pair after a fresh `npm run build`, to check the premise with numbers
rather than a read - the same discipline SEO-06 applied to `/image-to-pdf/` vs `/pdf-to-image/`, which
also looked like an "adjacent names, shared framing" case and measured out as not one. Extracted each of
the three pages' visible body text from `dist/`, split into sentences, and counted verbatim sentence
matches between every pair:

| Pair | Shared verbatim sentences | Share |
| --- | --- | --- |
| `/redact/` -> `/blur-vs-blackout-vs-delete-pdf/` | 11 of 83 | 13.3% |
| `/redact/` -> `/permanently-delete-text-from-pdf/` | 10 of 83 | 12.0% |
| `/blur-vs-blackout-vs-delete-pdf/` -> `/permanently-delete-text-from-pdf/` | 12 of 94 | 12.8% |
| `/permanently-delete-text-from-pdf/` -> `/blur-vs-blackout-vs-delete-pdf/` | 12 of 60 | 20.0% |

**Every shared sentence, on every pair, is site chrome** - the `ToolCrossLinks`/related-tool grid
descriptions ("Merge PDF: combine multiple PDFs into one document..."), the "same suite, more PDF tools"
line, and the free/no-upload boilerplate. None of it is body copy specific to redaction, deletion, or
flattening. That is the same finding SEO-06 made for `/pdf-to-image/` vs `/image-to-pdf/` (232 shared
words, entirely chrome, zero overlap in the tools' own H1/subhead/steps/FAQ) applied to a different pair,
and it holds here too: **this is not a distinctiveness problem.** A raw word-overlap pass (not sentence-
level) was tried first and returned 80-93% - which would look alarming - but that number is dominated by
shared function words and repeated domain vocabulary ("pdf", "the", "page") across any two pages about the
same product, exactly the trap SEO-06's own writeup warns about with its own word-share metric ("`/redact/`
scores 52.9%... if winners and losers sit in the same band, this number is not measuring whatever
separates them"). Sentence-level verbatim matching is the more honest instrument and is what's reported
above.

**So: not a distinctiveness problem, and not a merge candidate.** SEO-06 already covers the linking half -
its progress note (read in full before writing this) confirms both content pages are already one hop from
`/redact/` via `RelatedGuides` on their pre-existing `hub` field, which predates SEO-06's `alsoHub` work
entirely. There is nothing left in the "distinctiveness or linking" half of this ticket's question for
this review to add; both are already handled, one structurally (real content difference, now measured) and
one mechanically (SEO-06's linking work). What remains - whether either page has actually been crawled -
is SEO-06's own open item (the Week 4, 2026-10-08 gate) and this review does not re-open or duplicate it.

**7. Shipped.** One copy change, `aboutLead` in the `redact` entry of `src/data/tools.js`, elevating the
permanence claim from FAQ-only into the visible "How it works" card - the same move, and the same reason,
as SEO-13's `compress` edit:

```diff
- 'Choose the result you want. Delete removes a selected text or image element from the PDF page. Blur softens visual detail, Blackout creates a solid cover, and Whiteout clears an area visually. Blur, Blackout and Whiteout work on typed PDFs and scans.',
+ "Choose the result you want. Delete removes a selected text or image element from the PDF page. Blur softens visual detail, Blackout creates a solid cover, and Whiteout clears an area visually. Blur, Blackout and Whiteout work on typed PDFs and scans, and because the marked page is flattened into one image on download, the redaction is permanent: there's no text layer left underneath to recover.",
```

No FAQ text changed, so `<SeoSchema>` needed no re-mirroring (confirmed above). No claim beyond what the
code does was added (the sentence states the mechanism, not a guarantee about the blur caveat, which stays
where it was). No competitor named anywhere in shipped copy - Adobe and Sejda appear only in this progress
note, per SEO-11's rule. `npm run build` and `npm run test:seo` (23 pages) both pass against the built
output with this change in.

**8. What did not ship, and why.** Two changes were considered and rejected:

- **Adding "permanently" to `h1`/`seoTitle`/`subhead`.** This is exactly what the ticket's acceptance
  criterion warns against ("any proposed change to the page's leading terms is argued against the current
  Search Console numbers, which are good"). The page already ranks position 8.78 on `blur pdf online` and
  13.62 overall carrying its current title; SEO-04's own diagnosis (read in full) found the live title/meta
  has not even been recrawled yet, so touching it now would add a second unmeasured variable on top of an
  already-unmeasured one, muddying whatever the 2026-10-08 refresh is meant to isolate. Left untouched.
- **Rewording the FAQ answer to add more.** It already carries the permanence claim, the mechanism, the
  reader-runnable test, and the blur caveat, in that order, and is the one piece of copy in the whole
  sampled competitive field (point 2) that gives the reader a way to verify the claim on their own output.
  Editing it further risked diluting the one part of the page that is already doing exactly what SEO-11
  asks every claim to do. Left untouched, at its existing prominence.

**Folded back into SEO-11 (docs/seo-competitive-findings.md section 6):** no protocol gap found. The
query-to-page check (added after SEO-12) worked as intended and confirmed no misattribution for this
cluster; the sentence-level pairwise method borrowed from SEO-06 turned out to generalize cleanly to a
content-page-vs-content-page question it wasn't originally built for, which is worth knowing for SEO-15/16
if either surfaces a similar "are these two pages the same" question, but does not itself need a rule
change since it's the same instrument, not a new one. No addition made.
