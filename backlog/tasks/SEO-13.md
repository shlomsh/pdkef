---
id: "SEO-13"
title: "Positioning review: Compress, where the honest answer costs us the query"
status: "open"
priority: "P2"
epic: "search-acquisition"
phase: "near-term"
depends_on: ["SEO-11", "SEO-05"]
legacy_state: "Open"
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
