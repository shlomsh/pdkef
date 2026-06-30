# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A 100% client-side, no-backend static web app that provides a suite of PDF tools (Merge, Split, Remove Pages, Compress, PDF to Image, Sign, Unlock) in the browser, optimized to rank for specific PDF manipulation SEO keywords. There is no server component and never should be — files must never leave the user's device. This is the central product constraint; do not introduce any upload/API call that sends file contents off-device. Every runtime dependency is MIT or Apache-2.0 licensed (no AGPL/commercial libraries) and makes zero network calls of its own.

### Implementation status (Phase 1)

Per-tool status — **see [TODO.md](./TODO.md) for the actionable, picked-up-by-the-next-agent task list.**

| Tool | Route | Component | Functional? | Indexed? |
| --- | --- | --- | --- | --- |
| Merge | `/merge` | `PdfMergeTool.jsx` | ✅ yes (reference impl) | ✅ in sitemap |
| Sign | `/sign` | `PdfSignTool.jsx` | ✅ implemented (real `pdfDoc.save()` + download) | ✅ in sitemap |
| Split | `/split` | `PdfSplitTool.jsx` | ✅ implemented (`src/lib/split.js`) | ✅ in sitemap |
| Remove Pages | `/remove-pages` | `PdfRemovePagesTool.jsx` | ✅ implemented (`src/lib/removePages.js`) | ✅ in sitemap |
| Compress | `/compress` | `PdfCompressTool.jsx` | ✅ implemented (`src/lib/compress.js`, rasterizes + re-encodes pages) | ✅ in sitemap |
| PDF to Image | `/pdf-to-image` | `PdfToImageTool.jsx` | ✅ implemented (`src/lib/toImage.js` + real downloads) | ✅ in sitemap |
| Unlock | `/unlock` | `PdfSecurityTool.jsx` | ✅ implemented (`src/lib/unlock.js`, password removal via `@cantoo/pdf-lib`) | ✅ in sitemap |
| Protect | `/protect` | `PdfSecurityTool.jsx` | ✅ implemented (`src/lib/protect.js`, password addition via `@cantoo/pdf-lib`) | ✅ in sitemap |
| Image to PDF | `/image-to-pdf` | `PdfImageToPdfTool.jsx` | ✅ implemented (`src/lib/imageToPdf.js`, embeds JPG/PNG via `@cantoo/pdf-lib`, one page per image at native size) | ✅ in sitemap |

All Phase 1 tools are now functional and promoted (de-noindexed, in `public/sitemap.xml`, with a visible "How it works" + FAQ section and a matching `<SeoSchema>` on their pages). Unlock and Image to PDF were added beyond the original Phase 1 scope per SEO research identifying them as high client-side-fit, lower-competition keywords that reinforce the privacy-first positioning — Image to PDF (JPG/PNG batches into one PDF) was the original motivating use case for building this app. Remaining open items (header wordmark) are tracked in [TODO.md](./TODO.md).

**Definition of done for promoting any tool (do these as one unit — see TODO.md):** (1) implement the real `src/lib/` logic, no network calls; (2) replace the `setTimeout` mock in the component with the real call + download, mirroring `PdfMergeTool.jsx`; (3) add a visible "How it works" + FAQ section to the `.astro` page and a matching `<SeoSchema>` (FAQ schema only — HowTo schema was removed, deprecated by Google in 2023; structured data must match on-page content); (4) remove `noindex` from the page; (5) add the route to `public/sitemap.xml`; (6) `npm run build && npm run preview` to confirm CSP/hydration (the dev server cannot catch CSP regressions — see the CSP section).

## Commands

```bash
npm install
npm run dev       # local dev server (astro dev)
npm run build     # production build to dist/ (astro build)
npm run preview   # preview the production build locally
```

Deploy: push to `main` → Vercel auto-deploys (GitHub integration), custom domain attached in Vercel dashboard.

**If a tool's file picker opens but selecting files does nothing in `npm run dev`**, and the browser console shows `504 (Outdated Optimize Dep)` for entries under `node_modules/.vite/deps/`, the dev server's Vite dependency cache has gone stale relative to `node_modules` — typically because `npm install` ran while an old `astro dev` process was still running. The dynamic import of the island component then fails (`[astro-island] Error hydrating ... Failed to fetch dynamically imported module`), so its `onChange` handler never attaches — same end-user symptom as the CSP hydration bug below, different cause, and only happens in dev. Fix: stop the dev server, `rm -rf node_modules/.vite`, restart `npm run dev`.

## Architecture

Built with **Astro** in static output mode (`output: 'static'` in `astro.config.mjs`, no SSR adapter). Astro prerenders everything to flat HTML at build time — there is no server at runtime, only static files served by Vercel.

The page follows an **islands architecture**:
- `src/pages/` (e.g., `index.astro`, `merge.astro`) + `src/layouts/BaseLayout.astro` + `src/components/SeoSchema.astro` render the entire SEO surface (H1, how-it-works, FAQ, JSON-LD) as **static HTML with zero JS shipped**. This content must stay server-rendered at build time, not injected client-side, so crawlers see it without executing scripts.
- The interactive PDF tools (`PdfMergeTool.jsx`, `PdfSplitTool.jsx`, etc.) are **Preact islands** (`client:load`), mounted into the `#app` section of their respective pages. They wrap around a common `BasePdfTool.jsx` which handles the drag-and-drop file picking layout (with `FileDropzone.jsx` for the dropzone UI). `Footer.astro` is the shared site footer. All the actual file-handling logic lives in these components and in `src/lib/`. (Only `PdfMergeTool.jsx` is functionally wired up — see "Implementation status" above.)

Library logic:
- `src/lib/merge.js` — `@cantoo/pdf-lib` glue: `mergePdfs(files, onProgress) -> Blob`, plus `resolvePdfCreationDate(file)` which reads a PDF's internal `/CreationDate` metadata.
- `src/lib/sort.js` — `sortByName` (natural/locale-numeric) and `sortByDate`. Date sort is a cascading fallback: filename-embedded date (regex) → PDF internal creation date → `File.lastModified`. **The browser File API cannot read OS file creation/birth time** — `lastModified` is the only filesystem timestamp available, and it changes when a file is copied/downloaded, so it's intentionally the last resort, not the primary signal.
- `src/lib/thumbnails.js` — lazy (dynamically imported) `pdfjs-dist` page-1 rendering to a canvas/data-URL. The worker URL uses Vite's native `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` asset pattern, so Vite bundles and content-hashes it as a same-origin asset automatically — no copy plugin needed, never fetched from a CDN.

Drag-to-reorder uses **SortableJS**, wired directly to the DOM list in `PdfMergeTool.jsx`; on drop, the final DOM order is read back into Preact state, which remains the single source of truth for every re-render.

## SEO invariants (don't regress these)

- Primary keyword ("pdf merge online free", "split pdf", etc.) stays in `<title>`, the single `<h1>`, and meta description for each specific tool page.
- Only one `<h1>` per page.
- All marketing/how-to/FAQ content stays in `.astro` files (build-time rendered), never moved into the Preact island.
- `robots.txt` and `sitemap.xml` in `public/` must stay reachable and accurate; `astro.config.mjs`'s `site` must match the real deployed domain (currently a placeholder — update before launch).
- Canonical URL, Open Graph + Twitter Card tags (`BaseLayout.astro`) must stay present.
- JSON-LD (`SeoSchema.astro`: `SoftwareApplication` with `Person` author, `FAQPage`) must stay valid — verify with Google's Rich Results Test after edits. `HowTo` schema was intentionally removed (Google deprecated HowTo rich results in 2023); don't re-add it.
- Target Lighthouse SEO + Performance ≥ 95 — keep the island lean, lazy-load thumbnails, avoid layout shift.

## UI & State Invariants

- **FAQ disclosure**: The "How it works & FAQ" content resides below the app and acts as a details-summary element. The summary contains the hero text, and a click interceptor script prevents clicks on the text from toggling the panel. Only clicking the styled `.faq-toggle` link (anchor-like visual) triggers the toggle.
- **Merge & Download Flow**:
  - Once merging is complete, the "Merge PDFs" button turns grey (`.is-done` class) to step back, and focus is shifted to the "Download PDF" button (`ref` + `useEffect` on status change).
  - Any subsequent mutation of files (adding, removing, reordering, or sorting) resets the state to `'idle'` and revokes/clears the generated `downloadUrl`.

## Privacy invariants

- No `fetch`/`XHR` of file bytes, ever. No third-party scripts or tracking of PDF content. Only same-origin Vercel Web Analytics is enabled for basic page views.
- No cookies, no accounts, no server-side logging — there is no server.
- A strict CSP locks down `connect-src 'self'` (no external script/connect origins) as a browser-enforced backstop against an accidental external call being added later. See "Content-Security-Policy" below for how it's actually wired — it's split across two layers, not a single static header.

## Content-Security-Policy (read this before touching CSP, scripts, or astro.config.mjs)

The CSP is intentionally split across two layers:

1. **`astro.config.mjs`'s `security.csp`** (Astro 6+ built-in feature) auto-computes sha256 hashes for every inline `<script>`/`<style>` Astro emits or processes (the astro-island hydration bootstrap, JSON-LD blocks, any non-`is:inline` script written in a `.astro` file) and bakes them into a per-page `<meta http-equiv="Content-Security-Policy">` tag, regenerated on every build. This governs `script-src`, `style-src`, and whatever else is listed in `security.csp.directives`.
2. **`vercel.json`'s header CSP** only adds `frame-ancestors 'none'` — the one directive a `<meta>` CSP cannot express (must be an HTTP header per spec). Do not add `script-src`, `style-src`, or `default-src` back into the header: a second policy with `default-src 'self'` and no script-src would re-block scripts via fallback even though the meta tag allows them — CSP policies are combined as the *intersection* of every active policy, not a single merged list.

**Past incident, don't repeat it:** an earlier strict CSP (`script-src 'self'`, no hashes, no `unsafe-inline`) silently blocked Astro's inline hydration bootstrap script. The page looked fine — static HTML rendered, no visible console error reported by the user — but the Preact island never hydrated, so `PdfMergeTool.jsx`'s `onChange` handler was never attached. Symptom: clicking "Choose files" still opened the native OS file picker (that part is plain HTML, no JS required), but selecting files did nothing, because nothing was listening. **If file selection or any other island interaction silently does nothing in production but works in `npm run dev`, suspect the CSP first** — check the browser's actual CSP violation console errors (look past just "no JS errors," CSP violations log as their own category) and diff `dist/index.html`'s generated `<meta>` CSP hash list against the actual inline scripts present (see git history of this file's commit "Fix CSP blocking the merge tool from hydrating at all" for the exact verification method: extract every `<script>` tag's body, sha256+base64 it, confirm it's in the meta tag's hash list — `type="application/ld+json"` scripts are exempt, since CSP's `script-src` only governs executable script types, not data blocks).

**`is:inline` scripts are NOT auto-hashed.** Astro's CSP hashing only covers scripts that go through its bundling pipeline. If you need a literal inline script, either give it manually-computed hashes via `security.csp.scriptDirective.hashes` (fragile — breaks silently if you ever edit the script content), or — strongly preferred — drop `is:inline` and let Astro bundle it normally (see `BaseLayout.astro`'s service worker registration script for the working pattern). A bundled/processed script gets its hash added automatically and never goes stale.

**This feature is build/preview-only.** Per Astro's own docs, `security.csp` does not apply in `astro dev` — the Vite dev server doesn't support it. This means **the CSP bug class above cannot be reproduced or caught in `npm run dev`** — it only manifests in `npm run build && npm run preview` or the real deployment. Always do a build+preview pass (or check the live Vercel deployment) before considering any change to scripts, `astro.config.mjs`, or `vercel.json` verified.

## PWA

There is no PWA build plugin (`vite-plugin-pwa` and `@vite-pwa/astro` were both tried and dropped — see git history "Migrate to Astro" and "Reinstall on patched Astro 7.0.3" commits for why: `vite-plugin-pwa`'s `closeBundle` hook doesn't survive Astro's multi-pass static build, and `@vite-pwa/astro` doesn't yet certify Astro 7). Instead:
- `public/manifest.webmanifest` is a hand-written static file, copied verbatim by Astro.
- `public/sw.js` is a small, hand-written, dependency-free service worker (network-first for navigations, cache-first runtime caching for everything else). Bump `CACHE_VERSION` inside it to force clients to drop their old cache on a deploy.
- Registration lives in `BaseLayout.astro` as a production-only (`import.meta.env.PROD`), non-`is:inline` script (see the CSP section above for why it must not be `is:inline`).

Icons referenced in the manifest (`public/icons/*.png`) still need to be generated as real PNGs before launch (currently only `favicon.svg` exists).

## Astro/Vercel version pinning — don't casually upgrade

Astro is pinned to `^7.0.3`, not the `@vite-pwa/astro`-certified `^5.x` line, **on purpose**: `npm audit` showed Astro's own published security advisories (XSS via `define:vars`, slot names, spread props; SSRF) cover every version through `7.0.0-beta`, including all of 5.x. Downgrading to satisfy some other package's peer range would mean shipping a known-vulnerable Astro. If a future dependency wants an older Astro, re-verify with `npm audit` before downgrading — don't assume an older major is safer just because more tooling has caught up to it.
