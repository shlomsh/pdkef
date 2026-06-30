# SEO Audit — pdf-merge-online-free.vercel.app

Date: 2026-06-30
Scope: Live deployment (`https://pdf-merge-online-free.vercel.app/`) + project source (`/Users/sh/work/pdf-merge`)
Business type: Free client-side web utility (SaaS-like tool, single page)

## Executive Summary

**SEO Health Score: 54 / 100**

The site is technically sound (clean static HTML, valid CSP, good headers, fast TTFB, working PWA icons) but is undermined by one critical, repeated defect: **every URL-bearing tag in the site points to a placeholder domain (`pdfmerge.example.com`) instead of the real deployed domain.** This single root cause cascades into broken canonicalization, a broken sitemap, broken Open Graph/Twitter previews, and a broken JSON-LD `url` field — all of which actively work against indexing and discoverability for the live site.

### Top 5 Critical Issues
1. **`astro.config.mjs`'s `site` is `https://pdfmerge.example.com`** — propagates to canonical URL, OG/Twitter tags, JSON-LD `url`, and sitemap.xml on every page. Google sees a canonical pointing to a domain that doesn't resolve to this content, which can suppress indexing of the real URL entirely.
2. **`robots.txt` Sitemap directive points to `https://pdfmerge.example.com/sitemap.xml`** — crawlers that respect this directive fetch a sitemap for the wrong domain.
3. **`sitemap.xml` lists `https://pdfmerge.example.com/` as its only URL** — even once fixed, it's a single static file (not Astro-generated), so it will silently drift out of sync if pages are added later.
4. **OG/Twitter image (`og-image.png`) returns 404** on the live site — social shares (Slack, X/Twitter, iMessage, LinkedIn) render with no preview image, hurting click-through from shared links.
5. **`apple-touch-icon.png` returns 404** — referenced in `<link rel="apple-touch-icon">` but never generated; iOS home-screen saves fall back to a screenshot instead of the app icon.

### Top 5 Quick Wins
1. Set `site: 'https://pdf-merge-online-free.vercel.app'` (or the final custom domain once attached) in `astro.config.mjs` — fixes canonical, OG, Twitter, and JSON-LD `url` in one change.
2. Update `public/robots.txt`'s `Sitemap:` line to match the real domain.
3. Generate and add `public/og-image.png` (1200×630) and `public/icons/apple-touch-icon.png` (180×180) — both already have the icon source assets (`icon-512.png`) to derive from.
4. Add an `llms.txt` (currently 404) — cheap AI-search-readiness win given the page is already well-structured for citation (clear FAQ, HowTo).
5. Shorten the `<title>` from 63 to ≤60 characters to avoid SERP truncation (currently right at the edge, gets cut off in some SERP renderers).

---

## Technical SEO

| Check | Status | Notes |
|---|---|---|
| HTTP → HTTPS redirect | ✅ Pass | 308 redirect confirmed |
| Single domain, no www/non-www split | ✅ Pass | |
| robots.txt reachable | ✅ Pass (HTTP 200) | But content is wrong (see Critical #2) |
| robots.txt allows crawling | ✅ Pass | `Allow: /` for all UAs |
| sitemap.xml reachable | ✅ Pass (HTTP 200) | But content is wrong (see Critical #3) |
| Canonical tag present | ⚠️ Present but wrong domain | `https://pdfmerge.example.com/` |
| HTTP security headers | ✅ Pass | HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` all present |
| CSP | ✅ Pass | Split-layer CSP working correctly; meta-tag CSP carries hashed `script-src`/`style-src`, header CSP adds `frame-ancestors 'none'`. No `unsafe-inline`. (See CLAUDE.md for the documented incident this guards against — verified still correctly wired.) |
| Compression / caching | ✅ Pass | `cache-control: public, max-age=0, must-revalidate` + ETag; Vercel edge cache HIT observed |
| Mobile viewport meta | ✅ Pass | `width=device-width, initial-scale=1, viewport-fit=cover` |
| robots meta / noindex | ✅ Pass | No noindex found |
| Structured data present | ✅ Pass | `SoftwareApplication`, `HowTo`, `FAQPage` — all valid JSON-LD syntactically, but `url` fields use the wrong domain |
| Sitemap is dynamically generated | ❌ Fail | Hand-written static file in `public/`, will drift if more pages are added |
| llms.txt | ❌ Missing | 404 |
| Crawl depth | N/A | Single-page site, no internal link graph to evaluate |

**Root cause for the canonical/OG/sitemap defects:** `astro.config.mjs:13` — `site: 'https://pdfmerge.example.com'`. This is a known placeholder; CLAUDE.md's PWA section explicitly flags "Astro 6+ `site` ... currently a placeholder — update before launch" but it was not updated before this deployment went live and became indexable.

## Content Quality (E-E-A-T)

- Single H1: ✅ "Merge PDF online, free" — present, unique, matches primary keyword phrasing.
- Heading hierarchy: ✅ Clean — H1 → H2 (How it works, Why pdfmerge, FAQ) → H3 (FAQ questions). No skipped levels.
- Content is genuinely informative for a utility page: explains privacy model, mobile support, and licensing in FAQ — these are exactly the trust signals users (and AI answer engines) look for on a "is this safe" query class like file-upload tools.
- **Authorship signal**: footer credits "Shlomi Shemesh" with link to GitHub profile and source repo — good for E-E-A-T (Experience/Expertise), especially combined with "Open source: MIT licensed, inspect the code yourself" in the FAQ. This is a meaningfully strong trust signal for a privacy-sensitive utility and should be preserved.
- Word count is light (typical for a single-purpose tool), but the FAQ/HowTo content under `<details>` is collapsed by default — content inside `<details>` is still crawlable/indexable by Google (confirmed: it's in the static HTML, not client-injected), so this is not a content-visibility problem, just worth knowing it won't show in the above-the-fold viewport for users.
- No duplicate content risk (single page, single locale).

## On-Page SEO

- **Title tag**: "Merge PDF Online Free - Combine PDFs in Your Browser | pdfmerge" — 63 characters. Slightly over the ~60-char safe zone for full SERP display; lower priority but trim if revisiting.
- **Meta description**: 160 characters — at the edge of Google's typical truncation point (~155-160). Consider trimming by 5-10 chars for safety margin.
- Primary keyword "pdf merge online free" / "merge pdf online free" appears in title, H1, and meta description — matches CLAUDE.md's stated invariant, confirmed intact on the live page. ✅
- Internal linking: only outbound links are footer GitHub links (external, correctly not internal-link-relevant for a single-page site).

## Schema & Structured Data

- Three JSON-LD blocks present: `SoftwareApplication`, `HowTo`, `FAQPage`. All syntactically valid (parsed cleanly).
- `SoftwareApplication.offers` correctly declares `price: "0"` — appropriate for free-tool rich result eligibility.
- **Defect**: `url` field in `SoftwareApplication` schema is `https://pdfmerge.example.com/` — same root cause as Critical #1. Should self-correct once `astro.config.mjs`'s `site` is fixed, since `SeoSchema.astro` derives it from `Astro.site`.
- No `AggregateRating`/`Review` schema — correctly absent (no review data exists, adding fake ratings would violate Google's structured data guidelines — do NOT add this opportunistically).

## Performance (CWV, lab estimate only — no field data available)

- TTFB measured: 0.226s for full HTML download (12.7KB), via Vercel edge with cache HIT — excellent.
- No CrUX/field data integration found (no Google Search Console / PageSpeed API credentials detected in this session) — recommend running PageSpeed Insights or Lighthouse directly against the live URL for LCP/INP/CLS numbers; CLAUDE.md states a target of Lighthouse Performance+SEO ≥ 95 but no automated check confirms this is currently met.
- Architecture favors good CWV: zero JS for the SEO-critical shell, single lazy-hydrated Preact island, lazy-imported `pdfjs-dist` for thumbnails — this is a strong foundation for low LCP/INP, but should be measured, not assumed.

## Images

- `favicon.svg` ✅ present and served.
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` ✅ present, referenced correctly in `manifest.webmanifest`, confirmed 200 live.
- `og-image.png` ❌ 404 — referenced in OG/Twitter tags but file doesn't exist anywhere in `public/`.
- `apple-touch-icon.png` ❌ 404 — referenced in `<link rel="apple-touch-icon">` but file doesn't exist in `public/icons/`.
- No `<img>` content images on the page itself (the dropzone icon is inline SVG) — no alt-text audit applicable.

## AI Search Readiness (GEO)

- Strong structural fit for AI answer engines: FAQ content directly answers common questions ("Is X free?", "Are my files uploaded?") in clean Q→A pairs inside valid `FAQPage` schema — this is exactly the shape AI Overviews/Perplexity/ChatGPT search prefer to cite.
- No `llms.txt` — low effort, plausible upside; add one summarizing the tool's purpose and privacy model.
- robots.txt has no explicit allow/disallow for AI crawler user-agents (GPTBot, PerplexityBot, ClaudeBot, etc.) — currently defaults to the blanket `Allow: /`, which does permit them. No action needed unless the user wants to selectively block any.

---

## Score Breakdown

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 22% | 45/100 | 9.9 |
| Content Quality | 23% | 80/100 | 18.4 |
| On-Page SEO | 20% | 70/100 | 14.0 |
| Schema/Structured Data | 10% | 65/100 | 6.5 |
| Performance (CWV) | 10% | 70/100 (lab estimate, unverified) | 7.0 |
| AI Search Readiness | 10% | 60/100 | 6.0 |
| Images | 5% | 40/100 | 2.0 |
| **Total** | 100% | | **53.8 ≈ 54/100** |

Technical SEO is the dominant drag — almost entirely attributable to the single `site:` placeholder propagating everywhere. Fixing it is the highest-leverage change available.
