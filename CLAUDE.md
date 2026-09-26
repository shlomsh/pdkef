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
npm run check:fast        # the loop (~15s): guards, units for what changed, tsc (astro check on .astro/config edits)
npm run check:push        # one pre-push command: the same CI oracle, narrowed to what the diff needs
npm test                  # whole unit suite (Vitest; jsdom only where vitest.config.js's DOM_TESTS says)
npm run test:e2e          # build + product e2e + font guards + export guards, each narrowed by scripts/affected-scope.mjs (~1.5 min)
npm run test:e2e:product  # the product specs against the current dist/ (~45s on 4 workers), unconditionally
npm run test:e2e:fonts    # the 25 font screening guards, unconditionally; CI narrows them the same way
```

- **Iterate with `check:fast`; run `check:push` once before a push**, not after every edit and not once
  per subagent. A subagent's brief names `check:fast -- --since <task start commit>` (or one spec). [tests]
- E2E tests are sparse guardrails, roughly 1 e2e per 10 unit tests, only for what jsdom cannot prove
  (rendered rects, drag-time behaviour, page-edge behaviour, hydration/CSP flows). Playwright runs on
  4 workers (2 in CI); a spec that asserts a wall-clock budget goes in `PERF_BUDGETS` in
  `playwright.config.js`, which always runs alone. [fonts-and-text] for the font guards.
- **One preview, on 4173, per worktree.** `astro preview` is a one-instance daemon and Playwright reuses
  whatever owns the port, so a second preview or a per-agent port silently tests another build.
- A fresh `git worktree` needs its own `npm install`; a missing or partial `node_modules` there breaks
  CSS Modules silently (`styles.foo === undefined`), not just the dev server.
- Deploy: push to `main` and Vercel auto-deploys.

## How we work

- **Team-lead mode.** For anything with independent pieces, delegate to Sonnet subagents instead of
  doing it all on the main thread; brief each one precisely and verify its report yourself — a
  subagent's summary describes intent, not necessarily what happened.
- **One subagent, one task, and small ones.** Research and exploration never happen on the main thread.
  The lead makes the design call, then splits the work into narrow briefs (one change, one guard, one
  doc edit, one measurement) run in parallel; a brief names the concrete shape, not a goal to search
  for. No fire-and-forget: read each agent's diff while it runs and stop one that drifts. A harder
  problem gets more subagents working in parallel, not more patience from one.
- **Mechanical edits go to the `implementer` agent** (`.claude/agents/implementer.md`): named files,
  one `check:fast`. Builds, previews and viewport sweeps run once in the lead or one verifier, starting
  from 3-4 viewports; wall time tracks brief size, at about 8s per tool call plus reasoning.
- **Review is a separate subagent with zero shared context.** Self-review confirms assumptions, it
  doesn't test them. The reviewer is spawned fresh, and every objection it raises must quote the exact
  line it applies to.
- **Simple wins.** Prefer the more elegant solution; three similar lines beat a premature abstraction.
- **Engineering is a core principle.** Isolation, DRY, and tests aren't optional extras. If a change is
  quietly causing tech debt (a slowing build, duplicated logic, missing isolation or coverage), open a
  `backlog/tasks/` ticket for it and spend the time on better engineering rather than pushing through.
- **The board reflects reality.** Mark a ticket `in_progress` the moment work starts on it
  (`backlog/tasks/`, see `backlog/README.md`). Don't let a ticket sit half-done and half-blocked —
  split the remaining work into a new ticket so the original can close.
- **Worktrees are the default, and they get cleaned up.** Do non-trivial work in its own `git worktree`
  on its own branch. Land it on `main` with a direct push, no PR — confirm with the user first, and
  check `origin/main`'s tip right before pushing since it moves between sessions. After it's pushed,
  ask the user before deleting anything, then delete the local worktree (`git worktree remove`) and the
  branch, local and remote.

## Architecture

**Astro, `output: 'static'`, islands.** Every page is prerendered to flat HTML at build time.

- The SEO surface (H1, how-it-works, FAQ, JSON-LD) is `.astro` / `src/data/*.js` /
  `src/content/content-pages/*.yaml`, rendered at build time with zero JS shipped.
- The tools are Preact islands (`Pdf*Tool.tsx`, `client:load`) over `src/shell/BasePdfTool.tsx`, one
  folder per tool under `src/tools/<tool>/` (island, components, single-consumer lib modules, unit
  tests, `e2e/`); `src/components/` holds only the `.astro` site components and `HeroDemo/`. Sign and
  Redact share the framework-free `src/editor/` core (model, geometry, gesture controller, per-type
  registry). Every tool shares one on-device IndexedDB memory space (`src/lib/drafts/draftStore.js`):
  a PDF a tool has opened stays in recents, per-tool work attaches to it, and nothing is ever cleared
  by opening a different file.
- Shared tool logic lives in `src/lib/` and `src/editor/`, shared chrome in `src/shell/` and
  `src/editor-ui/`; the rules between them are `docs/module-boundaries.md`, enforced by
  `test:module-boundaries`. `pdfjs-dist`'s worker is bundled as a same-origin asset, never from a CDN.
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
  exactly once on release, through `src/lib/gestures/controller.ts`. Never route `pointermove`
  through state or a store. Statically enforced by `check-gesture-golden-rule.js`. [editor]
- **Sign's field detection and document memory are pure logic, apart from the UX.** Every setting a person
  chooses is remembered per document and also becomes the default for new documents, except the
  direction. Any Sign UX calls them and never re-derives them. [editor]
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

**Localization is a programme, not a ticket.** Per-language stage, coverage, the measured evidence
behind every hold and the date it comes back live on the languages page
(https://claude.ai/code/artifact/0758819e-6104-460e-8cf0-05bc3ee84e78, source and data snapshot in
`docs/i18n-status/`). Read it before proposing, building or retiring a language; a decision changes
there first, then in its LOC ticket. [content-and-copy]

## CI guardrails (invariants are checks, not prose)

`ci.yml` runs, in order: `check:backlog`, `check:guidance`, `test`, `typecheck`,
`test:editor-dependency-directions` (also the single-owner box-resize check), `test:module-boundaries`,
`test:gesture-golden-rule`, `test:detection-purity`, `check-class-resolution`,
`test:fonts`, `test:licenses`, `test:dependency-governance`, then `build`, `test:csp`, `test:seo`,
`test:redirects`, `test:css`, `test:weight`, `test:lazy-modules`, and Playwright. Ratchets (CSS duplication, dead bytes,
editor selectors in `global.css`) only ever go down: **the fix is to narrow what a page carries, never
to raise a limit.** Page-weight budgets are budgets, not ratchets.

## Where the detail lives

| Rule file (`.claude/rules/`) | Loads when you read | Headline |
| --- | --- | --- |
| `editor.md` | `src/editor/**`, `src/editor-ui/**`, `src/tools/sign/**`, `src/tools/redact/**` | design standard, arming/selection model, toolbar layout, editor hazards |
| `tools-and-shell.md` | `src/tools/**`, `src/shell/**`, `src/lib/**`, `docs/ux-design-guidelines.md` | draft persistence, other tools, cross-tool hand-offs, UX guideline |
| `tests.md` | `src/test/**`, any e2e spec, `vitest.config.js`, `playwright.config.js`, `scripts/affected-scope.mjs` | DOM test scope, per-platform text width, cross-tool test folder, affected-scope narrowing |
| `fonts-and-text.md` | `src/editor/text/**`, `public/fonts/**`, shaping guards | screening protocol, per-script guards, subsetting, the five text stages |
| `styling.md` | `src/styles/**`, any `.css`, CSS guard scripts | palette, per-family utility sheets, CSS Modules boundary, ratchets |
| `csp-scripts-pwa.md` | `astro.config.mjs`, `vercel.json`, layouts, `public/sw.js`, `package.json` | CSP layers and incidents, service worker invariants, version pinning |
| `routing-and-pages.md` | `src/pages/**`, `src/data/**`, `middleware.ts`, `vercel.json` | tool registry, redirects, trust pages, Markdown negotiation |
| `content-and-copy.md` | `src/content/**`, `src/data/**`, `.astro` components, SEO docs | content collection, full voice guide, SEO invariants and acquisition |
| `home-page.md` | `src/pages/index.astro`, `HeroDemo/**`, `FileDropzone*`, `e2e/home/**` | layout/CLS invariants, launcher vs demo, scroll-driven reveal |

Design records: [docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md) (editor
core), [docs/wysiwyg-text-architecture.md](./docs/wysiwyg-text-architecture.md) (text pipeline, current),
[docs/shaping-guard-platform-calibration.md](./docs/shaping-guard-platform-calibration.md) (why a guard's
green means what it means).
