# Scrum Backlog

The maintainability-migration backlog for PDkef, ready to assign. The design standard it serves is
[ARCHITECTURE.md](./ARCHITECTURE.md); day-to-day repo guidance is [CLAUDE.md](./CLAUDE.md).

**How to read this:** work is grouped into epics (E0–E6). Each ticket lists **Depends on** (what must
land first) and a **Lane** (which tickets can run in parallel). Every ticket's acceptance includes the
relevant guardrail - editor-touching work is verified in a *running* editor **and** with
`npm run build && npm run preview` (the CSP bug class is invisible in `npm run dev`).

Two things stay untouched across the whole migration: the **SEO/privacy island shell** and the
**gesture hot path** (see ARCHITECTURE §1).

---

## E0 - Stabilize & de-risk  ·  *start immediately, no deps*

- **E0.1 Land the resize perf fix on `main`.** - **done.** Re-apply the gesture portions of commit `c4583df`
  (the `pendingResize` accumulator + direct DOM mutation during move, single `onChange` on
  `pointerup`) into `DraggableWrapper.jsx` `handleResizeMove`/`handleResizeUp` (and companions
  `ElementResizers.jsx`, `TextNode.jsx`), **excluding** the Tailwind className edits. `main` currently
  dispatches `onChange` per pointermove on resize - this removes a live thrash.
  - *Depends on:* - · *Lane:* A (start now)
  - *Acceptance:* drag **and** resize stay smooth; a temporary `console.count` in `onChange` ticks
    **once per gesture**, not per frame; draft autosave/restore still correct; `build && preview` CSP pass.
- **E0.2 Retire `tailwind-refactor-wip`.** - **done.** First rescue its reusable pieces (the `index.astro` utility
  patterns, `tailwind.config.mjs`, `check-css-bundle.js` scaffolding) by tagging the branch
  (`archive/tailwind-wip-2026-07`), then delete it so no one resumes the tangled branch in place.
  - *Depends on:* E0.1 · *Lane:* A

## E1 - Guardrails  ·  *parallel; these gate the risky work in E2–E4*

- **E1.1 CSP hash-verification CI gate.** - **done.** On `build && preview`, diff the generated `<meta>` CSP hash
  list against every emitted inline script/style (sha256+base64), per CLAUDE.md's method. Fail CI on mismatch.
- **E1.2 SEO invariants test.** - **done.** Assert exactly one `<h1>` per page; `<title>`, meta description,
  canonical, OG/Twitter present; JSON-LD (`SoftwareApplication` + `FAQPage`) validates; FAQ schema
  matches on-page FAQ.
- **E1.3 CSS budget guard.** - **done.** Port `check-css-bundle.js` from the archived branch into CI so the
  global stylesheet can't silently regrow past a threshold.
- **E1.4 Editor interaction/visual test harness.** - **done.** Covers the six states unit tests miss
  (active outline, floating-toolbar visibility + stable top placement, RTL toolbar alignment + leftward
  growth, dark mode, mobile full-width toolbar, whiteout bounds) in `DraggableWrapper.interaction.test.jsx`
  + an appended `SignToolbar.test.jsx` case. jsdom has no layout engine, so the placement/RTL states assert
  the exact Floating UI `middleware`/`placement` config passed to `useFloating` (real check of the
  config, not resolved pixels); the mobile/outline states assert the CSS contract + real DOM shape.
  Full suite green (441 tests). No source components modified.
  - *Depends on (all E1):* - · *Lane:* B (parallel with A)
- **E1.5 Per-type gesture invariants + non-vacuous geometry harness.** - **done.** *(Added from the
  whiteout-resize post-mortem.)* Generalize the three whiteout regression tests into invariants asserted
  for **every** resizable element type, on a **mandated realistic mocked page-wrapper rect**: (a) a move
  changes only position, never size; (b) a resize preserves the opposite/anchor edge for every handle;
  (c) a zero-delta resize is a no-op. Ban the unmocked 0x0-rect test pattern (it saturates every clamp to
  ±Infinity and made the prior whiteout tests vacuous - the exact reason the regression shipped). If a
  type other than shape/whiteout fails an invariant, report it as a found bug, do not silently fix.
  - *Depends on:* - · *Lane:* B (parallel with A)
  - *Acceptance:* new tests fail against a deliberately reintroduced blanket-clamp and pass against the
    landed per-handle fix; full suite green; no source components modified.
  - *Landed:* Sign side in `DraggableWrapper.gestureInvariants.test.jsx` (shape/rectangle+ellipse, line,
    text, symbol, signature; 600x800 mocked wrapper) with a built-in **non-vacuity meta-guard** that
    fires only when a blanket left/top clamp is reintroduced. Redact side (its own duplicate
    `handleBoxResizeStart` math - the E4.3 convergence target) in `PdfRedactTool.test.jsx` on a 500x1000
    mocked wrapper: whiteout regression block **plus** the three invariants parametrized across the
    newly-resizable **blackout and blur** styles (they gained the 8-handle path in `274b293`).
    Non-vacuity was verified by transiently reintroducing the `Infinity`-cap + blanket-clamp bug in both
    `DraggableWrapper.jsx` and `PdfRedactTool.jsx` and confirming the meta-guard / anchor tests go red,
    then reverting. No type outside shape/whiteout failed an invariant. Full suite green (284); no source
    components modified.
- **E1.6 Playwright browser guardrails for editor layout.** - **done.** Add a small
  browser-level e2e harness for the cases jsdom cannot prove. Keep files under `e2e/<module>/` and keep
  the suite intentionally sparse - no more than roughly one e2e test per ten unit/component tests. These
  are guardrails for refactoring, not a second copy of the unit suite. The Sign guardrail landed in
  `e2e/sign/` with Playwright config + `npm run test:e2e`; the Redact guardrail landed in
  `e2e/redact/redact-editor.spec.js`. **Flake fix:** both open-helpers now wait for the `client:load`
  island to hydrate (`astro-island[client="load"]:not([ssr])`) before `setFiles` - the plain-HTML
  `<input type=file>` accepts a file even unhydrated, so an early file-set was silently dropped and the
  workspace never rendered (intermittent 10s timeout). Full e2e suite green and stable across repeated runs.
  - *Depends on:* E1.4, E1.5 · *Lane:* B
  - *Acceptance:* Sign e2e covers at least:
    (1) selected text toolbar renders above the element and aligns left/right according to typed LTR/RTL
    language; (2) while dragging an active element, the toolbar follows the live DOM-mutated position
    before `pointerup`, not only after drop; (3) whiteout creation keeps its own color/default separate
    from edited text/shape color. Redact e2e covers at least: (1) blackout/blur/whiteout all expose the
    expected 8 resize handles; (2) blackout/blur red delete controls stay reachable inside the box; (3)
    whiteout uses toolbar delete and keeps its own white default; (4) drag/resize near page edges remains
    page-bound. Tests run against a production build/preview path when touching CSP, hydration, or Astro
    island behavior.
- **E1.6a Wire Playwright e2e into CI.** - **done.** CI installs Chromium (`npx playwright install
  --with-deps chromium`), runs `npm run test:e2e`, and uploads the Playwright report/traces on failure.
  The browser guardrails only protect refactors if CI runs them.
  - *Depends on:* E1.6 · *Lane:* B
  - *Acceptance:* CI runs `npm test`, `npm run build`, installs the Chromium browser needed by Playwright,
    and runs `npm run test:e2e` on pushes/PRs; upload Playwright traces/report on failure if the CI
    provider makes that straightforward.
- **E1.7 Runtime CSP style-attribute guard.** Playwright preview surfaced CSP violations for runtime
  `style=""` attributes, which matter because editor geometry and Floating UI placement are currently
  expressed as inline styles. `scripts/verify-csp.js` only verifies generated `<script>`/`<style>` hash
  coverage; it cannot catch browser-enforced style-attribute violations.
  - *Depends on:* E1.6 · *Lane:* B
  - *Acceptance:* decide and document the intended CSP posture for runtime geometry styles (explicitly
    allow style attributes, or migrate geometry to CSS custom properties/classes first); then make e2e
    fail on unexpected CSP violations while ignoring known local-only noise such as the Vercel Analytics
    404 in preview.

## E2 - Kill the global CSS monolith  ·  *Lane C, parallel with E3*

- **E2.1 Tokens as the only global CSS.** Keep `:root` design tokens global; audit for escaped color
  literals (`grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and `public/`) and route them through vars.
  - *Depends on:* - · *Lane:* C
- **E2.2 Colocate non-editor CSS into CSS Modules,** component by component (cards, hero, footer, dropzone, tool chrome).
  - *Depends on:* E2.1 · *Lane:* C
- **E2.3 Migrate editor `.sign-*` styles into scoped CSS Modules** (currently ~121 `sign-*` references
  in a ~3,400-line `global.css`), **preserving descendant cascades** (`.sign-element.active
  .sign-element-actions`) as real CSS inside module scope. *(Absorbs the old "colocate `.sign-*`
  styles" tech-debt note - now a first-class migration step, not opportunistic.)*
  - *Depends on:* E2.1, E1.4 · *Lane:* C
  - *Acceptance:* every conditional state (active, RTL, dark, mobile, whiteout) verified in a running editor.

## E3 - Tailwind on the static surface  ·  *Lane D, parallel with E2*

- **E3.1 Clean Tailwind install (audit).** - **done (audit; landing deferred to E3.2).** Validated in a
  worktree: `tailwindcss` + `@tailwindcss/vite@^4.3.2` install **clean** against the Astro `^7.0.3` pin -
  no `legacy-peer-deps`, 0 new `npm audit` vulns, vite peer satisfied. Recipe: add the `@tailwindcss/vite`
  plugin to `astro.config` `vite.plugins`; CSS-first import of the **theme + utilities layers only**
  (skip Preflight - it resets margins site-wide and blew the CSS budget). Not landed on `main` yet, so
  the theme layer doesn't consume the CSS budget before it's used.
  - *Depends on:* - · *Lane:* D
- **E3.2 Migrate the marketing `.astro` surface to utilities** (`index.astro`, tool pages, `FeatureCard`,
  `ToolHero`, `AppBar`, `Footer`). No editor components.
  - *Depends on:* E3.1, E1.1, E1.2 · *Lane:* D
  - *First step + caveat (from E3.1):* land the E3.1 recipe, then **trim Tailwind's default color scales**
    (the project uses its own `:root` tokens, so the default palette must not be used anyway) - the theme
    layer alone left only ~862 bytes of CSS-budget headroom (79,138 / 80,000). Watch `npm run test:css`
    from the first page migrated.

## E4 - Headless TS editor core  ·  *Lane E, internally serial, parallel to E2/E3*

- **E4.1 Introduce TypeScript** to the element model, geometry math, and core (UI can stay JSX initially).
  - *Depends on:* - · *Lane:* E
- **E4.2 Extract a framework-agnostic `editor/` core** (document model + geometry + gesture
  controllers) with **one** "imperative-during, commit-on-release" controller unifying drag **and**
  resize, so they can't diverge again (ARCHITECTURE §3.2, §4). Preact becomes a thin render/event shell.
  - *Depends on:* E4.1, E0.1 · *Lane:* E
- **E4.3 Per-element-type registry** - each type a module `{ render, resizeBehavior, serialize, schema }`;
  removes the `type === 'line'` / `!isLine` branching in `handleResizeMove`. *(Supersedes the old
  lighter `geometryKind` half-measure - the registry is the chosen fix; per-type `nodes/` already exist
  as the seam.)*
  - *Depends on:* E4.2 · *Lane:* E
  - *Acceptance (sharpened by the whiteout-resize post-mortem):* **no shared function post-processes
    geometry across handles or types** - each type's `resizeBehavior` owns its own per-handle bounds,
    expressed against that handle's true anchor edge, so a clamp change to one type cannot corrupt
    another (the exact failure mode of `434e844`). Every type's `resizeBehavior` is covered by the E1.5
    invariants.
- **E4.4 Converge Sign and Redact** onto the shared core + a common PDF-workspace substrate
  (load, page render, draft persistence), removing duplication.
  - *Depends on:* E4.2, E4.3 · *Lane:* E

## E5 - Documentation  ·  *mostly done this session*

- **E5.1** `ARCHITECTURE.md` design standard - **done.**
- **E5.2** Realign `CLAUDE.md` + `README.md`; delete stale `TAILWIND_MIGRATION_LEARNINGS.md` - **done.**
- **E5.3** This backlog - **done.**
- **E5.4** Keep docs in sync as epics land (update CLAUDE.md status + this backlog per ticket). *Ongoing.*

## E6 - Carried-over backlog  ·  *postponed, off the migration critical path*

Triaged from the former `TODO.md` (KEEP-POSTPONED items, code-verified this session).

**Operational / SEO-launch** (most gated on the final domain / launch):
- Pre-launch **real domain swap** - `astro.config.mjs` `site` + sitemap/canonical still on the
  `pdkef.vercel.app` placeholder; re-verify canonical/OG after.
- **HSTS header** in `vercel.json` (`max-age=63072000; includeSubDomains; preload`) - only once the
  final domain is confirmed HTTPS-only.
- **Register Google Search Console** + submit sitemap once the domain is final; monitor Core Web
  Vitals (prioritize INP for signature drawing).
- **IndexNow** (low priority) - `public/<key>.txt` + deploy ping for faster Bing/Yandex indexing.
- **Homepage hub link check** - recurring guard: confirm no tool card points at a `noindex` route.
- **User feedback / suggestion channel** - prefer a GitHub Issues/Discussions link (zero new network
  surface, respects CSP `connect-src 'self'`); an in-app form would require documented CSP loosening
  for text only, never file bytes - weigh against the privacy positioning first.
- **Long-tail landing pages** - `/sign-pdf-no-signup`, `/offline-pdf-form-filler`, `/open-source-pdf-editor`.
- **OS-specific how-to guides** internally linking into the tools (no outbound promo links).
- **Public GitHub repo + iframe embed model** for contextual backlinks.

**Bugs / hardening surfaced by E1.4 test coverage:**
- **Off-page shape resize** - **fixed.** `DraggableWrapper.jsx` `handleResizeMove` now clamps the
  derived `left`/`top` to `[0, 100 - width]` / `[0, 100 - height]` on left/top-handle drags, applied to
  both the in-gesture DOM write and the single committed `onChange` (golden rule preserved). E1.4
  whiteout-bounds test flipped to assert the box stays on-page.
- **Dead RTL toolbar CSS** - **fixed.** Removed both `.sign-element-actions--rtl` blocks from
  `global.css` and corrected the stale `DraggableWrapper.jsx` comment to say alignment is driven by
  Floating UI `placement` (`top-end`/`top-start`). E1.4 documenting test updated. CSP gate re-verified.
- **CSP guard: warn-not-fail on missing meta** - `verify-csp.js` only `[WARN]`s when a page has no CSP
  `<meta>` (correct for the Google verification file), so a content page that *lost* its CSP would stay
  green. Tighten to fail for non-allowlisted pages.
- **CSS budget headroom is thin** - E1.3 passes at ~72KB against an 80KB cap (~10% headroom); expect it
  to bite on the first non-trivial CSS addition (by design, but flagged so it isn't a surprise).
- **Sign toolbar bottom-jump regression** - **fixed.** The toolbar was allowed to use Floating UI
  `flip()` and could fall back from `top-start`/`top-end` to `bottom-*`, which placed it underneath the
  selected text. The editor contract is now stable top placement: use `top-start` for LTR and `top-end`
  for RTL, with `shift()` for page-bounded horizontal overflow only. Browser e2e should assert actual
  toolbar rects because jsdom can only see middleware config.
- **Text defaults vs whiteout defaults** - **fixed.** New text inherits the active/last edited text
  size, color, font, and direction; direction is typed-language first, then remembered fallback. Whiteout
  keeps an independent color default and must not inherit text/shape color.
- **Runtime CSP style-attribute violations** - **found by Playwright.** Production preview logs
  `style-src` violations for runtime style attributes. This does not show up in jsdom and is not covered
  by the current hash-only CSP script. Treat as E1.7 before tightening CSP or migrating editor geometry.

**Editor / UX polish:**
- **Verify Redact mobile toolbar** on a real narrow viewport - code updated (shared `.sign-toolbar`
  CSS, structure-agnostic mobile flex rule) but never visually confirmed.
- **State-based drag halo** - replace the single-value `.sign-element::after` grab halo with a small
  resting halo + a larger halo only on `.active` (which is `z-index:50`, so it won't steal neighbor clicks).

---

## Dependency / lane summary

```
Lane A (now):   E0.1 ──► E0.2
Lane B (now):   E1.1✓ E1.2✓ E1.3✓ E1.4✓ E1.5✓ E1.6✓ E1.6a✓  E1.7(todo)  ── gate ──► E2.*, E3.2, E4 verification
Lane C:         E2.1 ──► E2.2, E2.3            (E2.3 also needs E1.4)
Lane D:         E3.1 ──► E3.2                  (E3.2 also needs E1.1, E1.2)
Lane E:         E4.1 ──► E4.2 ──► E4.3 ──► E4.4   (E4.2 also needs E0.1)
```

C, D, E run in parallel once B is in place. E0.1 unblocks E4.2. E6 is independent and can be picked
up opportunistically (its launch items cluster around the domain cutover).

---

## Done (historical log)

Bug fixes landed this session (test-first, on the clean baseline):
- **Redact whiteout resize disappearing off-page** (`ea10349`) - `PdfRedactTool.jsx`'s
  `handleBoxResizeStart` was a stale copy of the Sign tool's pre-`ca411be` shape math; left/top/corner
  drags drove `left`/`top` negative and the box flew off-page. Ported the per-handle anchor caps; 4
  regression tests on a realistic mocked rect. **Live evidence for E4.3** (duplicated resize math meant
  the Sign fix never reached Redact).
- **Sign whiteout resize jump** (`ca411be`) - blanket cross-handle clamp moved the un-dragged anchor
  edge; replaced with per-handle dimension caps. (Post-mortem → E1.5, E4.3, ARCHITECTURE §5.)

Verified done this session (were open in the old `TODO.md`, confirmed against code):
- **Header wordmark** - `AppBar.astro` renders the `PDkef` wordmark + logo; live in the header.
- **Desktop fullscreen button label** - `FullscreenButton.jsx` renders a "Full screen" / "Exit full
  screen" text label, used by both the Sign and Redact toolbars.
- **Founder story card real estate** - `index.astro`'s `whypdkef` card has distinct layout/styling
  (tag, signature, proof panel), reading as a signed note.

Earlier (pre-session) completed work:
- Add regression test for textarea cols constraint
- Fix vertical text wrapping regression
- Refine Text Element UX & Bounds
- Fix fullscreen button behavior on iOS
- Improve Redact PDF UI spacing and layout
- Fix text element minimum size and alignment
- Fix font list dropdown positioning
- Fix text element resizing sensitivity (proportional drag-vector projection replacing 1:1 pixel-to-point delta)
- Write JS tests for text element padding
- Fix text element bug 1: excess side growth (`min-width: 0` on `.sign-text-input`)
- Fix text element bug 2: Hebrew RTL right-side clipping (`padding: 0 4px`)
- Fix signature padding bug (fixed `padding: 4px` distorting percentage aspect ratio)
- Verify Whiteout bounds after padding removal
- Fix text element padding/wrapping (multiline) regression
