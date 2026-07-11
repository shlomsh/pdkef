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

- **E1.8 Keep Redact’s Start-over confirmation visible in real full screen - done.** A plain
  `<dialog open>` remains in the normal stacking context, so it rendered behind a real Fullscreen API
  workspace. Redact now follows Sign’s `showModal()` top-layer lifecycle, including Escape precedence:
  the first Escape closes the dialog without exiting full screen.
  - *Landed:* `e2e/redact/redact-editor.spec.js` enters real full screen, opens Start over, verifies the
    confirmation is visible, and verifies Escape closes it while retaining full screen. Production-preview
    e2e passes.

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
- **E2.2 Colocate non-editor CSS into CSS Modules - done,** component by component. **Full execution plan:
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

- **E2.2a Integrate the E2.2 branch with `main` (share-feature divergence).** The E2.2 work lives on
  `claude/e2.2-css-modules-wave-a` (forked at `f917c9e`; E2.2.1–.9 + E2.2.10 sub-commit 1 landed there).
  `main` has since advanced ~13 commits, including a **native-sharing feature** (`PdfShareButton.jsx`,
  `src/lib/usePdfShare.js`, `src/test/mockFileShare.js`) wired into **every** `Pdf*Tool.jsx`, plus the
  Lane D E3.2 Tailwind marketing migration. The two must be reconciled before E2.2 can land.
  - *Depends on:* E2.2 (branch), E3.2 (landed on `main`) · *Lane:* C
  - **Complexity: moderate. Risk: moderate. → Assign a mid-level engineer** comfortable with git
    conflict resolution and the CSP/hydration gate; **not** a junior (17-file conflict pass + the
    build-only CSP hazard bite silently), but no architectural judgment required — the lane split was
    designed disjoint and mostly held.
  - **Verified conflict surface** (`git merge-tree`, main untouched): **17 files** — every `Pdf*Tool.jsx`
    and its `.test.jsx`. **`global.css` and `scrum.md` auto-merge cleanly** (Lane C gutted tool-chrome
    CSS, Lane D trimmed marketing CSS — disjoint regions; confirmed main's `.pdf-share-button` + 8
    `.sig-btn*` rules survive the auto-merge). Conflicts are mechanical-but-semantic: both sides edit the
    import block and the same button rows in render — resolution is **keep both** (share wiring +
    className swaps), never pick-a-side.
  - **Do NOT `git rebase main` the 12 commits individually** — each className-swap commit re-collides
    with the share wiring against a moving module scheme, so you resolve the same conflict ~12×. Prefer
    **`git merge main` into the branch (one resolution pass)**, or squash the branch to one commit first.
  - **Sub-task E2.2a.1 — align new share code to the module scheme (do not skip).** The merged
    `<PdfShareButton>` renders `class="sig-btn sig-btn-secondary pdf-share-button"`. Move
    `.pdf-share-button` (generic multi-tool state) into the shared `PdfTool.module.css`; **leave
    `.sig-btn`/`.sig-btn-secondary` in `global.css`** — they are E2.3-owned (`.sig-*`/`.sign-*`) and
    pulling them into a module collides with the sibling lane. Apply the branch's className treatment to
    every share button and any button `main` re-rendered, so each file is internally consistent.
  - *Acceptance:* `npm test` + `npm run test:css` green (main's share tests **and** the branch's
    `styles[...]` assertions both retained); **`npm run build && npm run preview` CSP/hydration pass is
    mandatory** — this touches every island's imports/render and dev cannot catch a CSP regression; land
    via a reviewed merge to `main`, not a direct push.

- **E2.2b Re-implement the E2.2 class-swaps on top of `main` (SUPERSEDES E2.2a's merge approach).**
  A trial `git merge main` into the branch was run in a throwaway worktree and **rejected**: `main`
  restructured `PdfRedactTool.jsx` (RedactToolbar extraction + continue-after-export/share) so heavily
  that a "keep both" merge produced a **Frankenstein Redact file** — the branch's old inline success
  block merged *alongside* main's new structure, leaving duplicated/orphaned download+start-over UI. The
  branch's per-`.jsx` class-swaps are the "lost work" to redo; the CSS itself is fine. **Do E2.2b instead
  of E2.2a**; ignore E2.2a's "merge/rebase the branch" mechanics (keep only its E2.2a.1 alignment rule).
  - *Depends on:* E2.2 (branch `claude/e2.2-css-modules-wave-a`, head `9655073`, concluded) · *Lane:* C
  - **Complexity: moderate. Risk: moderate. → Mid-level engineer.** ~90% is mechanical string-swapping
    with a scripted resolver; the judgment sits in the Redact re-do and the FileDropzone prop reconcile.
    Not junior (the Redact restructure + the build-only CSP gate bite silently); no architecture needed.
  - **Base = `main`. Reuse the branch's durable artifacts verbatim (no conflicts):**
    - The **9 new `.module.css` files** are additive — `git checkout <branch> -- <the *.module.css files>`
      (Dropzone, FileList, PageGrid, PdfTool, PdfCompressTool, PdfSecurityTool, PdfSplitTool,
      PdfToImageTool, UndoHistoryModal). Confirmed clean.
    - **`global.css`:** apply the branch's tool-chrome deletions onto main's already-marketing-trimmed
      file: `git diff f917c9e..<branch> -- src/styles/global.css | git apply --3way`. **Verified applies
      cleanly** (disjoint regions); result ~1839 lines and still contains `.pdf-share-button` + the 8
      `.sig-btn*` rules. Do **not** take the branch's whole `global.css` (it would re-add the marketing CSS
      main deleted).
  - **Re-do the class-swaps on main's `.jsx` (the actual work):**
    - **7 standard tools** (Merge, Compress, EditPages, ImageToPdf, Split, ToImage, Security): main's file
      == branch's file + the share feature, so invert the conflict — `git checkout <branch> -- <file>`
      then `git diff f917c9e..main -- <file> | git apply --3way`. That leaves **exactly 2 conflict hunks
      per file**: (1) imports → union all four lines; (2) the render row → keep main's `<PdfShareButton>`
      **before** the branch's `class={pdfToolStyles['start-over']}` button. A ~15-line perl resolver keyed
      on "block contains `^import`? union : drop theirs' `class="start-over"` dup, emit PdfShareButton then
      ours" clears all 14 hunks (validated in the trial worktree).
    - **`FileDropzone.jsx`:** reconcile the branch's `class={styles.dropzone …}` (module) against main's
      `class={\`dropzone ${className}…\`}` — check whether any caller still passes a `className` prop and
      preserve that seam if so.
    - **`SignTool/PdfWorkspace.jsx`:** take **main's** Download+Share structure
      (`<div className="sign-export-actions">` with Download + conditional Share), and swap only its two
      `merge-button` strings to `pdfToolStyles['merge-button']`; leave `sign-export-*` as global strings
      (E2.3-owned).
    - **`PdfRedactTool.jsx` — take MAIN wholesale, re-apply swaps on its structure.** Do **not** reuse the
      branch's Redact render. Main's version keeps ~5 shared-class strings inline (`clear-all`,
      `download-button`/`start-over`/`error-message`/`merge-button`+`progress-ring*` depending on final
      layout) — swap those to `styles[...]`/`pdfToolStyles[...]` and add the module import. Verify against
      the running editor after (continue-after-export, share, and the redact download path all render).
    - **Tests:** union main's share-flow assertions (via `src/test/mockFileShare.js`) with the branch's
      `styles[...]` class-lookup assertions; re-derive Redact's test expectations from main's structure.
  - **E2.2a.1 still applies:** move `.pdf-share-button` into `PdfTool.module.css` and reference it from
    `PdfShareButton.jsx`; keep `.sig-btn`/`.sig-btn-secondary` as global strings.
  - **Note:** the E2.2.10 sub-commit 2 & 3 tickets below are **already implemented on the branch** — they
    arrive for free via the `.module.css` + `global.css` reuse above; do not treat them as pending code.
    The branch's follow-up notes (**E2.4** leftovers and the **worktree
    `node_modules`/CSS-Modules-resolution** gotcha in CLAUDE.md) must be carried onto `main` as
    part of this ticket's doc reconciliation, since the branch merge that would have brought them is dropped.
  - *Acceptance:* fresh `npm install` **inside the worktree** (a stray/absent `node_modules` makes CSS
    Modules resolve to `{}` silently under Vitest); `npm test` + `npm run test:css` green; **mandatory
    `npm run build && npm run preview` CSP/hydration pass** (rewrites every island's imports/render, dev
    cannot catch it); land via reviewed merge to `main`, not a direct push.
  - **Status: done.** Landed on `main` in `a825e33`, retaining the share wiring and the module-class
    assertions. The durable CSS modules and scoped class swaps now form the E2.2 baseline; do not reopen
    the discarded branch-merge approach.
- **E2.2.10 sub-commit 2 — `.merge-button*`/`.progress-ring*`/`.merge-button-progress` → `PdfTool.module.css` - done.**
  Landed as part of the E2.2b reimplementation. Shared by ~9 tools (reclassified from the old
  `PdfMergeTool`-only E2.2.4).
  - *Depends on:* E2.2b · *Lane:* C
  - **Complexity: low. Risk: low. → Junior-friendly**, once E2.2a has landed. Pure selector-move + class
    swap over a known consumer set; the only trap is the E2.2.7 orphaned-`@keyframes` gotcha — audit every
    `.module.css` + `global.css` for an `animation:` with no matching same-scope `@keyframes`, and verify
    against the actual `dist/` build. Standard E2.2 guardrail gates apply.
- **E2.2.10 sub-commit 3 — cross-boundary generics: `.page-numbers-toggle` + `.thumb-placeholder`/`@keyframes shimmer` → `PdfTool.module.css` - done.**
  Landed as part of the E2.2b reimplementation. `.page-numbers-toggle` is a generic pill-toggle used by `PdfEditPagesTool.jsx` +
  `PdfMergeTool.jsx` for unrelated features; `.thumb-placeholder` + `shimmer` straddle
  `FileList.module.css` and `PageGrid.module.css` consumers with no combinator tying it to either.
  - *Depends on:* E2.2.10 sub-commit 2 · *Lane:* C
  - **Complexity: low–moderate. Risk: low. → Mid-level (or a careful junior with review).** Low mechanics,
    but requires a **judgment call on ownership** (which shared module truly owns each generic) — that
    boundary decision, plus the same keyframe-orphaning audit, is why it's not purely junior. Closing this
    sub-commit **completes E2.2** — flip E2.2 to *done* and drop the "in progress" note.
- **E2.3 Migrate editor `.sign-*` / `.sig-*` styles into scoped CSS Modules - done.** This is a migration of a
  **shared Sign + Redact styling graph**, not a selector-block copy. CSS Module hashing also changes
  selectors used by imperative editor code (`closest` / `querySelector`), component tests, and e2e tests.
  Preserve descendant cascades such as selected-element toolbar visibility as real module CSS; do not
  replace them with conditional utility strings. Runtime geometry and gesture-time CSSOM writes stay as
  they are. No behavior, layout, gesture math, or copy change belongs in this ticket.
  - *Depends on:* E2.1, E1.4, E2.2 (done) · *Lane:* C
  - *Execution order:* E2.3.0 first; then E2.3.1 and E2.3.2 may run in parallel; E2.3.3 follows E2.3.2;
    E2.3.4 follows E2.3.1 + E2.3.3; E2.3.5 closes the epic.
  - *Global acceptance:* `npm test`, `npm run test:css`, and `npm run test:e2e` green; mandatory
    `npm run build && npm run preview` CSP/hydration pass; Sign and Redact manually exercised at desktop,
    <=919px, <=560px, coarse-pointer emulation, and real full screen. Verify selected outline, toolbar
    visibility/stable top placement, LTR/RTL alignment, all element types and resize handles, whiteout,
    blackout/blur controls, dialogs, dropdowns, export/share, processing lock, and Start-over confirmation.
    `global.css` has zero live `.sign-*` / `.sig-*` selectors after the final sweep, with no orphaned
    media rule/keyframe and no new literal `style=` in emitted HTML.

  - **E2.3.0 - Freeze the selector/ownership contract and add a non-vacuous migration guard.** Before
    moving CSS, inventory every `.sign-*` / `.sig-*` definition and consumer across source, imperative DOM
    lookups, unit tests, and e2e. Record the mapping in `docs/E2.3-editor-css-modules-plan.md`, using these
    fixed ownership boundaries unless the inventory proves one impossible:
    `SignTool/Workspace.module.css` (workspace/pages/fullscreen/processing/export),
    `SignTool/SignToolbar.module.css` (sticky toolbars, responsive toolbar rules, toolbar dropdown shell),
    `SignTool/EditorElement.module.css` (element root/state, floating actions, text/signature nodes,
    resizers/line handles, shared Redact shape hooks), `EditorControls.module.css` (element toolbar,
    color/font/thickness popovers), and `SignatureDialog.module.css` (`.sig-*` dialog/draw/type/upload/reset
    UI, including the Sign and Redact confirmation dialogs). Explicitly classify every cross-module
    descendant selector and assign it wholly to one module; do not split either side of a cascade across
    modules. Add a source guard that fails when a new editor selector is added to `global.css`; make the
    guard allow the inventoried selectors only until E2.3.5 removes the temporary allowlist.
    - *Depends on:* E2.1, E1.4, E2.2 · *Lane:* C0 (gates all E2.3 implementation)
    - **Complexity: moderate. Risk: high. -> Senior engineer.** Little code, but this establishes the
      shared-module API and prevents parallel tickets from creating circular ownership or breaking Redact.
  - *Acceptance:* the plan lists selector, declaration/media/keyframe location, all JSX consumers,
      all string-based DOM/test/e2e consumers, destination module, and responsible sub-ticket; duplicate
      `.sign-element-actions` / button rule blocks are identified for one-copy migration; zero selectors
      remain unowned. The guard is proven non-vacuous by a temporary forbidden selector, then restored.
    - *Landed:* `6ce908b` adds `docs/E2.3-editor-css-modules-plan.md` (78-class ownership inventory),
      `scripts/check-editor-global-css.js` (exact temporary inventory gate), and wires it before the CSS
      budget check in `npm run test:css`. The guard is a contract, not a bypass: any added, removed, or
      unassigned `sign-*` / `sig-*` global class fails until the ownership plan is deliberately updated.

  - **E2.3.1 - Migrate workspace root, toolbar, and export chrome for both tools.** Create
    `Workspace.module.css` and `SignToolbar.module.css`; update `SignTool/PdfWorkspace.jsx`,
    `SignTool/SignToolbar.jsx`, `RedactToolbar.jsx`, `PdfRedactTool.jsx`, and `FullscreenButton.jsx` to use
    their exported classes. Move whole responsive rules with their base selectors, including <=919px,
    phone/landscape-coarse-pointer, sticky Safari `align-self`, full-screen/pseudo-fullscreen, processing
    lock, share/download/reset states, and export rows. **Do not move the page-wrapper/canvas/overlay
    selectors in this ticket:** E2.3.2 owns them with the imperative `closest`/`querySelector` consumers,
    so CSS Module hashing cannot leave a temporary raw-class alias. Re-home the two non-editor sort rows in
    `PdfMergeTool.jsx` and `PdfImageToPdfTool.jsx` that still misuse `sign-toolbar`/`sign-tool-btn` into a
    generic scoped module before removing the editor toolbar selectors. Keep generic `PdfTool.module.css` button
    classes imported separately; express the export-row cross-class rule by applying a local flex-item
    class to the button, not by reaching into another module's generated name. Replace module-affected
    runtime `closest/querySelector` strings with the imported exported class; do not add `:global` escape
    hatches or permanent legacy aliases.
    - *Depends on:* E2.3.0 · *Lane:* C1 (parallel with E2.3.2)
    - **Complexity: moderate. Risk: moderate-high. -> Strong mid-level, senior review.** Responsive and
      full-screen behavior spans Sign and Redact; CSP/hydration failure is build-only.
    - *Acceptance:* both toolbars preserve desktop labels, compact icon-only layout, tap-target sizing,
      dropdown overflow, sticky behavior, share/download substitution, and equal page/dropzone alignment;
      processing state remains mounted and non-interactive; real full-screen Start-over behavior still
      passes E1.8. Update tests to import module exports or use role/data semantics where behavior is under
    test, rather than asserting old global strings. *(Sequencing correction found while starting this ticket:
    page substrate migration moved to E2.3.2; generic sort-row cleanup is in scope here.)*

  - **E2.3.2 - Migrate the page substrate, element surface, and gesture-adjacent selectors.** Create
    `EditorElement.module.css` and update `DraggableWrapper.jsx`, `ElementResizers.jsx`, all
    `SignTool/nodes/*`, and their unit/interaction/gesture tests. Keep the complete state graph in this one
    module: base/active/hover/line/symbol/shape modifiers, the selected-element -> floating-actions cascade,
    text display/input/measure parity, signature image, every edge/corner/line handle, pseudo-element drag
    halos, and coarse-pointer hit targets, plus `sign-pages-container`, `sign-page-wrapper`,
    `sign-page-canvas`, and `sign-page-overlay` in `Workspace.module.css`. Import the same module wherever a generated class is required by
    `closest/querySelector`; never select by substring of a generated classname. Do not touch pointer event
    algorithms, geometry constants, Floating UI placement/middleware, or per-frame DOM mutation.
    - *Depends on:* E2.3.0 · *Lane:* C2 (parallel with E2.3.1)
    - **Complexity: high. Risk: high. -> Senior frontend engineer.** This is mechanically a style move but
      sits directly beside the 60fps gesture path and the historically fragile visibility/RTL/resize rules.
    - *Acceptance:* E1.4/E1.5 tests are adapted without weakening assertions; realistic page rects remain;
      `onChange` still occurs once per gesture; every element type moves/resizes with unchanged anchors and
      zero-delta behavior; selected toolbar appears only for the active element, stays above it, and follows
      live drag; text measurement padding remains synchronized with `TEXT_BOX_PADDING_EM` in `src/lib/sign.js`.

  - **E2.3.3 - Migrate reusable element controls and popovers.** Create `EditorControls.module.css` and
    update `ElementToolbar.jsx`, `ColorPicker.jsx`, `ColorPickerMenu.jsx`, `FontPickerMenu.jsx`, and
    `ThicknessPickerMenu.jsx`. Move the toolbar buttons/dividers, active/danger states, color controls,
    font menu, shared popover/list/menu primitives, thickness selection, and hover-capability delete-button
    rule as complete selector families. Portal-rendered popovers import the module directly; do not depend
    on an ancestor module selector. Preserve dynamic swatch/font/position values as the existing per-property
    CSSOM/ref pattern where required by CSP; do not convert them to literal SSR style attributes.
    - *Depends on:* E2.3.2 · *Lane:* C3
    - **Complexity: moderate. Risk: moderate. -> Mid-level engineer.** Portals and shared active-state
      selectors are the main traps; gesture math is out of scope.
    - *Acceptance:* font/color/thickness menus anchor and scroll correctly, current values remain visibly
      selected, delete controls obey hover-capable behavior, keyboard/focus interactions are unchanged, and
      the CSP violation listener remains clean in production-preview e2e.

  - **E2.3.4 - Migrate signature and confirmation dialogs, then close the Redact sharing seam.** Create
    `SignatureDialog.module.css`; update `SignatureDialog.jsx`, `PdfSignTool.jsx`, and `PdfRedactTool.jsx`
    so the signature authoring dialog and both Start-over confirmations share the same exported dialog/button
    primitives. Move draw/type/upload styles, semantic danger/success buttons, narrow/body modifiers, and
    `sigSlideUp` only if it has a live animation consumer; otherwise delete the orphan. Wire `RedactBox.jsx`
    to `EditorElement.module.css` for the shared shape handles/floating action toolbar while keeping all
    `.redact-*` ownership in Redact's existing module/global migration scope; replace its string-based
    editor-class guards with imported generated classes or semantic refs/data attributes.
    - *Depends on:* E2.3.1, E2.3.3 · *Lane:* C4
    - **Complexity: moderate-high. Risk: high. -> Senior engineer.** Native dialog top-layer/full-screen
      behavior and the deliberate Sign/Redact shared-class seam make regressions easy to hide.
    - *Acceptance:* draw/type/upload/clear/save flows work; both confirmation dialogs preserve Escape and
      full-screen precedence; Redact blackout/blur/whiteout expose the correct controls and remain page-bound;
      no `.sig-*` or shared `.sign-*` global alias is retained to make one consumer pass.

  - **E2.3.5 - Remove the global editor CSS and run the final parity gate.** Delete the migrated editor
    blocks, duplicates, comments, temporary allowlist, and dead keyframes from `global.css`; update tests that
    read `global.css` as their source of truth to read the owning module. Run a bidirectional ground-truth
    sweep: every module export used, every editor class consumer styled, every `animation-name` paired with a
    same-scope keyframe, and no `.sign-*` / `.sig-*` definition or hard-coded selector lookup left outside the
    documented modules (test-only semantic fixtures must be documented if any remain). Update E2.3 and the
    Lane C diagram to done only after all automated and manual global acceptance checks pass.
    - *Depends on:* E2.3.4 · *Lane:* C5 (integration/closure)
    - **Complexity: moderate. Risk: high. -> Senior integrator.** Mostly deletion and verification, but it
      is the point where a missed selector becomes invisible and the global fallback disappears.
    - *Acceptance:* global acceptance above is evidenced in the ticket/PR; compare production-preview Sign
      and Redact at the required breakpoints and full-screen state; CSS budget decreases or is explicitly
      explained; no unrelated visual or behavior cleanup is bundled into the closure commit.
- **E2.4 Clean up two small leftovers surfaced by E2.2 - done.** (low priority, no urgency - not part of any
  tool's rendering path in a way that blocks anything else):
  - **`.info-icon`/`.tooltip-bubble`/`.tooltip-row`** (currently still in `global.css`, right after
    `.clear-all`) - single-consumer (`PdfToImageTool.jsx`'s quality-preset tooltip), deliberately left
    out of E2.2.10 since it's not a shared class. Move into `PdfToImageTool.module.css` alongside its
    existing `.toolbar`/`.toolbar-label` (E2.2.8).
  - **`.list-hint`** (currently still in `global.css`, right before where `.thumb-placeholder` used to
    live) - dead CSS, confirmed zero consumers across `src/` during E2.2.7/E2.2.9/E2.2.10's ground-truth
    sweeps. Safe to delete outright rather than migrate.
  - *Depends on:* E2.2 (done) · *Lane:* C
  - *Landed:* `a48180f` moved the quality-preset tooltip chrome into `PdfToImageTool.module.css`; the
    dead `.list-hint` selector was removed after its zero-consumer check.

- **E2.5 Restore desktop width parity for every `BasePdfTool` card - done.** **Bug, found in visual QA
  2026-07-11.** On `http://localhost:4321/merge` at a 1280 × 720 viewport, the post-E2.2 Merge card is
  only about 396px wide and its dropzone about 380px wide, leaving the rest of the 1032px app area blank.
  `https://pdkef.com/merge` renders the corresponding card/dropzone at 1032px/998px. The cause is
  verified in source: the old global desktop rule (`@media (min-width: 768px) { .merge-tool { width: 100%;
  flex-shrink: 0; } }`) no longer matches the CSS-Module class emitted by `BasePdfTool.jsx`, and
  `PdfTool.module.css` did not carry that rule across. This affects every tool composed with
  `BasePdfTool`, not just Merge.
  - *Depends on:* E2.2 (done) · *Lane:* C · *Priority:* P1 visual regression blocker
  - *Acceptance:* at desktop widths, every `BasePdfTool` card fills the app content width and has no
    empty right-hand region; add a browser-level computed-geometry assertion comparing card/dropzone
    width to its container so a selector-scoping change cannot silently regress it. Verify the affected
    tool routes in a production build/preview, then compare against the deployed Merge baseline.
  - *Landed:* restored the `min-width: 768px` `width: 100%` / `flex-shrink: 0` contract in
    `PdfTool.module.css`. `e2e/merge/merge-layout.spec.js` now asserts the card fills `#app` and the
    dropzone remains correctly inset in a production preview.

- **E2.6 Give native Share buttons a deliberate icon-label gap - done.** **Bug, found in visual QA
  2026-07-11.** In the Merge success state on `https://pdkef.com/merge`, the share icon touches the
  “Share PDF” label (`◌Share PDF`) rather than reading as a separate icon and label. The supplied
  screenshot records the issue. `PdfShareButton.jsx` renders the SVG immediately before the text while
  the reused `.sig-btn` styling has neither a flex icon layout nor a `gap`, so the omission is
  deterministic across every native-share surface.
  - *Depends on:* E2.2 (done) · *Lane:* C · *Priority:* P2 visual regression
  - *Acceptance:* native-share controls align icon and label on one row with a tokenized, visible gap;
    check Merge, Split, Compress, Image to PDF, PDF to Image, Security, Sign, and Redact where sharing is
    available. Add a focused component/browser assertion for the icon-label layout contract without
    altering sharing behavior.
  - *Landed:* `PdfTool.module.css` gives `.pdf-share-button` an `inline-flex` row, centered items, and
    `var(--space-2)` gap. The Merge production-preview guard exports two PDFs and asserts the resulting
    Share control's computed layout without changing native-share behavior.

## E3 - Tailwind on the static surface  ·  *Lane D, parallel with E2*

- **E3.1 Clean Tailwind install (audit).** - **done.** Validated in a
  worktree: `tailwindcss` + `@tailwindcss/vite@^4.3.2` install **clean** against the Astro `^7.0.3` pin -
  no `legacy-peer-deps`, 0 new `npm audit` vulns, vite peer satisfied. Recipe: add the `@tailwindcss/vite`
  plugin to `astro.config` `vite.plugins`; CSS-first import of the **theme + utilities layers only**
  (skip Preflight - it resets margins site-wide and blew the CSS budget). Landed on `main` as part of
  E3.2 with a project-scoped theme and utilities-only import.
  - *Depends on:* - · *Lane:* D
- **E3.2 Migrate the marketing `.astro` surface to utilities - done.** (`index.astro`, tool pages,
  `FeatureCard`, `ToolHero`, `AppBar`, `Footer`). No editor components.
  - *Depends on:* E3.1, E1.1, E1.2 · *Lane:* D
  - *Progress:* E3.1 scaffold, `FeatureCard`, `Footer`, `ToolHero`, `AppBar`, tool-page content cards,
    and the home first-fold/tool-grid structure and tile interactions, Why/Autosave/offline/open-source
    sections plus `licenses` and `404` now use utilities. The generated maximum is `80,871 / 82,000` bytes.
    The home grid tooltip and its delayed reveal/arrow are the approved scoped exception. The CSS-first
    setup imports utilities only, excludes JSX and test sources from scanning because the editor has no
    Tailwind surface, and defines the project spacing/font tokens, avoiding Tailwind's unused default palette
    and Preflight.

- **E3.3 Align the shared tool hero with the app-bar breadcrumb grid - done.** **Bug, found in visual QA
  2026-07-11.** `ToolHero.astro` centered its title row independently, so at a 1280px desktop viewport
  the breadcrumb grid began at x=100 but title rows began from x=282 to x=404 depending on the title
  length. The problem was shared by every tool route, not tool-specific.
  - *Landed:* the hero now occupies the same 1080px, 24px-inset desktop grid as `AppBar.astro`; its leading
    icon aligns with the PDkef breadcrumb pill, while the subhead and chips begin beneath the title text.
    `e2e/tool-layout.spec.js` visits Merge, Split, Compress, PDF to Image, Image to PDF, Unlock, Sign,
    Redact, and Edit PDF in a production preview and asserts grid and leading-row alignment on each.

## E4 - Headless TS editor core  ·  *Lane E, internally serial, parallel to E2/E3*

> **Full low-level design for this epic (E4.2–E4.4):
> [docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md)** — grounded in the
> current gesture/registry/substrate code (target `src/editor/` layout, per-type behavior inventory, the
> Sign/Redact model reconciliation, and the golden-rule fix). Read it before starting E4.2. Key finding
> it surfaces: the golden rule is violated today by Sign's *creation* path **and all three** Redact
> gesture paths (not just "resize was inline"), so the unified controller must cover create as well.

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
  **Follow-up resolved:** the two pre-existing `src/pages/index.astro` errors found by the first
  project-wide `astro check` are fixed. The redirecting `<FileDropzone>` declares its intentionally unused
  callback seam, and the OS-install tab script guards its optional `aria-controls` value before lookup.
  `npm run typecheck` is now project-wide error-free (hints only).
  - *Depends on:* - · *Lane:* E
- **E4.2 Extract a framework-agnostic `editor/` core - done.** Added the plain-TS
  `src/editor/gestures/controller.ts` lifecycle: it computes and paints a patch per movement, then
  commits the final patch exactly once on release. `pointer.ts` supplies the framework-neutral
  mouse/touch coordinate reader. Sign drag, resize, and drag-drawn creation all route their listener
  lifecycle through the controller; creation now paints with CSSOM/SVG during the gesture and dispatches
  a single `UPDATE_ELEMENT` only on release. The controller and workspace tests explicitly cover the
  once-only commit rule. E4.3 will move the remaining per-type resize geometry into the registry.
  - *Depends on:* E4.1, E0.1 · *Lane:* E
  - *Verification:* 294 non-PDF-worker unit tests, the focused Sign editor suite (77 tests), TypeScript,
    production build/CSP hash check, and the Sign Playwright guardrail all pass. The worktree's three
    PDF raster integration tests remain blocked by its absent local `pdfjs-dist` worker copy, unrelated
    to this change.
- **E4.3a Per-element-type** ***resize*** **registry** - each type owns its own resize behavior in a registry
  module (`src/editor/registry/<type>.ts`): the handle set plus per-handle, anchor-preserving geometry.
  Removes the `type === 'text'` / `symbol||signature` / `line-start`/`line-end` / box branching from
  `DraggableWrapper.jsx handleResizeMove`. Box types (rectangle/ellipse/whiteout) share `boxResize.ts`;
  text (fontSize diagonal scaling), symbol/signature (center-anchored aspect-lock + symbol px floor),
  and line (endpoint move) get their own module behavior. **Low-level design + per-type inventory:
  [plan §1c, §4](./docs/E4-headless-editor-core-plan.md).**
  - *Depends on:* E4.2 · *Lane:* E
  - *Acceptance (sharpened by the whiteout-resize post-mortem):* **no shared function post-processes
    geometry across element families** - each type's resize behavior owns its own per-handle bounds
    against that handle's true anchor edge (a shared `boxResize` among box-geometry types is fine; a
    blanket cross-type clamp is the banned `434e844` failure mode). Every type is covered by the E1.5
    invariants. **Controller purity:** `computePatch` returns a pure patch and performs **no** DOM
    writes; `writeDOM(patch)` owns all CSSOM/SVG painting; `commit` fires once per gesture
    (`console.count` proof). **Duplication proof:** `git grep -l
    "maxWidthFromRightGrowth\|maxHeightFromBottomGrowth" -- 'src/**'` must not list
    `DraggableWrapper.jsx` (Redact's copy is retired in E4.4). **Mobile:** touch scroll is prevented
    during gesture (verified in `e2e/sign/`, not jsdom).
- **E4.3b Per-element-type** ***create/render/serialize*** **registry** - **done.** Each registry module now has
  `create` (the point-place + drag-draw seeds now in `useWorkspaceGestures.js`, retiring the
  `DRAG_DRAWN_TOOLS` list), `render` (wrapping today's `SignTool/nodes/*.jsx`), `serialize` (the
  `sign.js` bake per type), and `schema`. Completes the `{ create, render, resizeBehavior, serialize,
  schema }` module shape from ARCHITECTURE §3.
  - *Depends on:* E4.3a · *Lane:* E
  - *Acceptance:* no `type`-branching remains for creation/render/bake in the Sign components; adding a
    hypothetical new type touches only new files.
- **E4.4 Converge Sign and Redact** onto the shared core + a common PDF-workspace substrate - **done.**
  Redact now uses the controller for draw, drag, and resize with a one-commit-per-gesture
  integration test; its `blackout` / `blur` / `whiteout` model is type-discriminated and
  registry-owned for resize, rendering surface, and destructive page-flatten instructions.
  `redact.js` is now PDF-wide raster orchestration only, while per-type behavior lives in
  the registry. Sign and Redact share `workspace/loadPdf.ts`, `PdfPageCanvas`, and
  `useEditorDraftPersistence.js`, preserving the race guard, first-wins restore rule,
  timeout, tool-keyed on-device drafts, native share flow, and each tool's own store/UI.
  **Low-level design: [plan §1d, §1e, §5](./docs/E4-headless-editor-core-plan.md).**
  - *Depends on:* E4.2, E4.3b · *Lane:* E
  - *Verification:* Redact drag/resize/create each commit **once per gesture** under controller
    integration coverage; the shape-resize math has **exactly one owner** — `git grep -l
    "maxWidthFromRightGrowth\|maxHeightFromBottomGrowth" -- 'src/**'` returns **1 file** (down from 2),
    in `src/editor/`, not the tools (wire as a one-line CI guard, ARCHITECTURE §6); `blackout`/`blur`/
    `whiteout` are registry types (the `style` field + `type:'whiteout'` shim are gone); redaction stays
    destructively flattened (not a cosmetic overlay); Sign+Redact e2e + `build && preview` CSP pass;
    draft autosave/restore + `draftRestoreRace.test.jsx` still green.

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
- **done** - **HSTS header** in `vercel.json` (`max-age=63072000; includeSubDomains; preload`) - only once the
  final domain is confirmed HTTPS-only.
- **done** - **Register Google Search Console** + submit sitemap once the domain is final; monitor Core Web
  Vitals (prioritize INP for signature drawing).
- **skipped** - **IndexNow** (low priority) - `public/<key>.txt` + deploy ping for faster Bing/Yandex indexing.
- **Homepage hub link check** - recurring guard: confirm no tool card points at a `noindex` route.
- **User feedback / suggestion channel** - prefer a GitHub Issues/Discussions link (zero new network
  surface, respects CSP `connect-src 'self'`); an in-app form would require documented CSP loosening
  for text only, never file bytes - weigh against the privacy positioning first.
- **Long-tail landing pages** - `/sign-pdf-no-signup`, `/offline-pdf-form-filler`, `/open-source-pdf-editor`.
- **OS-specific how-to guides** internally linking into the tools (no outbound promo links).
- **done** - **Public GitHub repo + iframe embed model** for contextual backlinks.

**Bugs / hardening surfaced by E2.2 CSS-scoping ground-truth sweeps:**
- **`.field-hint` was unstyled - resolved 2026-07-11.** The only remaining consumer was
  `PdfSplitTool.jsx` (the old `PdfToImageTool.jsx` reference was stale). Its helper copy is intentional,
  so it now uses the scoped `PdfTool.module.css` rule and the page-selector field uses a two-column grid
  that places the muted hint beneath its input. `PdfSplitTool.test.jsx`, production build, and CSP
  verification pass.

**Bugs / hardening surfaced by E4.1 typecheck:**
- **`index.astro` typecheck errors - fixed.** The redirecting homepage `FileDropzone` now declares its
  intentionally unused `onFiles={null}` callback seam, and the OS-install tab script guards its optional
  `aria-controls` value before calling `getElementById`. `npm run typecheck` is now project-wide error-free
  (32 pre-existing hints remain); `npm test`, CSS budget, build/CSP, and production-preview e2e pass.

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

**Deferred spikes (explicitly out of scope for the maintainability migration):**
- **Hebrew/RTL PDF text shaping** (`fix/hebrew-pdf-shaping`, head `d47ca5f`, branched from `5246161c`,
  ~59 behind `main`). A `wip` spike exploring canvas-based text rendering to fix Hebrew/RTL glyph shaping
  in the exported PDF, explicitly marked "not production-ready" and untouched since 2026-07-06. This is a
  **rendering-correctness feature**, not a maintainability refactor - it does not belong to any E0–E4 lane
  and must not block them. Keep the branch parked (no worktree). Revisit as its own feature ticket after
  the migration lands, ideally rebased onto the E4 headless core so the shaping logic has a stable seam;
  do not resurrect the stale branch in place against the current editor.

**Editor / UX polish:**
- **Unlock Start-over confirmation - fixed.** Both reset controls now open the native confirmation dialog;
  Cancel preserves the active PDF and Discard clears it. Unit coverage plus
  `e2e/unlock/unlock-reset-confirmation.spec.js` verify the production-preview flow.
- **Verify Redact mobile toolbar** on a real narrow viewport - code updated (shared `.sign-toolbar`
  CSS, structure-agnostic mobile flex rule) but never visually confirmed.
- **State-based drag halo** - replace the single-value `.sign-element::after` grab halo with a small
  resting halo + a larger halo only on `.active` (which is `z-index:50`, so it won't steal neighbor clicks).

---

## Dependency / lane summary

```
Lane A (now):   E0.1 ──► E0.2
Lane B (now):   E1.1✓ E1.2✓ E1.3✓ E1.4✓ E1.5✓ E1.6✓ E1.6a✓ E1.7✓ E1.7a✓ E1.8✓  ── gate ──► E2.*, E3.2, E4 verification
Lane C:         E2.1 ──► E2.2✓ ──► E2.3✓       (E2.3 also needs E1.4; E2.4/E2.5/E2.6 complete)
Lane D:         E3.1 ──► E3.2✓ ──► E3.3✓       (E3.2 also needs E1.1, E1.2)
Lane E:         E4.1✓ ──► E4.2✓ ──► E4.3✓ ──► E4.4✓   (E4.2 also needs E0.1)
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
