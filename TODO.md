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

## Sign/Redact tool polish (from 2026-07 hands-on session)

Done this session (shipped): text-box padding consolidated to shared CSS + `cols=1`
short-text fix, symmetric descender padding with matching `TEXT_BOX_PADDING_EM`
export offset, reverted the `isDragging` toolbar/resizer hiding, removed the
duplicate `.sign-element::after` rule, tuned the drag halo, full-width mobile
toolbar, new signature icon, and made the mobile toolbar rule structure-agnostic
so it covers the Redact toolbar too.

Remaining:

- [ ] **Verify Redact mobile toolbar** on a real narrow viewport. Code is updated
      (inline `.sign-toolbar` style removed so shared CSS governs; mobile flex rule
      now targets `.sign-toolbar > *:not(.sign-tool-separator)`), but it was not
      visually confirmed. Check the blackout/blur mode-toggle group + fullscreen +
      Start over + Download stretch cleanly full-width and the swatches still read.
- [ ] **Desktop fullscreen button has no text label** (`FloatingToolbar.jsx`, and the
      same in `PdfRedactTool.jsx`): it's a lone icon between labelled buttons in the
      desktop pill. Give it a "Full screen" label or intentionally group it.
- [ ] **State-based drag halo.** The `.sign-element::after` grab halo is one
      compromise value (`-10px` desktop / `-16px` touch) that trades selection
      precision against drag ease for all elements. Better: small resting halo +
      larger halo only on `.active` (which is `z-index:50`, so it won't steal clicks
      from neighbours). Resolves the tension instead of splitting it.
- [ ] **PDF export baseline assumes Helvetica metrics.** `sign.js` uses a hardcoded
      `0.85` ascent ratio for every font; handwriting/custom fonts have different
      metrics, so their vertical position in the exported PDF can drift from the
      preview. Derive the offset from the resolved font's actual metrics.

## Code health (tech debt — do only when already working in these files)

- [ ] **Split `DraggableOverlayElement.jsx`** (596 lines, 4 element types in one
      component) into per-type render pieces sharing the drag/resize core. Risky
      refactor, low user-facing payoff — don't chase it standalone.
- [ ] **`PdfSignTool.jsx` is 941 lines** — candidate for extracting sub-components.
- [ ] **Colocate the `.sign-*` styles** out of the 3,070-line flat `global.css`.
      That monolith is what let a duplicate `.sign-element::after` rule slip in
      silently this session; locality would make that class of bug much harder.

## Content authority (post-launch, from the search-positioning strategy)

- [ ] Dedicated long-tail landing pages: `/sign-pdf-no-signup`, `/offline-pdf-form-filler`, `/open-source-pdf-editor`.
- [ ] OS-specific how-to guides (e.g. "Fill Out PDF Forms on Mac Without Adobe Acrobat"), internally linking into the interactive tools — no outbound promo links.
- [ ] Public GitHub repo + iframe embed model for contextual backlinks.
