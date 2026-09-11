---
id: "SEO-13"
title: "Positioning review: Compress, where the honest answer costs us the query"
status: "done"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-05"]
legacy_state: "Done 2026-09-11"
---

# SEO-13 · Positioning review: Compress, where the honest answer costs us the query

## Scope and acceptance

**Run as a dedicated review, per SEO-11.** `/compress/` is the site's second-best page (12 clicks, 326
impressions, position 10.39) and the one where our positioning and the highest-volume query in the
cluster point in opposite directions.

`compress pdf without losing quality` is 45k-110k searches a month. Our compressor rasterizes. We
cannot rank for that honestly, and SEO-05 makes the page say so. This review's job is to find what we
*can* say that is both true and worth clicking - and the candidates are real:

- **A target size that is actually searched for**, with a real search rather than a fixed preset. The
  DPI ladder plus binary quality search in `compressPdfToTarget()` is better engineering than most of
  what outranks us, and the page describes it in one FAQ answer.
- **The honest miss.** When the target cannot be met, we say so and hand back the smallest result found.
  Competitors return something and let the portal reject it. That is a genuine differentiator and it is
  currently one clause in a FAQ.
- **The passthrough.** A file already under the target comes back untouched rather than degraded for
  nothing. Nobody advertises this because on a server it costs them a job to skip.
- **No daily cap.** The compress cluster is where free-versus-freemium bites hardest, because
  compression is the operation people repeat.

**The cross-tool finding this review owns.** 128 impressions came from queries with no "pdf" in them:
`file compressor to 100kb` (81 impressions, position 9.60), `reduce file size to 100kb` (26),
`image size reduce to 100kb`, `100 kb document size`. Those people land on a PDF-only tool. SEO-19
proposes building the image compressor; this review should say what `/compress/` says to that visitor in
the meantime, and what it should link to once SEO-19 exists.

**Acceptance.**

- SEO-11 method followed and recorded, including the top ten for `compress pdf to 100kb` and
  `file compressor to 100kb`.
- A named differentiator, argued rather than asserted, with the evidence for it.
- Concrete proposed copy as a diff.
- Nothing in the proposal implies lossless compression or contradicts SEO-05.
- An explicit recommendation on what `/compress/` does with non-PDF size traffic, fed into SEO-19.
- `npm run test:seo` passes for anything that ships.

## Progress (2026-09-11)

**Run end to end, per the SEO-11 method. Finding: two of the three named differentiators (passthrough,
no daily cap) were already surfaced outside the FAQ by SEO-05; the third (the honest miss) was not, and
that is a real, narrow gap - one line, added to the same visible copy SEO-05 already edited. The
cross-tool non-PDF-keyword finding is a recommendation for SEO-19, not something to build now.**

**1. Query list.** From section 1's By page table: `/compress/` is 12 clicks, 326 impressions, 3.68%
CTR, position 10.39 - the site's second-best page. The "compress to a size" intent cluster (section 1's
By intent cluster table) is 7 clicks, 194 impressions, weighted position 9.8, read as "page one,
converting poorly." Section 4's standings row for `compress pdf to 100kb (cluster)` names
smallseotools, PDNob, DocHub as who's above us, cross-checked 2026-09-10. The ticket's four named
non-PDF queries (`file compressor to 100kb`, `reduce file size to 100kb`, `image size reduce to 100kb`,
`100 kb document size`, 128 impressions combined, no "pdf" in any of them) are recorded in section 4's
`file compressor to 100kb` row (81 impressions, position 9.60) and in the ticket text itself; no
committed raw per-query CSV exists in this worktree beyond what's already in the findings doc, so this
review works from that snapshot rather than inventing finer-grained numbers, per the ticket's own
instruction. Checked the query-to-page mapping per SEO-11's amended step 1 (added by SEO-12): both the
100KB cluster and the non-PDF queries land on `/compress/` itself, per section 4's table and SEO-05's
own diagnosis - no misattribution risk here, unlike Sign's.

**2. Top-ten analysis.** WebSearch (a Bing/DuckDuckGo-style proxy; Google direct capture is blocked for
scripted fetches, per SEO-04/05/12), sampled 2026-09-11.

- `compress pdf to 100kb online free` (used in place of the exact ticket phrase, which returns the same
  field): top results are Zamzar, Smallpdf, Wondershare PDFelement, Duplichecker, 11zon/bigpdf,
  compresspdfto100kb.com, jpeg-optimizer.com, Pi7, Adobe Acrobat Online. Every dedicated tool in the top
  nine is a PDF-only compressor competing on the same "free", "no sign up", "secure" vocabulary SEO-05
  already found saturated on the adjacent `compress pdf to 100kb free` query.
- `file compressor to 100kb`: same PDF-tool field (Duplichecker, Wondershare, 11zon, Smallpdf), plus one
  genuine outlier - Pi7's *image* compressor to 100kb, and Adobe's own "how to compress pdf to 100kb"
  blog post. Confirms the ticket's premise directly: a meaningful slice of this query's intent is not
  PDF-specific, and at least one competitor (Pi7) already serves both a PDF and an image compressor from
  the same brand, which is the shape SEO-19 would give us.
- **The claims, read closely, repeat SEO-05's finding rather than adding a new one.** Duplichecker's own
  listed title is literally "Compress PDF to 100kb *without losing quality*"; other snippets promise
  "high quality", "without affecting quality", "without compromising quality" - the same lossless-sounding
  language SEO-05 already flagged as something PDkef must never imply (rasterization is real). Smallpdf's
  two-tier "Basic (free) / Strong (Pro)" split, visible directly in the search snippet, is the freemium
  cap SEO-11's claims table says we can evidence and they cannot.
- **None of the sampled snippets or landing pages state what happens when the target can't be hit.**
  Every one either implies success ("compress to 100kb" as a flat promise) or is silent. This is the
  same absence SEO-05 found on the adjacent query, now confirmed again on both queries this ticket asks
  for - and it is the gap this review closes below.

**3. Word-by-word comparison.** Read `src/pages/compress.astro` (a two-line wrapper around
`ToolPageLayout` and `PdfCompressTool`, no copy of its own - all copy lives in `tools.js`) and the full
`compress` entry in `src/data/tools.js` (`seoTitle`, `seoDescription`, `h1`, `subhead`, `gridDescription`,
`aboutHeading`, `aboutLead`, `freeNoteLead`, all three steps, all seven FAQ answers), and confirmed each
claim against the code it describes (`compressPdfToTarget()` in `src/lib/compress.js`: DPI ladder
(`TARGET_SCALE_LADDER`) plus a binary quality search per tier, a passthrough for `file.size <=
targetBytes` that returns the original `Blob` untouched, and a `metTarget: false` fallback that returns
the smallest `bestResult` found within a time budget rather than throwing or silently shipping something
oversized - and `PdfCompressTool.tsx` surfaces that miss in the UI: "Closest achievable size: ... couldn't
be reached without making the document unreadable, so this is the smallest readable result.").

Checked where each of the three candidate differentiators actually lives on the page, since visibility
(not just existence) is what a scanning searcher sees:

- **Passthrough** ("if your file is already under the target, it comes back untouched") - already in
  `aboutLead`, which `ToolAboutCard.astro` renders as static server-rendered text in the "How it works"
  card, directly under the H2 and above the FAQ (confirmed by reading the component). SEO-05 put it
  there on 2026-09-10. No further work needed; correctly not "one clause in a FAQ."
  - Additional passthrough confirmation: it is also implied but not restated in the FAQ answer "Does
    compressing a PDF affect text search or copying?", which is consistent, not redundant filler.
- **No daily cap** - already in `freeNoteLead` ("as many times as you need, with no watermark or daily
  cap"), which `ToolAboutCard.astro` renders in the same visible "Free for everyone" section, same card,
  same fold. Also correctly not FAQ-only.
- **The honest miss** - this is the one the ticket's premise is right about. It exists only in FAQ
  answer 2 ("How does the target size compression work?") and in the in-app UI message after a
  compression run. Nothing in `aboutLead`, `subhead`, or `freeNoteLead` - the three places a visitor
  reads before ever opening the (collapsed-by-default, per CLAUDE.md's FAQ disclosure invariant) FAQ
  accordion - states it. The `subhead` gestures at it obliquely ("Some files need a larger limit to stay
  readable") but never says the tool tells you when that happens, which is the actual differentiator
  (competitors are silent or vague on this, per the top-ten analysis above).

**4. Named differentiator.** The honest miss, specifically, evidenced two ways: (a) code-level - the
time-budgeted search in `compressPdfToTarget()` always returns a real result (`bestResult`) and a
`metTarget` boolean rather than throwing, and the component renders that boolean as a stated fact, not a
silent truncation; (b) competitively - across ten results on two related queries and two search engines,
zero sampled competitors state this behavior, and several actively imply the opposite (guaranteed,
lossless-sounding success). This matches SEO-05's own finding on the adjacent `compress pdf to 100kb
free` query almost exactly, which is expected: SEO-05 diagnosed the same gap from the SERP side before
this review verified it from both the code and a second sampling pass. Passthrough and no-cap remain
real, evidenced differentiators (per SEO-11's claims table: "Free" and the architecture behind
passthrough) but were already shipped visibly by SEO-05, so they needed no further copy work here -
only confirmation, which is recorded above rather than skipped.

**5. The cross-tool finding on non-PDF-keyword traffic.** Today, a visitor who searches `file compressor
to 100kb` and lands on `/compress/` sees a page whose `h1` ("Compress PDF to 100KB Free: Reduce File
Size"), `seoTitle`, and every step and FAQ answer are explicitly PDF-only - there is no image-compression
path, and no in-page acknowledgment that the visitor might have wanted one. Recommendation, to feed into
SEO-19 rather than to build now (per the ticket's own instruction that this is a recommendation to
record): once an image-to-target-size compressor exists, add it as one of `/compress/`'s standard
`ToolCrossLinks` entries (the same mechanism already used site-wide for related-tool navigation - see
`src/components/ToolCrossLinks.astro` and its use on the other tool pages) rather than rewording
`/compress/`'s own PDF-specific copy to hedge toward images. This keeps `/compress/`'s `h1` and FAQ
honestly PDF-only (a page that tries to serve both intents in one H1 dilutes the exact-match keyword
SEO invariant CLAUDE.md protects) while giving the image-search visitor a one-click path once the tool
exists. Do not add a cross-link to a tool that does not exist yet - a dead or placeholder link fails the
"SEO pages need real value" standard as surely as a doorway page would.

**6. Shipped.** One copy change, `aboutLead` in the `compress` entry of `src/data/tools.js`, adding the
honest-miss sentence to the same visible "How it works" text SEO-05 already edited:

```diff
- 'Reduce the file size of your PDFs, right in your browser. No upload, no server. To reach a small target, pages are turned into images, so selectable text and links are lost on any page that changes. If your file is already under the target, it comes back untouched - nothing lost.',
+ "Reduce the file size of your PDFs, right in your browser. No upload, no server. To reach a small target, pages are turned into images, so selectable text and links are lost on any page that changes. If your file is already under the target, it comes back untouched - nothing lost. If a target can't be hit without making the document unreadable, the tool says so and hands you the smallest readable result instead of quietly handing back something too big or too blurry to use.",
```

No FAQ text changed, so no `<SeoSchema>` mirroring was needed (its `faq` array is unaffected). No claim
of lossless compression was added or implied anywhere; the new sentence states a limit ("if a target
can't be hit") rather than a guarantee. No competitor is named. `npm run build`, `npm run test:seo` (23
pages) and `npm run test:csp` (23 files) all pass against the built output; `PdfCompressTool.test.tsx`
(4 tests) passes unaffected, since the change is copy-only and outside anything that test asserts on.

**Not shipped, and why:** a rewrite of `subhead` or `seoTitle`/`seoDescription` was considered and
rejected. `seoTitle`/`seoDescription` already carry SEO-05's snippet-differentiation fix
("If it can't hit the target, we say so instead of guessing") - duplicating that exact claim into
`aboutLead` in different words would read as padding, not reinforcement, to a visitor reading both in
sequence. `subhead` already carries a softer, complementary version ("Some files need a larger limit to
stay readable") that sets expectations before the tool is used; sharpening it into a duplicate of the
new `aboutLead` sentence was rejected for the same reason. One clear statement of the honest-miss
behavior, in the one place it was missing, is the whole gap - not a cue to rewrite copy that was already
correct.

**Folded back into SEO-11 (docs/seo-competitive-findings.md section 6):** no protocol gap found this
time. The method's step 1 (query-to-page check, added by SEO-12) worked as intended and confirmed
`/compress/` has no misattribution risk. No addition made.
