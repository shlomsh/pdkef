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
    then reverting. No type outside shape/whiteout failed an invariant. Full suite green (285); no source
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
- **E1.7 Runtime CSP style-attribute guard - done (posture decided, source fixed, e2e wired).**
  Playwright preview surfaced CSP `style-src` violations for runtime `style=""` attributes. Investigation
  corrected the original premise: editor gesture geometry (`DraggableWrapper.jsx`'s drag/resize) was
  **never** the culprit - it writes per-property CSSOM (`el.style.width = ...`, `.style.transform = ...`),
  which CSP's `style-src` does not govern (only literal `style="..."` markup, `setAttribute('style', ...)`,
  and `.style.cssText =` are checked; verified against Preact's own `setProperty` in
  `node_modules/preact/src/diff/props.js` - object `style={{}}` props go through per-key `setStyle`,
  string `style="..."` props go through `cssText`). The real violations were a finite, static set of
  SSR-serialized chrome: 22 literal `style=` attributes across `dist/**/*.html` (6 color swatches, 2
  danger/success buttons, a dialog `max-width`, dialog-body paddings, `index.astro`'s `<h1>` accent span
  and `.merge-tool` CTA wrapper, 3 tab-icon margins, and one `text-decoration`).
  - **Posture:** keep `style-src` strict (no `unsafe-inline`, no `style-src-attr`) - no
    `astro.config.mjs`/`vercel.json` change needed. Converted every finite SSR'd value to a class in
    `global.css` or the page's scoped `<style>`; the two dynamic swatch colors
    (`ColorPicker.jsx`/`ColorPickerMenu.jsx`) use a `ref` callback writing `el.style.background` (CSSOM,
    exempt) instead of an object `style={{}}` prop. `dist/**/*.html` now has 0 literal `style=` attributes.
  - **Incidental bug fixed:** `index.astro`'s inactive OS-install-guide tab panels used static
    `style="display:none"`, which CSP blocked at parse time - all three panels rendered stacked until
    first click. Now class-driven (`.offline-tab-panel` / `.offline-tab-panel.active`); confirmed fixed
    in manual QA.
  - **e2e guard landed:** both `e2e/sign/sign-editor.spec.js` and `e2e/redact/redact-editor.spec.js`
    install a `securitypolicyviolation` listener via `addInitScript` (structured, spec-defined,
    cross-engine signal - not console-text scraping) and assert zero violations in `afterEach`. Both
    e2e tests pass against the real build with zero violations. No Vercel-Analytics-404 allowlist was
    needed - that's a network error, not a CSP violation, so it never fires the event.
  - *Depends on:* E1.6 · *Lane:* B
- **E1.7a Build-time "no literal `style=` in dist" guard - done.** Extended
  `scripts/verify-csp.js` (already parses `dist/**/*.html` with JSDOM for hash verification) to also
  fail the build if any element carries a literal `style="..."` attribute, converting "someone adds
  `style={{}}` to SSR'd markup and prod silently blocks it" into a loud build failure instead of relying
  on e2e coverage of every code path. Now a path-independent guarantee for the whole site (including any
  future static page), complementing the e2e `securitypolicyviolation` guard (E1.7) which only covers the
  two editor tools' hydrated flows. Current e2e shape is intentionally lean: one Sign browser guardrail
  and one Redact browser guardrail.
  - *Landed:* after the existing style-hash loop, a `document.querySelectorAll('[style]')` pass per file
    logs `[ERROR] <file>: <tag> has a literal style="..." attribute ...: <snippet>` and sets `hasError`,
    matching the existing error format; no allowlist (dist has 0 literal `style=` post-E1.7). No wiring
    change needed - `npm run test:csp` (`node scripts/verify-csp.js`) already runs in CI after
    `npm run build`. Non-vacuity verified by injecting a `style="display:none"` div into `dist/index.html`
    (verifier exits 1 with the new message), then restoring (clean pass). Full suite green (285); only
    `scripts/verify-csp.js` touched.
  - *Depends on:* E1.7 · *Lane:* B

## E2 - Kill the global CSS monolith  ·  *Lane C, parallel with E3*

- **E2.1 Tokens as the only global CSS. - done.** Audited `src/` + `public/` for escaped color literals;
  routed the theme-chrome ones (`#fff`/`#ffffff` in `global.css`, `index.astro`, `404.astro`) through
  `var(--color-surface)`, and formalized `--color-surface-soft` as a real token (it was previously a
  `var(--x, rgba(...))` fallback that never resolved to an actual token). Left user-facing annotation/pen
  color defaults (`signGeometry.js`, `ColorPicker.jsx`, redact/sign toolbars) as literals on purpose -
  those are tool data, not site theme. A handful of shadow/near-black literals in `global.css` have no
  matching token and were left as reported gaps (see git history of this ticket's commit for the list) -
  candidates for new tokens, not folded into existing ones without human sign-off.
  - *Depends on:* - · *Lane:* C
- **E2.2 Colocate non-editor CSS into CSS Modules,** component by component. **Full execution plan:
  [docs/E2.2-css-modules-scoping-plan.md](./docs/E2.2-css-modules-scoping-plan.md)** (inventory with line
  ranges, module destinations, risks) — read it before starting.
  - *Depends on:* E2.1 · *Lane:* C
  - **Scope correction (do not skip):** the ticket's old "cards, hero, footer" wording predates the
    ARCHITECTURE §3.1 styling boundary. E2.2 owns **only the interactive island (`.jsx`) tool chrome**.
    The marketing `.astro` surface (hero/cards/footer/os-chips/tool-about/faq) is **E3.2 (Tailwind)** —
    leave it in `global.css`. The `.sign-*` editor cascades **and anything coupled to them** are **E2.3**
    — notably `.redact-box` (RedactBox.jsx reuses `.sign-element--shape`/`.sign-element-resizer`/
    `.sign-element-actions`) and the Signature Dialog `.sig-*` (uses `.sign-color-swatch`). Migrating
    either here collides with those lanes.
  - **Guardrail (every subtask):** move selectors out of `global.css` → colocated `.module.css` → swap
    `class=` strings in the consuming `.jsx` → `npm test` + `npm run test:css` green → **`npm run build &&
    npm run preview`** CSP/hydration pass (emission changes; dev cannot catch it) → hand to maintainer for
    a visual pass. `global.css` shrinks monotonically; each subtask lands independently.
  - **Wave A — single-consumer leaves (start here, lowest risk):**
    - *E2.2.1* `PdfSecurityTool` → `.unlock-*` (global.css 3379–3409) → `PdfSecurityTool.module.css`.
    - *E2.2.2* `PdfSplitTool` → `.split-*` (3033–3095) → `PdfSplitTool.module.css`.
    - *E2.2.3* `PdfCompressTool` → `.compress-*`, `.compression-stats`/`.stats-*`, `.compress-warning`,
      `.target-size-*` (2721–2861, 2939–3032) → `PdfCompressTool.module.css`. Decide `.metric-*` owner first.
    - *E2.2.4* `PdfMergeTool` → `.merge-button*`/`.progress-ring*` (1170–1254) → `PdfMergeTool.module.css`.
    - *E2.2.5* `UndoHistoryModal` → `.undo-history-*`/`.metric-*` (2863–2937) → `UndoHistoryModal.module.css`
      (`.metric-*` also used by Compress — pick one shared owner, see plan §5.8).
  - **Wave B — single self-contained widget:**
    - *E2.2.6* `FileDropzone` → `.dropzone*`/`.dz-*`/`.file-picker-button`/`.privacy-line` (669–808) →
      `FileDropzone.module.css`.
    - *E2.2.7* `FileList` → `.file-list`/`.file-item`/`.thumb*`/`.drag-handle`/`.remove-button` + keyframes
      `item-in`/`thumb-in`/`shimmer` (985–1169) → `FileList.module.css`.
  - **Wave C — cross-tool shared modules (touch several `.jsx`; land each atomically, do last):**
    - *E2.2.8* `ToolToolbar.module.css` ← generic `.toolbar`/`.toolbar-label`/`.toolbar button` (844–889),
      imported by Merge, ImageToPdf, ToImage, EditPages. Distinct from editor `.sign-toolbar`.
    - *E2.2.9* `PageGrid.module.css` ← `.pages-grid`/`.page-card*`/`.page-drag-handle`/`.rotate-btn`/
      SortableJS `.is-ghost/.is-chosen/.is-dragging`/`.grid-actions*`/`.page-numbers-toggle`/
      `.page-card.is-removed` (3096–3378), imported by Split, EditPages, Redact. **Redact's box/resizer
      chrome is excluded — that's E2.3.**
    - *E2.2.10* `PdfTool.module.css` ← shared states: `.list-header`/`.list-count`/`.clear-all` (809–843),
      `.page-selector-*` (942–984), `.error-message` (1255–1280), `.download-button`/`.download-check`/
      `.check-*`/`.start-over` + keyframes (1281–1409), `.merge-tool` wrapper (654–668, verify owner).
      Imported by every tool — do this **last**.
- **E2.3 Migrate editor `.sign-*` styles into scoped CSS Modules** (currently ~121 `sign-*` references
  in a ~3,400-line `global.css`), **preserving descendant cascades** (`.sign-element.active
  .sign-element-actions`) as real CSS inside module scope. *(Absorbs the old "colocate `.sign-*`
  styles" tech-debt note - now a first-class migration step, not opportunistic.)*
  - *Depends on:* E2.1, E1.4 · *Lane:* C
  - *Acceptance:* every conditional state (active, RTL, dark, mobile, whiteout) verified in a running editor.

## E3 - Tailwind on the static surface  ·  *Lane D, parallel with E2*

- **E3.1 Clean Tailwind install (audit).** - **done.** Validated in a
  worktree: `tailwindcss` + `@tailwindcss/vite@^4.3.2` install **clean** against the Astro `^7.0.3` pin -
  no `legacy-peer-deps`, 0 new `npm audit` vulns, vite peer satisfied. Recipe: add the `@tailwindcss/vite`
  plugin to `astro.config` `vite.plugins`; CSS-first import of the **theme + utilities layers only**
  (skip Preflight - it resets margins site-wide and blew the CSS budget). Landed on `main` as part of
  E3.2 with a project-scoped theme and utilities-only import.
  - *Depends on:* - · *Lane:* D
- **E3.2 Migrate the marketing `.astro` surface to utilities - in progress.** (`index.astro`, tool pages,
  `FeatureCard`, `ToolHero`, `AppBar`, `Footer`). No editor components.
  - *Depends on:* E3.1, E1.1, E1.2 · *Lane:* D
  - *Progress:* E3.1 scaffold, `FeatureCard`, `Footer`, `ToolHero`, `AppBar`, tool-page content cards,
    and the home Why/Autosave/offline/open-source sections plus `licenses` and `404` now use utilities.
    The generated maximum is `79,180 / 80,000` bytes. The animation-heavy home first-fold/tool grid
    remains scoped for now because its direct utility conversion exceeded the budget. The CSS-first setup
    imports utilities only and defines the project spacing/font tokens, avoiding Tailwind's unused default
    palette and Preflight.

## E4 - Headless TS editor core  ·  *Lane E, internally serial, parallel to E2/E3*

- **E4.1 Introduce TypeScript. - done.** Installed `typescript@6.0.3` + `@astrojs/check@0.9.9` (dev deps,
  0 new `npm audit` vulns); pinned TS to `^6` since npm's default `typescript@7.0.2` falls outside
  `@astrojs/check@0.9.9`'s peer range (`^5.0.0 || ^6.0.0`) - Astro itself was never a factor, still pinned
  `^7.0.3`. Landed a discriminated element-type union in `src/lib/editorModel.ts` (flat `type` field as
  the discriminant, no nested "shape" wrapper - `TextElement | RectangleElement | EllipseElement |
  LineElement | SymbolElement | SignatureElement | WhiteoutElement`, shared `ElementBase` +
  `BoxGeometry`), read from the real field shapes in `useWorkspaceGestures.js`, `PdfSignTool.jsx`,
  `nodes/*.jsx`, `sign.js`, and `DraggableWrapper.jsx` rather than invented. `src/lib/coords.js` →
  `coords.ts` via `git mv` (tracked rename, zero logic change, call sites still `import './coords.js'`
  and resolve fine). `npm run typecheck` (`astro check`) added as a script; `coords.ts` +
  `editorModel.ts` are 100% clean. `npm test` (284/284) and `npm run build` (12 pages) both green.
  **Follow-up surfaced, not fixed here (island shell is off-limits for this ticket):** running `astro
  check` project-wide for the first time surfaced 2 pre-existing errors in `src/pages/index.astro` -
  `<FileDropzone>` missing its required `onFiles` prop (line 72), and a `getElementById` result
  (`string | null`) passed where non-null is expected (line 257). Both predate this ticket and are
  unrelated to the editor core; worth a small follow-up ticket so `typecheck` is green project-wide.
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

**Bugs / hardening surfaced by E4.1 typecheck:**
- **`index.astro` typecheck errors** - running `astro check` project-wide for the first time (E4.1)
  surfaced 2 pre-existing errors, both predating and unrelated to the TS work: `<FileDropzone>` used
  without its required `onFiles` prop (line 72), and a `getElementById(panelId)` result (`string | null`)
  passed where non-null is expected (line 257). Small, isolated fixes; needed to get `npm run typecheck`
  green project-wide. `index.astro` is the SEO/privacy island shell - low risk color/type-only fix, but
  still verify with a full `build && preview` per the CSP section in CLAUDE.md since it's a script-adjacent
  change, not a pure color change.

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
- **Runtime CSP style-attribute violations** - **fixed, see E1.7.** Turned out to be a finite set of
  SSR'd static chrome, not the editor's gesture geometry (which was already CSP-exempt). Converted to
  classes/CSSOM; `dist/**/*.html` now has 0 literal `style=` attributes; e2e asserts zero
  `securitypolicyviolation` events. The build-time guard is split out as E1.7a (postponed).

**Editor / UX polish:**
- **Verify Redact mobile toolbar** on a real narrow viewport - code updated (shared `.sign-toolbar`
  CSS, structure-agnostic mobile flex rule) but never visually confirmed.
- **State-based drag halo** - replace the single-value `.sign-element::after` grab halo with a small
  resting halo + a larger halo only on `.active` (which is `z-index:50`, so it won't steal neighbor clicks).

---

## Dependency / lane summary

```
Lane A (now):   E0.1 ──► E0.2
Lane B (now):   E1.1✓ E1.2✓ E1.3✓ E1.4✓ E1.5✓ E1.6✓ E1.6a✓ E1.7✓ E1.7a✓  ── gate ──► E2.*, E3.2, E4 verification
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
