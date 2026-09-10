---
id: "SEO-14"
title: "Positioning review: Blur and Redact, the cluster we are already winning"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-04"]
legacy_state: "Open"
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
