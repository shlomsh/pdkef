---
id: "SEO-05"
title: "The 100KB cluster ranks and does not convert, and the page implies something untrue"
status: "open"
priority: "P1"
epic: "search-acquisition"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# SEO-05 · The 100KB cluster ranks and does not convert, and the page implies something untrue

## Scope and acceptance

**`/compress/` is the site's second-best page and it is leaving most of the cluster on the table.**
12 clicks from 326 impressions at position 10.39. Inside that, `compress pdf to 100kb free` drew 16
impressions at position 9.88 for zero clicks, `100 compress pdf` 10 at 8.10 for zero, `100kb compress
pdf` 6 at 10.00 for zero. Same shape as SEO-04: page one, no clicks. Diagnose it the same way - look at
the rendered SERP first, form a hypothesis, then edit.

Note what the page already has, so this ticket does not re-do finished work. The title is
`Compress PDF to 100KB Free - Reduce File Size | PDkef`, the h1 matches, and `compressPdfToTarget()` in
`src/lib/compress.js` implements a real DPI ladder with a binary quality search, 100 KB / 200 KB /
500 KB / 1 MB quick-picks, a 20-second budget and an honest `metTarget: false` surfaced in the UI. The
capability is genuinely there and genuinely better than most of what ranks above us.

**The second half is a correction, not an optimisation.** The research names
`compress pdf without losing quality` (45k-110k/mo) as a target, and it is one we must not chase on
those terms. PDkef's compressor rasterizes: pages become JPEG images, so selectable text, embedded
links and screen-reader access are gone. The FAQ says this. The framing around it should say it too,
plainly and early, because a visitor who arrives on that query and downloads a file whose text no
longer selects has been misled by us, and that is worse than not ranking. Say what is lost, say when
the tool returns the original untouched (already under the target), and let the honesty be the
differentiator - most competitors ranking for that phrase do not mention it either.

**Acceptance.**

- Rendered SERP for `compress pdf to 100kb free`, `100 compress pdf` and `file compressor to 100kb`
  recorded for us and our neighbours before any edit, with a stated hypothesis for the zero CTR.
- The page states, above the FAQ, that compression rasterizes and what that costs. No phrasing anywhere
  on the page implies lossless compression.
- The already-under-target passthrough is stated where a visitor will see it, since it is the one case
  where nothing is lost.
- FAQ changes mirrored into `<SeoSchema>`; `npm run test:seo` passes; primary keyword still in title,
  single `<h1>` and meta description.
- Before and after CTR for the cluster in the SEO-02 table at the next refresh.
