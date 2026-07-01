# SEO Audit — pdkef.vercel.app

Date: 2026-07-01
Scope: Live deployment (`https://pdkef.vercel.app/`) + project source (`/Users/sh/work/pdkef`)
Business type: Free client-side web utility (SaaS-like tool suite, 10 pages: 1 hub + 9 tools)

> Note: a prior audit (2026-06-30) exists in this same directory but was run against a different domain/project path (`pdf-merge-online-free.vercel.app` / `/Users/sh/work/pdf-merge`) before the project was renamed to PDkef and expanded to a multi-tool hub. This report supersedes it. The critical placeholder-domain bug flagged in that audit (`astro.config.mjs`'s `site` value) has since been fixed, along with the missing OG image and Apple touch icon.

## Executive Summary

**SEO Health Score: 85 / 100**

The site is in strong technical shape: correct canonical domain everywhere, valid split-layer CSP with no `unsafe-inline`, all 10 sitemap URLs return 200, unique titles/H1s/meta descriptions per page, valid `SoftwareApplication` + `FAQPage` JSON-LD on every tool page, and a well-written `llms.txt`. The main finding is a genuine **orphan page**: `/protect/` is fully built, schema'd, and listed in the sitemap, but has **zero internal links pointing to it anywhere on the site**.

### Top 5 Issues
1. **`/protect/` is an orphan page** — not linked from the homepage tool grid, nor from any other tool page. The homepage's "Protect & Unlock" card links only to `/unlock/`. Google can still find it via `sitemap.xml`, but orphan pages get weaker crawl priority and no descriptive anchor-text signal, and human visitors on `/unlock/` or the homepage have no path to discover the Protect tool at all.
2. **No cross-linking between tool pages** — every tool page (`/merge/`, `/split/`, etc.) links only back to `/` and `/licenses`. A user who lands directly on `/merge/` from search has no way to discover `/compress/`, `/split/`, or any other tool without navigating back to the homepage. This is a missed internal-linking opportunity (link equity + user journey) across all 9 tool pages, not just `/protect/`.
3. Two titles run slightly over the ~60-char safe zone: `/compress/` (64 chars) and `/edit-pdf/` (65 chars raw, ~61 rendered after `&amp;` decodes to `&`). Low risk of truncation but worth trimming if revisiting copy.
4. Sitemap is still a hand-written static file (per `CLAUDE.md`'s own documented caveat) — accurate today (all 10 tool routes present, `/protect/` included despite the internal-linking miss), but will silently drift if a new tool page is added and this file isn't updated in the same PR.
5. No field/lab Core Web Vitals data available in this session (no PageSpeed/CrUX API access) — architecture strongly favors good CWV (zero-JS SEO shell, single lazy-hydrated Preact island) but this is unverified, not measured.

### Top 5 Quick Wins
1. Add `/protect/` to the homepage tool grid (`src/pages/index.astro`) as its own card, or at minimum add a "Need to add a password instead? Protect a PDF" cross-link from `/unlock/`.
2. Add a small "Other tools" link row/footer section to each tool page linking to 2-3 related tools (e.g. Merge ↔ Split ↔ Compress; Protect ↔ Unlock). Reuse a shared component so it's a one-time build.
3. Trim `/compress/` and `/edit-pdf/` titles to ≤60 characters.
4. Run Lighthouse/PageSpeed Insights against the live URL once the linking changes ship, to get real LCP/INP/CLS numbers rather than the lab estimate here.
5. Consider generating the sitemap dynamically (`@astrojs/sitemap`) now that the site has grown to 10 pages, to remove the manual-sync risk noted in item 4 above.

---

## Technical SEO

| Check | Status | Notes |
|---|---|---|
| HTTP → HTTPS redirect | ✅ Pass | 308 redirect confirmed |
| robots.txt reachable & correct | ✅ Pass | `Allow: /`, correct `Sitemap:` directive pointing at the real domain |
| sitemap.xml reachable & correct | ✅ Pass | All 10 URLs use `https://pdkef.vercel.app` (previous placeholder-domain bug is fixed) |
| All sitemap URLs return 200 | ✅ Pass | Verified `/`, `/merge/`, `/sign/`, `/pdf-to-image/`, `/split/`, `/compress/`, `/edit-pdf/`, `/unlock/`, `/protect/`, `/image-to-pdf/` |
| Canonical tag present & correct | ✅ Pass | Unique, self-referential, correct domain on every page checked |
| HTTP security headers | ✅ Pass | HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` |
| CSP | ✅ Pass | Meta-tag CSP carries hashed `script-src`/`style-src` (10 script hashes, 5 style hashes observed on homepage), no `unsafe-inline`; header CSP adds `frame-ancestors 'none'`. Matches the documented split-layer architecture in `CLAUDE.md`. |
| Caching | ✅ Pass | `cache-control: public, max-age=0, must-revalidate` + ETag; Vercel edge `x-vercel-cache: HIT` observed |
| Mobile viewport meta | ✅ Pass | `width=device-width, initial-scale=1, viewport-fit=cover` |
| `noindex` check | ✅ Pass | None found on any of the 10 sitemap pages |
| `lang` attribute | ✅ Pass | `<html lang="en">` |
| Structured data present | ✅ Pass | `SoftwareApplication` + `FAQPage` on homepage; both present on all 9 tool pages checked |
| Sitemap dynamically generated | ⚠️ Still static | Currently accurate, but hand-maintained (see Quick Win #5) |
| llms.txt | ✅ Present | 200, well-structured (see AI Search Readiness) |

## Content Quality (E-E-A-T)

- Single, unique H1 per page confirmed on all 10 pages, each matching its primary keyword phrasing (e.g. "Merge PDF online, free", "Compress PDF online, free").
- Clean heading hierarchy on every page checked — no skipped levels.
- Authorship signal preserved and consistent: footer credits "Shlomi Shemesh" with GitHub links on every page, plus "Open source: MIT licensed" messaging — strong, repeated trust signal for a privacy-sensitive file-handling tool.
- FAQ content is genuinely differentiated per tool (privacy, free/no-signup, and tool-specific questions), not boilerplate copy-pasted across pages — good for avoiding duplicate-content dilution across the 9 tool pages.
- FAQ/"How it works" content is inside a `<details>` element collapsed by default, but present in static HTML (not client-injected), so it's fully crawlable — same finding as the prior audit, still correct.

## On-Page SEO

- Titles: 8 of 10 pages are ≤60 chars; `/compress/` (64) and `/edit-pdf/` (65 raw) run slightly long — see Quick Win #3.
- Meta descriptions: all sampled pages (home 149, merge 127, sign 149 chars) are comfortably under Google's ~155-160 char truncation point — improved from the prior audit's 160-char homepage description.
- Primary keyword present in title, H1, and meta description on every tool page — SEO invariant from `CLAUDE.md` holds.
- **Internal linking gap (new finding, most significant issue in this audit):** the homepage tool grid links to only 9 of the site's 10 tool pages — `/protect/` is missing entirely, reachable only via direct URL or the sitemap. Additionally, no tool page links to any other tool page, meaning the entire site's internal link graph is a single-level hub-and-spoke with one broken spoke.

## Schema & Structured Data

- `SoftwareApplication` (with `Person` author/creator) + `FAQPage` present and valid on every page sampled (home, compress, edit-pdf, unlock, protect, image-to-pdf — 2 JSON-LD blocks each).
- `url` field correctly reflects `https://pdkef.vercel.app/` (prior placeholder-domain defect is resolved).
- No `HowTo` schema present — correct per `CLAUDE.md`'s documented decision (Google deprecated HowTo rich results in 2023).
- No `AggregateRating`/`Review` schema — correctly absent, no fabricated ratings.

## Performance (CWV, lab estimate only — no field data available)

- TTFB: 0.214s for homepage HTML via Vercel edge (cache HIT) — excellent.
- No CrUX/PageSpeed API credentials available in this session; recommend running Lighthouse/PageSpeed Insights directly against the live URL to confirm the ≥95 target stated in `CLAUDE.md`.
- Architecture (zero-JS SEO shell, single lazy-hydrated Preact island per tool, lazy-imported `pdfjs-dist`) remains a strong foundation for low LCP/INP, unchanged from the prior audit's assessment.

## Images

- `favicon.png`, `icons/apple-touch-icon.png`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-512-maskable.png` — all confirmed 200 (apple-touch-icon and OG image were both 404 in the prior audit; both now fixed).
- `og-image.jpg` (1200×630 equivalent, referenced via `og:image`/`twitter:image`) — confirmed 200. Note the file is `.jpg`, not the `.png` the prior audit assumed; harmless, just noting for anyone diffing against old notes.
- No `<img>` content images requiring alt-text audit beyond the logo (`alt="PDkef Logo"`, present) — tool icons are inline `lucide-preact` SVGs marked `aria-hidden="true"`, correctly excluded from the accessibility tree since adjacent text labels already convey meaning.

## AI Search Readiness (GEO)

- `llms.txt` is present and well-written: clear one-line summary, feature list, architecture/security notes, and links to homepage/source/developer — this was the prior audit's top "quick win" recommendation and has been fully implemented.
- FAQ content across all pages remains well-shaped for AI Overviews/Perplexity/ChatGPT citation (direct Q→A pairs in valid `FAQPage` schema).
- `robots.txt`'s blanket `Allow: /` permits all AI crawler user-agents (GPTBot, PerplexityBot, ClaudeBot, etc.) by default — no action needed unless the user wants to selectively restrict any.

---

## Score Breakdown

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 22% | 92/100 | 20.2 |
| Content Quality | 23% | 82/100 | 18.9 |
| On-Page SEO | 20% | 75/100 | 15.0 |
| Schema/Structured Data | 10% | 90/100 | 9.0 |
| Performance (CWV) | 10% | 85/100 (lab estimate, unverified) | 8.5 |
| AI Search Readiness | 10% | 90/100 | 9.0 |
| Images | 5% | 90/100 | 4.5 |
| **Total** | 100% | | **85.1 ≈ 85/100** |

On-Page SEO is now the dominant drag, driven almost entirely by the internal-linking gap (orphan `/protect/` page + no tool-to-tool cross-links) rather than any indexability defect. Up from 54/100 in the 2026-06-30 audit — the placeholder-domain, missing-OG-image, and missing-apple-touch-icon critical issues from that audit are all resolved.
