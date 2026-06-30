# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 100% client-side, no-backend static web app that merges PDF files in the browser, optimized to rank for the SEO keyword "pdf merge online free." There is no server component and never should be — files must never leave the user's device. This is the central product constraint; do not introduce any upload/API call that sends file contents off-device. Every runtime dependency is MIT or Apache-2.0 licensed (no AGPL/commercial libraries) and makes zero network calls of its own.

## Commands

```bash
npm install
npm run dev       # local dev server (astro dev)
npm run build     # production build to dist/ (astro build)
npm run preview   # preview the production build locally
```

Deploy: push to `main` → Vercel auto-deploys (GitHub integration), custom domain attached in Vercel dashboard.

## Architecture

Built with **Astro** in static output mode (`output: 'static'` in `astro.config.mjs`, no SSR adapter). Astro prerenders everything to flat HTML at build time — there is no server at runtime, only static files served by Vercel.

The page follows an **islands architecture**:
- `src/pages/index.astro` + `src/layouts/BaseLayout.astro` + `src/components/SeoSchema.astro` render the entire SEO surface (H1, how-it-works, FAQ, JSON-LD) as **static HTML with zero JS shipped**. This content must stay server-rendered at build time, not injected client-side, so crawlers see it without executing scripts.
- `src/components/PdfMergeTool.jsx` is the one interactive **Preact island** (`client:load`), mounted into the `#app` section. All the actual file-handling logic lives here and in `src/lib/`.

Library logic:
- `src/lib/merge.js` — `@cantoo/pdf-lib` glue: `mergePdfs(files, onProgress) -> Blob`, plus `resolvePdfCreationDate(file)` which reads a PDF's internal `/CreationDate` metadata.
- `src/lib/sort.js` — `sortByName` (natural/locale-numeric) and `sortByDate`. Date sort is a cascading fallback: filename-embedded date (regex) → PDF internal creation date → `File.lastModified`. **The browser File API cannot read OS file creation/birth time** — `lastModified` is the only filesystem timestamp available, and it changes when a file is copied/downloaded, so it's intentionally the last resort, not the primary signal.
- `src/lib/thumbnails.js` — lazy (dynamically imported) `pdfjs-dist` page-1 rendering to a canvas/data-URL. The pdf.js worker is copied to `public assets` at build time via `viteStaticCopy` in `astro.config.mjs` so it's always same-origin, never fetched from a CDN — required for both offline support and the no-third-party-network privacy guarantee.

Drag-to-reorder uses **SortableJS**, wired directly to the DOM list in `PdfMergeTool.jsx`; on drop, the final DOM order is read back into Preact state, which remains the single source of truth for every re-render.

## SEO invariants (don't regress these)

- Primary keyword ("pdf merge online free" / "merge pdf online free") stays in `<title>`, the single `<h1>`, and meta description (`src/pages/index.astro`).
- Only one `<h1>` per page.
- All marketing/how-to/FAQ content stays in `.astro` files (build-time rendered), never moved into the Preact island.
- `robots.txt` and `sitemap.xml` in `public/` must stay reachable and accurate; `astro.config.mjs`'s `site` must match the real deployed domain (currently a placeholder — update before launch).
- Canonical URL, Open Graph + Twitter Card tags (`BaseLayout.astro`) must stay present.
- JSON-LD (`SeoSchema.astro`: `SoftwareApplication`, `HowTo`, `FAQPage`) must stay valid — verify with Google's Rich Results Test after edits.
- Target Lighthouse SEO + Performance ≥ 95 — keep the island lean, lazy-load thumbnails, avoid layout shift.

## Privacy invariants

- No `fetch`/`XHR` of file bytes, ever. No analytics, telemetry, or third-party scripts.
- No cookies, no accounts, no server-side logging — there is no server.
- `vercel.json` sets a strict CSP (`connect-src 'self'`, no external script/connect origins) as a browser-enforced backstop against an accidental external call being added later.

## PWA

`vite-plugin-pwa` (configured inside `astro.config.mjs`'s `vite.plugins`) generates the Workbox precache manifest and `manifest.webmanifest` from the `VitePWA({ manifest: ... })` config — there is no hand-written `public/manifest.webmanifest`. Icons referenced there (`public/icons/*.png`) still need to be generated as real PNGs before launch (currently only `favicon.svg` exists).
