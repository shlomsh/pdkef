# TODO — remaining work

This is the pick-up list for future agents. Background and invariants live in
[CLAUDE.md](./CLAUDE.md); this file is just the remaining work, in priority order.
SEO strategy/reference material lives in [seo-audit-output/](./seo-audit-output/)
(see `SEARCH-POSITIONING-STRATEGY.md`, `FULL-AUDIT-REPORT.md`, `ACTION-PLAN.md`).

The site is a suite of **100% client-side** PDF tools. The hard constraint on
every task below: **no file bytes ever leave the device** — no `fetch`/`XHR` of
PDF contents, no third-party API. All processing runs in the browser via
`@cantoo/pdf-lib` and `pdfjs-dist`. `PdfMergeTool.jsx` + `src/lib/merge.js` are
the reference implementation for how a finished tool should look (progress
callback, reset-on-mutation, focus-the-download-button-on-done, blob download).

## Definition of done (every tool)

A tool is only "done" when all of these ship together:
1. **Logic** — add the real `src/lib/<tool>.js`, pure functions, no network.
2. **Wire-up** — replace the `setTimeout` mock in the component with the real call; show progress, produce a downloadable `Blob`, reset state to `idle`.
3. **On-page content + schema** — add a visible "How it works" + FAQ section to the `.astro` page, and a matching `<SeoSchema>`.
4. **De-noindex** — remove the `noindex` prop from the page's `<BaseLayout>`.
5. **Sitemap** — add the route to `public/sitemap.xml`.
6. **Verify** — `npm run build && npm run preview` (CSP check).
7. **Test** — add a component test.

## Tool status

**All Phase 1 tools are implemented and promoted**: Merge, Sign, Split, Edit (remove/rotate/page-numbers), PDF-to-Image, Compress, Unlock, Protect, Image-to-PDF. Redact/Whiteout also shipped. Only `404.astro` remains `noindex`.

---

## Remaining work

From the 2026-07 technical audit ([seo-audit-output/TECHNICAL-AUDIT-2026-07.md](./seo-audit-output/TECHNICAL-AUDIT-2026-07.md)) and past scoping:

- [ ] **Header Wordmark**: Add or finalize the header wordmark/logo (open item from `CLAUDE.md`).
- [ ] **Add HSTS header** to `vercel.json` (`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`) — only once the final domain is confirmed HTTPS-only.
- [ ] **Homepage FAQ schema** — `index.astro` shows a visible FAQ but passes no `faq=` to `<SeoSchema>`; wire the visible FAQ into the schema for rich-result eligibility.
- [ ] **Add `browserRequirements`** to `SeoSchema.astro`'s `softwareApp` object (`"Requires JavaScript. Requires HTML5 Canvas or WebAssembly..."`).
- [ ] **IndexNow** (low priority) — drop a `public/<key>.txt` and ping on deploy for faster Bing/Yandex indexing.
- [ ] **Pre-launch: real domain.** `astro.config.mjs`'s `site` and the sitemap/canonical URLs currently use the `pdkef.vercel.app` placeholder — update to the real custom domain before launch, and re-verify canonical/OG tags.
- [ ] **Register Google Search Console** and submit the sitemap once the domain is final; monitor Core Web Vitals (prioritize INP for signature-drawing).
- [ ] **Homepage Hub Link Check**: Confirm no tool cards on the homepage point at any noindexed route (currently only 404 is noindex, so just re-check if any tool is ever un-promoted).

## Content authority (post-launch, from the search-positioning strategy)

- [ ] Dedicated long-tail landing pages: `/sign-pdf-no-signup`, `/offline-pdf-form-filler`, `/open-source-pdf-editor`.
- [ ] OS-specific how-to guides (e.g. "Fill Out PDF Forms on Mac Without Adobe Acrobat"), internally linking into the interactive tools — no outbound promo links.
- [ ] Public GitHub repo + iframe embed model for contextual backlinks.
