# CLAUDE.md

Guidance for Claude Code and any other coding agent in this repository. This file is deliberately
short: it holds what every agent needs in every session. Everything else is loaded on demand:

- **`.claude/rules/*.md`** - topic rules with `paths:` frontmatter, loaded automatically when you read a
  matching file. Each starts with a one-paragraph summary; the table at the end of this file says which
  rule covers what. If you are working from a prompt alone, open the relevant rule before editing.
- **[docs/troubleshooting.md](./docs/troubleshooting.md)** - read *before* debugging when an island
  silently does nothing, a whole Playwright suite goes red at once, or hydration dies on `'__H'`.
- **[TODO.md](./TODO.md)** - the single backlog (generated from `backlog/tasks/`). No task state here.
- **[README.md](./README.md)** - for humans and the GitHub landing page, not agent guidance.
- **`docs/`** - design records for individual pieces of work, linked from the rule that needs them.
  [docs/sign-tool-product-decisions.md](./docs/sign-tool-product-decisions.md) is the confirmed Sign
  scope; consult it before reviving assumptions from older proposals.

**Keeping this file thin is a rule, enforced by `npm run check:guidance` in CI.** A lesson earns one
line here only if every agent needs it every session; its narrative and evidence go in the topic rule
(or a `docs/` record the rule links). Never paste a post-mortem into this file.

## What this is

A 100% client-side, static web app: a suite of PDF tools (Merge, Split, Edit Pages, Compress, PDF to
Image, Image to PDF, Sign, Redact, Unlock/Protect, plus Compress Image) that run in the browser and
rank for specific PDF keywords. **There is no PDF-processing server and files must never leave the
device.** Processing works offline once assets are provisioned. All ten tools are implemented, indexed and registered in
`src/data/tools.js`. Runtime dependencies must use the permissive-license allowlist (MIT, Apache-2.0,
ISC, BSD-2/3, Zlib, 0BSD); `npm run test:licenses` enforces it.

## Commands

```bash
npm install
npm run dev       # local dev server (astro dev)
npm run build     # production build to dist/
npm run preview   # preview the production build (serves dist/ from disk)
npm test          # unit/component tests (Vitest + jsdom)
npm run test:e2e  # browser guardrails (Playwright; keep under e2e/<module>/)
```

- E2E tests are sparse guardrails, roughly 1 e2e per 10 unit tests, only for what jsdom cannot prove
  (rendered rects, drag-time behaviour, page-edge behaviour, hydration/CSP flows).
- **One preview, on 4173, per worktree.** `astro preview` is a one-instance daemon and Playwright reuses
  whatever owns the port, so a second preview or a per-agent port silently tests another build.
- A fresh `git worktree` needs its own `npm install`; a missing or partial `node_modules` there breaks
  CSS Modules silently (`styles.foo === undefined`), not just the dev server.
- Deploy: push to `main` and Vercel auto-deploys.

## Architecture

**Astro, `output: 'static'`, islands.** Every page is prerendered to flat HTML at build time.

- The SEO surface (H1, how-it-works, FAQ, JSON-LD) is `.astro` / `src/data/*.js` /
  `src/content/content-pages/*.yaml`, rendered at build time with zero JS shipped.
- The tools are Preact islands (`src/components/Pdf*Tool.tsx`, `client:load`) over `BasePdfTool.tsx`.
  Sign and Redact share the framework-free `src/editor/` core (model, geometry, gesture controller,
  per-type registry) and on-device IndexedDB draft persistence (`src/editor/workspace/draftStore.js`).
- Tool logic lives in `src/lib/` (`merge.js`, `split.js`, `compress.js`, `toImage.js`, ...) and
  `src/editor/`. `pdfjs-dist`'s worker is bundled as a same-origin asset, never fetched from a CDN.
- One request-time exception to "no server": `middleware.ts` negotiates `Accept: text/markdown` for the
  marketing pages. It never sees a PDF byte.
- Styling is a scoped hybrid: Tailwind utilities for the static `.astro` surface, CSS Modules for the
  editor, inline styles only for per-element runtime geometry. `global.css` holds tokens and element
  defaults only.

## Invariants every change must respect

Each of these fixed a shipped bug or protects the product's reason to exist. The rule file named in
brackets carries the evidence; do not relearn it.

- **No file bytes ever leave the device.** No `fetch`/XHR of PDF contents, no external `connect-src`,
  no cookies or accounts. Anonymous, allowlisted maintenance telemetry is permitted and must never block
  the tools. CSP `connect-src 'self'` is the backstop. [csp-scripts-pwa]
- **The SEO shell stays static HTML.** Marketing, how-to, FAQ and JSON-LD are never moved into an
  island or injected client-side. One `<h1>` per page; primary keyword in title, h1 and description;
  FAQ JSON-LD must match on-page content. Off the table: SSR, any external `connect-src`, any JS
  shipped to the SEO surface. [content-and-copy]
- **CSP is invisible in `astro dev`.** Any change to scripts, styles, `astro.config.mjs` or
  `vercel.json` is verified only by `npm run build && npm run preview`. Never `is:inline` a script;
  never add `script-src`/`default-src` to the `vercel.json` header. [csp-scripts-pwa]
- **Gesture golden rule.** Drag, resize and create mutate the DOM during the gesture and commit state
  exactly once on release, through `src/editor/gestures/controller.ts`. Never route `pointermove`
  through state or a store. Statically enforced by `check-gesture-golden-rule.js`. [editor]
- **Tools are one-shot; selection and text editing are separate states.** An armed tool disarms after
  one placement; double-click locks it; the "Stop" chip is the only exit on touch. [editor]
- **Fonts render identically on screen and in the export.** Always resolve a family through
  `src/editor/text/fonts.js`; every script needs a `SCRIPT_FALLBACKS` row and a shaping guard; never rasterise
  text to fix a mismatch. Adding a font is a nine-step unit of work. [fonts-and-text]
- **Every canonical URL ends in a slash.** Internal links carry the slash; a new route needs its
  non-slash → slash redirect pair in `vercel.json` in the same change (`npm run test:redirects`).
  [routing-and-pages]
- **Colors come from `:root` tokens in `global.css`, never literals.** Tailwind's `@theme` skips the
  default scale, so an undeclared utility compiles to *nothing*; declare the token first. A component
  must be listed in its page family's entry sheet in `src/styles/` or its utilities are missing on that
  page (`npm run test:css` names the page). [styling]
- **The home page is one canonical DOM that CSS reshapes; nothing is re-parented after load**, and its
  first screen (hero, launcher, dock) is one composed unit that nothing gets inserted into. [home-page]
- **Never reveal with an IntersectionObserver what JS first hid**; derive reveal state from scroll
  position (`animation-timeline: view()`). [home-page]
- **Service worker: no `skipWaiting()`, best-effort precache except `/`, self-uninstall on a 404
  manifest.** [csp-scripts-pwa]
- **Astro stays on `^7.0.3`**: older majors carry published advisories; anything needing
  `legacy-peer-deps` is re-audited first. [csp-scripts-pwa]

## Voice (for any user-facing text)

Warm, modest, honest: a person sharing something useful, not a company selling a product. First person
is welcome. Plain facts over intensifiers ("Runs on your device. Free. Open source."). Privacy at human
altitude, never security jargon. Explain, don't compete: no competitor names, no us-vs-them. Free
because it should be, not as a funnel. **No em dashes** (use spaced hyphens, commas, or split the
sentence). Never frame PDkef around how little time it took to build. The full voice guide, origin
story and SEO rules are in [content-and-copy]; SEO work starts from
[docs/seo-competitive-findings.md](./docs/seo-competitive-findings.md).

## CI guardrails (invariants are checks, not prose)

`ci.yml` runs, in order: `check:backlog`, `check:guidance`, `test`, `typecheck`,
`test:editor-dependency-directions`, the single-owner box-resize grep, `test:gesture-golden-rule`,
`check-class-resolution`,
`test:fonts`, `test:licenses`, `test:dependency-governance`, then `build`, `test:csp`, `test:seo`,
`test:redirects`, `test:css`, `test:weight`, and Playwright. Ratchets (CSS duplication, dead bytes,
editor selectors in `global.css`) only ever go down: **the fix is to narrow what a page carries, never
to raise a limit.** Page-weight budgets are budgets, not ratchets.

## Where the detail lives

| Rule file (`.claude/rules/`) | Loads when you read | Headline |
| --- | --- | --- |
| `editor.md` | `src/editor/**`, `src/components/SignTool/**`, tool islands, `src/lib/**` | design standard, arming/selection model, toolbar layout, editor hazards |
| `fonts-and-text.md` | `src/editor/text/**`, `src/lib/*ont*`, `public/fonts/**`, shaping guards | screening protocol, per-script guards, subsetting, the five text stages |
| `styling.md` | `src/styles/**`, any `.css`, CSS guard scripts | palette, per-family utility sheets, CSS Modules boundary, ratchets |
| `csp-scripts-pwa.md` | `astro.config.mjs`, `vercel.json`, layouts, `public/sw.js`, `package.json` | CSP layers and incidents, service worker invariants, version pinning |
| `routing-and-pages.md` | `src/pages/**`, `src/data/**`, `middleware.ts`, `vercel.json` | tool registry, redirects, trust pages, Markdown negotiation |
| `content-and-copy.md` | `src/content/**`, `src/data/**`, `.astro` components, SEO docs | content collection, full voice guide, SEO invariants and acquisition |
| `home-page.md` | `src/pages/index.astro`, `HeroDemo/**`, `FileDropzone*`, `e2e/home/**` | layout/CLS invariants, launcher vs demo, scroll-driven reveal |

Design records: [docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md) (editor
core), [docs/wysiwyg-text-architecture.md](./docs/wysiwyg-text-architecture.md) (text pipeline, current),
[docs/shaping-guard-platform-calibration.md](./docs/shaping-guard-platform-calibration.md) (why a guard's
green means what it means).
