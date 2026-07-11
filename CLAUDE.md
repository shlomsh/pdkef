# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Design standard:** [ARCHITECTURE.md](./ARCHITECTURE.md) is the forward-looking architecture "north star" (styling boundary, headless editor core, invariants-as-guardrails); the sequenced backlog toward it lives in [scrum.md](./scrum.md). This file is the day-to-day working reference for the repo as it exists now.



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
| Unlock / Protect | `/unlock` | `PdfSecurityTool.jsx` | ✅ implemented (`src/lib/security.js`; auto-detects — encrypted files unlock, unencrypted files get protected). The `/protect` route was killed as redundant and 301s to `/unlock` (see `vercel.json`); the tool covers both intents on one page. | ✅ in sitemap |
| Image to PDF | `/image-to-pdf` | `PdfImageToPdfTool.jsx` | ✅ implemented (`src/lib/imageToPdf.js`, embeds JPG/PNG via `@cantoo/pdf-lib`, one page per image at native size) | ✅ in sitemap |
| Redact | `/redact` | `PdfRedactTool.jsx` | ✅ implemented (blackout/blur/whiteout, rasterizes redacted pages) | ✅ in sitemap |

All Phase 1 tools are now functional and promoted (de-noindexed, in `public/sitemap.xml`, with a visible "How it works" + FAQ section and a matching `<SeoSchema>` on their pages). Unlock and Image to PDF were added beyond the original Phase 1 scope per SEO research identifying them as high client-side-fit, lower-competition keywords that reinforce the privacy-first positioning — Image to PDF (JPG/PNG batches into one PDF) was the original motivating use case for building this app. Remaining open items (header wordmark) are tracked in [TODO.md](./TODO.md).

**Definition of done for promoting any tool (do these as one unit — see TODO.md):** (1) implement the real `src/lib/` logic, no network calls; (2) replace the `setTimeout` mock in the component with the real call + download, mirroring `PdfMergeTool.jsx`; (3) add a visible "How it works" + FAQ section to the `.astro` page and a matching `<SeoSchema>` (FAQ schema only — HowTo schema was removed, deprecated by Google in 2023; structured data must match on-page content); (4) remove `noindex` from the page; (5) add the route to `public/sitemap.xml`; (6) `npm run build && npm run preview` to confirm CSP/hydration (the dev server cannot catch CSP regressions — see the CSP section).

## Commands

```bash
npm install
npm run dev       # local dev server (astro dev)
npm run build     # production build to dist/ (astro build)
npm run preview   # preview the production build locally
npm test          # unit/component tests (Vitest + jsdom)
npm run test:e2e  # browser guardrails (Playwright; keep under e2e/<module>/)
```

E2E tests are intentionally sparse guardrails, not a duplicate unit suite. Keep them under
`e2e/<module>/` (for example `e2e/sign/`) and maintain roughly a 1:10 e2e-to-unit/component ratio.
Use Playwright only where jsdom cannot prove the behavior: rendered toolbar rects, drag-time toolbar
following before `pointerup`, page/viewport edge behavior, hydration/CSP-visible flows.

Playwright preview currently exposes CSP `style-src` violations for runtime `style=""` attributes.
This is separate from the existing hash verifier, which only checks generated `<script>` and `<style>`
tags. The editor intentionally uses runtime inline styles for geometry/Floating UI, so do not "fix"
those warnings casually; resolve the CSP posture deliberately (see ARCHITECTURE.md / scrum.md E1.7).

Deploy: push to `main` → Vercel auto-deploys (GitHub integration), custom domain attached in Vercel dashboard.

**If a tool's file picker opens but selecting files does nothing in `npm run dev`**, and the browser console shows `504 (Outdated Optimize Dep)` for entries under `node_modules/.vite/deps/`, the dev server's Vite dependency cache has gone stale relative to `node_modules` — typically because `npm install` ran while an old `astro dev` process was still running. The dynamic import of the island component then fails (`[astro-island] Error hydrating ... Failed to fetch dynamically imported module`), so its `onChange` handler never attaches — same end-user symptom as the CSP hydration bug below, different cause, and only happens in dev. Fix: stop the dev server, `rm -rf node_modules/.vite`, restart `npm run dev`.

This same stale-dep-cache class can also surface as a **503** (not just 504) on a specific pre-bundled dep — e.g. `node_modules/.vite/deps/sortablejs.js` returning 503, which cascades into the *importing* island failing with the same `[astro-island] Error hydrating ... Failed to fetch dynamically imported module` error, even though the failing request is a transitive dependency, not the component file itself. Diagnose by checking the Network tab (not just console) for any non-200 response under `node_modules/.vite/deps/` or `node_modules/<pkg>/` during the page load that hydration-errored — the failing dep points at what to blame, and the symptom is identical across every tool since they all share `BasePdfTool.jsx`'s hydration path (don't assume a per-tool code bug just because it reproduces on multiple tool pages). Same fix: kill the dev server, `rm -rf node_modules/.vite`, restart. A `.astro/dev.log` reference to a different/old project directory path is a stale leftover from a prior crashed run (e.g. before a repo rename) and is *not* diagnostic of the current process — check the currently-running PID's actual behavior instead of trusting old log lines.

**A freshly-created `git worktree` needs its own `npm install` before running tests — a missing or partial `node_modules` there breaks CSS Modules silently, not just the dev server.** If a worktree directory happens to contain *any* `node_modules` folder — even an empty one, or one holding only leftover `.astro`/`.vite` cache directories from a stray build/test run — Node's module resolution stops there instead of walking up to the real install in the main checkout, since Node stops at the first `node_modules` it finds. Most imports still resolve fine (Vite/Rollup's own resolver falls through to the parent anyway), but two things break in a way that's easy to misdiagnose: (1) **CSS Modules under Vitest silently resolve to `{}`** — `import styles from './X.module.css'` gives you `styles.foo === undefined`, so `class={styles.foo}` renders `class="undefined"`, `container.querySelector('.foo')` returns `null`, and every test touching that class fails with no error pointing at the real cause; (2) pdfjs's `new URL('pdf.worker.mjs', import.meta.url)` asset resolution gets rewritten against the worktree's phantom path instead of the real `node_modules`, breaking any test that spins up a real pdf.js worker. Both look like ordinary test failures, not an environment problem. Fix: `rm -rf` the worktree's stray `node_modules`, then run `npm install` inside the worktree — don't assume a worktree can safely share or skip installing its own `node_modules` just because the main checkout has one.

## Architecture

Built with **Astro** in static output mode (`output: 'static'` in `astro.config.mjs`, no SSR adapter). Astro prerenders everything to flat HTML at build time — there is no server at runtime, only static files served by Vercel.

The page follows an **islands architecture**:
- `src/pages/` (e.g., `index.astro`, `merge.astro`) + `src/layouts/BaseLayout.astro` + `src/components/SeoSchema.astro` render the entire SEO surface (H1, how-it-works, FAQ, JSON-LD) as **static HTML with zero JS shipped**. This content must stay server-rendered at build time, not injected client-side, so crawlers see it without executing scripts.
- The interactive PDF tools (`PdfMergeTool.jsx`, `PdfSplitTool.jsx`, etc.) are **Preact islands** (`client:load`), mounted into the `#app` section of their respective pages. They wrap around a common `BasePdfTool.jsx` which handles the drag-and-drop file picking layout (with `FileDropzone.jsx` for the dropzone UI). `Footer.astro` is the shared site footer. All the actual file-handling logic lives in these components and in `src/lib/`. (Only `PdfMergeTool.jsx` is functionally wired up — see "Implementation status" above.)

Library logic:
- `src/lib/merge.js` — `@cantoo/pdf-lib` glue: `mergePdfs(files, onProgress) -> Blob`, plus `resolvePdfCreationDate(file)` which reads a PDF's internal `/CreationDate` metadata.
- `src/lib/sort.js` — `sortByName` (natural/locale-numeric) and `sortByDate`. Date sort is a cascading fallback: filename-embedded date (regex) → PDF internal creation date → `File.lastModified`. **The browser File API cannot read OS file creation/birth time** — `lastModified` is the only filesystem timestamp available, and it changes when a file is copied/downloaded, so it's intentionally the last resort, not the primary signal.
- `src/lib/thumbnails.js` — lazy (dynamically imported) `pdfjs-dist` page-1 rendering to a canvas/data-URL. The worker URL uses Vite's native `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` asset pattern, so Vite bundles and content-hashes it as a same-origin asset automatically — no copy plugin needed, never fetched from a CDN.
- `src/lib/draftStore.js` + `src/lib/useDraftPersistence.js` — **crash-safe draft persistence** for the Sign and Redact tools. `draftStore.js` is a dependency-free native IndexedDB wrapper (DB `pdf-toolkit-drafts`, store `drafts` keyed by tool name so there's one active draft per tool) that stores the full source PDF bytes **plus** the edit state (annotations / redaction boxes), with a 14-day auto-expiry and graceful no-op degradation when IndexedDB is unavailable. `useDraftPersistence.js` is the Preact hook that debounce-autosaves while `status === 'editing'`, flushes on `visibilitychange`/`pagehide`, silently restores the last draft on mount (the draft is the source of truth; download does **not** clear it), and clears only on explicit "Start over". Both `PdfSignTool.jsx` and `PdfRedactTool.jsx` refactor their loaders into a shared `loadPdf()` reused by fresh picks and restore, and call `seedUniqueId()` (in `sign.js`) after restore so new element ids don't collide with restored ones. **Everything stays on-device — nothing is uploaded, preserving the core privacy constraint.** This is a flagship, differentiating feature (server-free crash recovery); it is surfaced as supporting SEO copy on the `sign`, `redact`, and home pages (intro copy + a benefit bullet + one FAQ entry per tool page, mirrored into `<SeoSchema>`'s `faq` array like every other FAQ).

Drag-to-reorder uses **SortableJS**, wired directly to the DOM list in `PdfMergeTool.jsx`; on drop, the final DOM order is read back into Preact state, which remains the single source of truth for every re-render.

## Theme / color palette

All color is driven by CSS custom properties defined once in `src/styles/global.css`'s `:root` block — never hardcode a hex/rgba color in a component or another stylesheet; reference the variable (e.g. `var(--color-primary)`) so the palette stays swappable from one place.

Current palette ("Sea Glass" — teal and cool grays, replacing the earlier navy + electric blue theme):
- `--color-bg: #f4f9fa`, `--color-surface: #ffffff`, `--color-surface-sunken: #c4e1e6` — cool white/glass surfaces.
- `--color-text: #23404a`, `--color-muted: #54707c`, `--color-muted-light: #a4ccd9` — deep teal ink, fading to muted slate.
- `--color-primary: #3e7c8d` (hover `#4a8ea0`, active `#356d7d`, soft tint `#eef6f8`, tint `#e6f1f3`) — the one accent color; used for primary buttons, links, focus rings, dropzone icon/border.
- `--color-success: #5c7a3a` (hover `#4a632f`, soft `#ebffd8`), `--color-danger: #b84c58` (soft `#fcf1f3`) — both were retuned alongside the retheme to read well against the cool teal base; don't recolor these without a reason.

When changing the theme in the future: update the `:root` block in `global.css`, then `grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and `public/` for any color literal that escaped the variable system (several button/dropzone shadows and the body background glow were historically hardcoded as `rgba(...)` rather than referencing a variable — re-check these). Also update `theme-color` in `BaseLayout.astro` and `theme_color`/`background_color` in `public/manifest.webmanifest` to match, since those aren't CSS and don't pick up the `:root` vars automatically. A pure color-only change doesn't touch scripts or CSP, so a `npm run dev` visual check is enough — full `build && preview` isn't required unless the change also touches scripts/`astro.config.mjs`.

## Voice & copy (read before writing or editing any user-facing text)

The full brand voice, origin story, and messaging principles live in [PRODUCT.md](./PRODUCT.md) - read it before touching copy. PDkef is a personal project shared generously, not a company; the copy should sound like that. The short version for anyone editing marketing/tool/FAQ text:

- **Explain, don't compete.** Never argue against named competitors or use an us-vs-them tone. State why the tool exists and how it works; the facts carry themselves. (There are legacy "Unlike DocuSign / Adobe Sign" and "Unlike many free online converters" lines in `src/data/tools.js` FAQs - soften these to plain statements, and do not add new ones.)
- **Lead with discovery, not fear.** The best hook is something genuinely useful the reader may not know ("you can fill and sign a PDF without printing and scanning"). Privacy is a reason to trust, not the headline.
- **Plain facts over intensifiers.** Prefer "Runs on your device. Free. Open source." to stacked "100% / instant / secure / zero." Pick the one honest word.
- **Founder voice is welcome.** First person ("I built this for myself, then wanted to share it...") is a differentiator here, not a liability. Do NOT frame it as "a weekend project" or emphasize how little time it took; that minimizes the work and ages badly. The incentive is the belief that these tools should be free and accessible to everyone.
- **Free because it should be, not as a funnel.** No "free tier" framing that implies an upsell.
- **No em dashes** in copy or prose (use spaced hyphens, commas, or split the sentence).
- All copy still lives in `.astro` / `src/data/tools.js`, rendered at build time and never injected client-side (see SEO invariants below).

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

## Styling direction (scoped hybrid, not a wholesale Tailwind migration)

The decided direction is a **scoped hybrid**, documented in full in [ARCHITECTURE.md](./ARCHITECTURE.md) and sequenced in [scrum.md](./scrum.md):

- **Tailwind** for the static/SEO `.astro` surface only (pages, heroes, cards, footer, dropzones, static buttons) - no runtime state, no cascades.
- **CSS Modules** (scoped, colocated per component) for the canvas editor (`SignTool/*`, `RedactTool`, `ElementToolbar`, resizers, element nodes). Keep semantic class names so the descendant-combinator state cascades (e.g. `.sign-element.active .sign-element-actions`) survive as real CSS inside module scope.
- **Inline styles / CSS custom properties** for per-element runtime geometry (`top/left/width/height/fontSize` percentages) - these are continuous floats the Tailwind JIT cannot emit classes for.

This is explicitly **not** "finish the wholesale Tailwind migration." The goal is to kill the single global CSS monolith by scoping styles, not to Tailwind-ify the editor.

**Status (landed, 2026-07):** this direction is now complete. The static/SEO surface is on Tailwind utilities (E3); the editor `.sign-*`/`.sig-*` styles are colocated in CSS Modules with **0 editor selectors left in `global.css`** (E2.3, enforced by `scripts/check-editor-global-css.js`); and the framework-agnostic `src/editor/` core + per-type registry is in place with **Sign and Redact converged onto it** (E4). Remaining migration items are the E6 launch backlog only.

**The old "the branch broke the PDF math" framing is stale - do not act on it.** That warning described one snapshot: an early wip commit that (wrongly) routed `pointermove` through React state and thrashed reconciliation. The **resize perf fix already landed on the same wip branch** with the correct deferred-DOM pattern. That per-frame `onChange` on resize in `src/components/SignTool/DraggableWrapper.jsx` `handleResizeMove` was fixed under backlog E0.1, so Sign drag and resize follow the golden rule. The gesture golden rule (mutate the DOM during a gesture, commit React state once on `pointerup`) is non-negotiable and is now captured in ARCHITECTURE.md §1.2 / §4 along with the other still-true lessons from the retired learnings doc (invisible-toolbar cascade hazard, CSP-invisible-in-dev hazard). Read ARCHITECTURE.md before touching editor styling or the gesture path. **Status (E4 landed):** every gesture path - Sign **and** Redact, drag/resize/create alike - now routes through the single `src/editor/gestures/controller.ts`, which mutates the DOM during the gesture and commits state exactly once on release. Both tools share the headless `src/editor/` core and per-type registry (per-type resize/serialize/schema; box-resize has one owner, CI-guarded). The full editor-core low-level design (audit + `src/editor/` layout + per-ticket plan) is **[docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md)**.

**Sign editor positioning/color pitfalls (current guardrail work):**
- Text toolbar placement must stay stable above the element: LTR uses `top-start`, RTL uses
  `top-end`. Do not reintroduce Floating UI vertical `flip()` to `bottom-*`; that made the toolbar
  jump underneath selected text. Use horizontal `shift()` within the PDF page boundary instead.
- The toolbar should be validated in a real browser for actual rects and during live drag; jsdom can
  only assert middleware config and committed state.
- Text defaults and whiteout defaults are separate. New text may inherit the active/last edited text
  size, color, font, and typed-language direction; whiteout must use its own remembered whiteout color,
  not text/shape color.
