# SEO Action Plan — pdf-merge-online-free.vercel.app

## Critical (fix immediately — blocks correct indexing)

1. **Fix the placeholder domain in `astro.config.mjs`**
   - File: `astro.config.mjs:13`
   - Change `site: 'https://pdfmerge.example.com'` → `site: 'https://pdf-merge-online-free.vercel.app'` (or the final custom domain, if one is being attached in Vercel per CLAUDE.md's deploy notes — confirm with the user which is canonical before committing).
   - This single change fixes: canonical URL (`BaseLayout.astro`), OG `url`/`image`, Twitter `image`, JSON-LD `url` (`SeoSchema.astro`), and `sitemap.xml` (Astro derives the sitemap URL list from `site`, if a sitemap integration is later added — currently it's static, see item 3).
   - Effort: 5 minutes. Impact: highest in this audit.

2. **Fix `public/robots.txt`'s Sitemap directive**
   - File: `public/robots.txt`
   - Change `Sitemap: https://pdfmerge.example.com/sitemap.xml` to match the real domain chosen in item 1.
   - Effort: 1 minute.

3. **Fix `public/sitemap.xml`'s URL**
   - File: `public/sitemap.xml`
   - Update `<loc>https://pdfmerge.example.com/</loc>` to the real domain.
   - Longer-term: since this is hand-written and static (not generated), consider adding `@astrojs/sitemap` so it can never drift again if pages are added — optional, only worth doing if the site is expected to grow beyond one page.
   - Effort: 2 minutes (manual fix) / 15 minutes (integration, optional).

## High (fix within 1 week — significant ranking/CTR impact)

4. **Generate and add the missing OG image**
   - Create `public/og-image.png` at 1200×630px (standard OG size). Should feature the "pdfmerge" name/wordmark and tagline, consistent with the existing icon style (`public/icons/icon-512.png` as a visual starting point).
   - Currently referenced by `BaseLayout.astro:26,32` but the file doesn't exist → 404 on every social share.
   - Effort: 20-30 minutes (design) + 2 minutes (drop in `public/`).

5. **Generate and add the missing Apple touch icon**
   - Create `public/icons/apple-touch-icon.png` at 180×180px, no transparency (iOS ignores alpha and may render black).
   - Referenced by `BaseLayout.astro:38` but missing → broken iOS home-screen icon.
   - Can likely be derived directly from the existing `icon-512.png` source.
   - Effort: 10 minutes.

## Medium (fix within 1 month — optimization opportunities)

6. **Trim the `<title>` tag**
   - File: `src/pages/index.astro:7`
   - Current: "Merge PDF Online Free - Combine PDFs in Your Browser | pdfmerge" (63 chars)
   - Suggest trimming the brand suffix or shortening "Combine PDFs in Your Browser" to land at ≤60 chars to avoid truncation in SERPs. Keep the primary keyword phrase intact per CLAUDE.md's SEO invariants.
   - Effort: 5 minutes.

7. **Trim the meta description slightly**
   - File: `src/pages/index.astro:9`
   - Current is 160 characters, right at Google's truncation edge. Shave 5-10 characters for a safety margin.
   - Effort: 5 minutes.

8. **Add an `llms.txt`**
   - New file: `public/llms.txt`
   - Brief markdown summary of the tool: what it does, the privacy guarantee (no upload), and links to the FAQ content. Cheap addition that improves AI-search citability given the content already verified well-suited for this (see FULL-AUDIT-REPORT.md's AI Search Readiness section).
   - Effort: 15 minutes.

## Low (backlog / nice to have)

9. **Verify Lighthouse Performance + SEO ≥ 95 against the live deployment**
   - CLAUDE.md states this as a target but no recent measurement is on record for the live URL. Run PageSpeed Insights (or Lighthouse CLI) against `https://pdf-merge-online-free.vercel.app/` once the domain fixes above ship, to get a real number rather than the lab estimate in this audit.
   - Effort: 5 minutes to run, plus whatever follow-up the score reveals.

10. **Decide on final production domain before more launch work**
    - The placeholder domain bug (Critical #1-3) exists because CLAUDE.md already flagged `astro.config.mjs`'s `site` as "currently a placeholder — update before launch" and a custom domain was planned to be attached in Vercel. Recommend confirming whether the custom domain is being attached soon — if so, use that as the `site` value now instead of the `.vercel.app` URL, to avoid a second domain-migration SEO cleanup later (redirects, re-canonicalization, etc.).
    - This is a decision for the user, not a code fix — flagging it here so it isn't lost.

---

## Summary

| Priority | Count | Estimated total effort |
|---|---|---|
| Critical | 3 | ~10 minutes |
| High | 2 | ~45 minutes |
| Medium | 3 | ~25 minutes |
| Low | 2 | ~10 minutes + decision |

The three Critical items are all one-line config/content fixes stemming from a single root cause (the placeholder `site` value) and should be done together in one commit. Recommend confirming the final domain (item 10) *before* fixing items 1-3, since it determines what value to put in.
