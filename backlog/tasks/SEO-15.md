---
id: "SEO-15"
title: "Positioning review: the three tools Google has never looked at"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-06"]
legacy_state: "Open"
---

# SEO-15 · Positioning review: the three tools Google has never looked at

## Scope and acceptance

**Run as a dedicated review, per SEO-11, covering `/image-to-pdf/`, `/pdf-to-image/` and `/edit-pdf/`
together.** All three returned zero impressions in three months. They are reviewed as one because their
shared problem is that a crawler cannot tell them apart quickly, and reviewing them separately is how
that problem survives.

**The method needs an adjustment here, and the reviewer must notice it.** SEO-11 step 1 says start from
our Search Console queries. These pages have none. So the query set has to come from elsewhere - the
research doc's volumes, the phrasings competitors' own pages target, and adjacent queries the site does
receive - and the reviewer should say plainly that this is a weaker basis than the other reviews had.

**What is at stake.** `jpg to pdf` is a query with millions of monthly searches, split between iLovePDF
and Smallpdf, and we have the tool and appear for it nowhere. That is not a copy problem alone (SEO-06
covers indexing), but the copy is what decides whether being indexed is worth anything.

**The specific hazard.** `/image-to-pdf/` and `/pdf-to-image/` are inverse operations with adjacent
names and, currently, a great deal of shared framing. A reader landing on the wrong one should know
within a second. Two different lead sections is the minimum; the review should consider whether the two
should look visibly different rather than merely read differently.

**Per-tool differentiators worth testing** - and if one of them turns out to be weak, the review should
say so rather than manufacture something:

- **Image to PDF** is the app's origin story: a batch of phone photos or scans into one file, on the
  phone that took them, with nothing uploaded. `src/lib/imageToPdf.js` embeds at native size, one page
  per image. Photos of documents are a category people are right to be careful with.
- **PDF to Image** deliberately ships no zip dependency and downloads sequentially instead
  (`PdfToImageTool.tsx:125`). That is a real decision with a reason and it is invisible on the page.
  Worth deciding whether it is a feature to explain or a limitation to state.
- **Edit Pages** covers reorder, remove, rotate and page numbering. Its overlap with `/split/` on
  extract-shaped queries is SEO-09's subject; this review should not settle it independently.

**Acceptance.**

- SEO-11 method followed, with the substituted query basis stated and its weakness acknowledged.
- Each of the three has a named differentiator or an explicit finding that it has only the four general
  claims from SEO-11's table.
- A concrete recommendation for making `/image-to-pdf/` and `/pdf-to-image/` distinguishable within one
  screen, coordinated with SEO-06's distinctiveness measurement rather than duplicating it.
- Concrete copy as a diff for all three; `npm run test:seo` passes; single `<h1>` each.
