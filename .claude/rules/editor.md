---
paths:
  - "src/editor/**"
  - "src/components/SignTool/**"
  - "src/components/Pdf*Tool.tsx"
  - "src/components/Pdf*Tool.test.tsx"
  - "src/components/Pdf*Tool.module.css"
  - "src/components/*Toolbar*"
  - "src/components/Element*"
  - "src/components/Editor*"
  - "src/components/Redact*"
  - "src/components/Deletable*"
  - "src/components/DeleteMark*"
  - "src/components/ArmHint*"
  - "src/components/ViewControl*"
  - "src/components/FullscreenButton*"
  - "src/components/UndoHistoryModal*"
  - "src/components/BasePdfTool*"
  - "src/components/ToolShell*"
  - "src/components/PdfPageCanvas*"
  - "src/components/PdfShareButton*"
  - "src/components/DownloadButton*"
  - "src/components/*Picker*"
  - "src/components/Popover*"
  - "src/components/ConfirmDialog*"
  - "src/components/Dialog.module.css"
  - "src/components/*.test.tsx"
  - "src/lib/**"
  - "e2e/sign/sign-editor.spec.js"
  - "e2e/sign/toolbar-touch-targets.spec.js"
  - "e2e/sign/form-grid-fill.spec.js"
  - "e2e/redact/**"
  - "e2e/merge/**"
  - "e2e/compress/**"
  - "e2e/unlock/**"
  - "e2e/tool-*.spec.js"
  - "scripts/check-gesture-golden-rule.js"
  - "scripts/check-editor-dependency-directions.mjs"
  - "docs/E4-headless-editor-core-plan.md"
  - "docs/editor-module-boundaries-plan.md"
  - "docs/view-density-control-spec.md"
  - "docs/sign-redact-draft-validation-plan.md"
---

# Editor and tool islands (Sign, Redact, and the other tools)

Loaded when working on the Preact tool islands, the headless `src/editor/` core, or `src/lib/`. The
two rules that constrain everything here are in CLAUDE.md (no file bytes leave the device; gestures
mutate the DOM and commit state once on release). This file is the detail: the design standard the
editor migrated to, the arming/selection model, the toolbar layout rules, and the hazards that each
cost a shipped bug. Fonts and text export have their own rule (`fonts-and-text.md`); the styling
boundary has its own (`styling.md`).

## Draft persistence (flagship feature, on-device)

- `src/editor/workspace/draftStore.js` + `src/components/SignTool/useDraftPersistence.js` — **crash-safe draft persistence** for the Sign and Redact tools. `draftStore.js` is a dependency-free native IndexedDB wrapper (DB `pdf-toolkit-drafts`, store `drafts` keyed by tool name so there's one active draft per tool) that stores the full source PDF bytes **plus** the edit state (annotations / redaction boxes), with a 14-day auto-expiry and graceful no-op degradation when IndexedDB is unavailable. `useDraftPersistence.js` is the Preact hook that debounce-autosaves while `status === 'editing'`, flushes on `visibilitychange`/`pagehide`, silently restores the last draft on mount (the draft is the source of truth; download does **not** clear it), and clears when a different file is loaded over it (the shared "Replace file" action, which absorbed the old "Start over") or after the 14-day expiry. Both `PdfSignTool.jsx` and `PdfRedactTool.jsx` refactor their loaders into a shared `loadPdf()` reused by fresh picks and restore, and call `seedUniqueId()` (in `sign.js`) after restore so new element ids don't collide with restored ones. **Everything stays on-device — nothing is uploaded, preserving the core privacy constraint.** This is a flagship, differentiating feature (server-free crash recovery); it is surfaced as supporting SEO copy on the `sign`, `redact`, and home pages (intro copy + a benefit bullet + one FAQ entry per tool page, mirrored into `<SeoSchema>`'s `faq` array like every other FAQ).

## Tool-page and Merge flow invariants

- **FAQ disclosure**: The "How it works & FAQ" content resides below the app and acts as a details-summary element. The summary contains the hero text, and a click interceptor script prevents clicks on the text from toggling the panel. Only clicking the styled `.faq-toggle` link (anchor-like visual) triggers the toggle.
- **Merge & Download Flow**:
  - Once merging is complete, the "Merge PDFs" button turns grey (`.is-done` class) to step back, and focus is shifted to the "Download PDF" button (`ref` + `useEffect` on status change).
  - Any subsequent mutation of files (adding, removing, reordering, or sorting) resets the state to `'idle'` and revokes/clears the generated `downloadUrl`.

## Design standard: gesture hot path and the editor core

### 1.2 The gesture hot path stays as it is, it is already correct

Dragging and resizing PDF elements needs 60fps real-time feedback. The production pattern achieves it by
keeping the framework out of the loop during a gesture:

- **During the gesture (`pointermove`):** mutate the DOM directly
  (`elementRef.current.style.transform = ...` / `.width` / SVG `x1/y1`...). No React state per frame.
- **On release (`pointerup`):** dispatch **one** state update (`onChange`) with the final
  percentage-based coordinates, then clear the inline overrides so state resumes control.
- React state is the single source of truth **between** gestures, never **during** one.

**Do not** introduce a store (Zustand/Redux/signals) for live gesture state. Routing high-frequency
pointer events through reactive state is what caused the historical "reconciliation thrash." This is
non-negotiable and applies equally to drag **and** resize (see §4).


## 2. The core diagnosis this architecture responds to

The recurring pain, *"adding a feature breaks an unrelated part"*, is not a CSS-framework problem. It is
the signature of **missing enforced boundaries**:

1. A single ~3,400-line `global.css`: one shared cascade namespace where any change can collide.
2. God-components that branch on concrete element type (`type === 'line'` / `!isLine`): adding a type
   means editing the monolith.
3. Untyped shared state: breakage surfaces at runtime in an unrelated tool, not at edit time.
4. Invariants (CSP, SEO, the gesture rule) kept as **prose**: remembered, not enforced.

The target below makes every boundary either **scoped-by-construction** or **compiler-enforced**.

## 3. Layered target architecture

| Layer | Rule | Why |
|---|---|---|
| **Tokens** | The *only* global CSS is `:root` design tokens (colors, spacing, type). | Removes the shared-cascade namespace that is the #1 "change X breaks Y" source. |
| **Styling** | Static/marketing → **Tailwind utilities**. Interactive + editor → **CSS Modules colocated per component**. Dynamic geometry → inline styles / CSS custom properties. | Right tool per surface; scoping makes cross-component breakage structurally impossible. |
| **Editor core** | A framework-agnostic `editor/` core (plain TS, no Preact) owns the document model, geometry math, and gesture controllers. Preact is a thin render/event shell over it. | Testable without a DOM renderer; reusable across Sign **and** Redact; unifies drag+resize. |
| **Element registry** | Each element type is a module `{ create, render, resizeBehavior, serialize, schema }` in a registry, no `switch`. | Adding a type touches only new files. Direct fix for "new feature breaks old feature." |
| **Types** | TypeScript on the model, geometry, and core first; UI follows. | Compiler catches breakage at edit time instead of at runtime in an unrelated tool. |
| **Guardrails** | CSP, SEO, CSS-duplication, page-weight, and editor-state invariants are **CI checks**, not docs. | Maintainability stays fixed only when invariants are enforced. |


### 3.2 The editor core (the step-function change)

Extracting hooks moved code around but left every invariant as prose the next code path could ignore. A
framework-agnostic `editor/` core (plain TS) makes each invariant *structural*:

- **Document model** - elements as one typed union, one schema per type. Sign and Redact converge on it,
  so model divergence becomes a compile error rather than a runtime shim.
- **Geometry math** - pure functions with **one owner per element type** (the registry). Duplicated math
  becomes impossible: there is nowhere to put a second copy, and a clamp scoped to one type's module
  cannot corrupt another (the exact failure mode of the whiteout regression, §5).
- **Gesture controllers** - drag, resize, **and create** behind **one** "imperative-during,
  commit-on-release" abstraction. The golden rule stops being a convention and becomes the *only* path a
  gesture can take: every gesture commits exactly once, on release, because the single controller is
  what commits.

Preact then only renders from state and binds events to the core. Sign and Redact share the core and a
common PDF-workspace substrate (load, page render, draft persistence).

**All three are now reality:** every Sign and Redact creation/drag/resize routes through
`editor/gestures/controller.ts`; the per-handle anchor-preserving resize arithmetic has exactly one
owner in `editor/registry/boxResize.ts` (CI-enforced); and both editors key elements on the flat `type`
discriminant in `editorModel.ts`, with `blackout`, `blur` and `whiteout` each a registry module. Full
design record: [docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md).

## 4. Gesture golden rule

> During a gesture, mutate the DOM directly for real-time feedback. Commit React state **once**, on
> release. Never route continuous drag/resize/**create** through reactive state.

The rule governs **three** gesture kinds, not two: **drag** (move), **resize** (all handles), and
**create** (click-place or drag-draw a new element). All three are continuous pointer interactions; all
three must mutate the DOM live and commit once.

- ✅ `handlePointerMove` writes `element.style.transform` (drag) or `.width/.height/.left/.top` and SVG
  `x1/y1/x2/y2` (resize) directly; accumulates the final value in a local.
- ✅ `handlePointerUp` calls `onChange(final)` exactly once, then clears inline overrides.
- ❌ Calling `onChange(...)`/`dispatch(...)`/`setState(...)` inside `pointermove`. This is the
  reconciliation thrash.

Enforced statically by `scripts/check-gesture-golden-rule.js`, which scans every `computePatch` body
and fails if it calls `onChange`/`dispatch`/`setState` directly.


## Migration status and the arming model

**Status (landed, 2026-07):** this direction is now complete. The static/SEO surface is on Tailwind utilities (E3); the editor `.sign-*`/`.sig-*` styles are colocated in CSS Modules with **0 editor selectors left in `global.css`** (E2.3, enforced by `scripts/check-editor-global-css.js`); and the framework-agnostic `src/editor/` core + per-type registry is in place with **Sign and Redact converged onto it** (E4). Remaining migration items are the E6 launch backlog only.

**The old "the branch broke the PDF math" framing is stale - do not act on it.** That warning described one snapshot: an early wip commit that (wrongly) routed `pointermove` through React state and thrashed reconciliation. The **resize perf fix already landed on the same wip branch** with the correct deferred-DOM pattern. That per-frame `onChange` on resize in `src/components/SignTool/DraggableWrapper.jsx` `handleResizeMove` was fixed under backlog E0.1, so Sign drag and resize follow the golden rule. The gesture golden rule (mutate the DOM during a gesture, commit React state once on `pointerup`) is non-negotiable and is now captured in Part II §1.2 / §4 along with the other still-true lessons from the retired learnings doc (invisible-toolbar cascade hazard, CSP-invisible-in-dev hazard). Read Part II before touching editor styling or the gesture path. **Status (E4 landed):** every gesture path - Sign **and** Redact, drag/resize/create alike - now routes through the single `src/editor/gestures/controller.ts`, which mutates the DOM during the gesture and commits state exactly once on release. Both tools share the headless `src/editor/` core and per-type registry (per-type resize/serialize/schema; box-resize has one owner, CI-guarded). The full editor-core low-level design (audit + `src/editor/` layout + per-ticket plan) is **[docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md)**.

**Editor tool arming model (invariants, each fixed a shipped bug - don't quietly revert them):**
- **Tools are one-shot, and the arming gesture is shared by Sign and Redact via `src/lib/toolArming.js`'s
  `makeArmTool`, so the two toolbars cannot drift apart on it.** An armed tool disarms itself after one
  committed placement (`DISARM_TOOL` in Sign's reducer, fired from every creation path in
  `useWorkspaceGestures.js`; `disarmTool()` in `PdfRedactTool.jsx`, called from the box-commit and
  mark-for-deletion paths), so the click *after* a placement means "deselect" and reaches the
  workspace's deselect handler. Before this, a tool stayed armed until Esc while the creation handlers
  called `stopPropagation`, so clicking empty space to get out of what you were doing silently placed a
  stray element - and with a drag tool it was worse, since `ENSURE_MINIMUM_SIZE` promotes a zero-size
  drag into a default-size box. Redact had no such model at all before this: `activeStyle` defaulted to
  `'delete'` and stayed selected forever, so the editor arrived already armed and a drag anywhere on a
  freshly opened document drew a box. Repeat placement is opt-in: double-click a tool button to lock it
  (`SET_TOOL` with `{ tool, locked: true }` in Sign; `setTool(tool, true)` in Redact). The toggle
  buttons read the click count off their existing `onClick` (`e.detail >= 2`) rather than using
  `ondblclick`, because a real dblclick fires after two clicks and the second would disarm before the
  lock landed. Shapes is the exception and locks from its own button via a real `ondblclick`: a menu
  item can't be double-clicked (the first click unmounts it, so the second lands on the page), and
  there the two clicks only toggle the popover, never the tool. **Escape is one of three ways out of a
  locked tool, and the least available one.** There is no Escape key on a phone, and a double-tap is
  the browser's zoom gesture, not this app's - so the "Stop" chip in the shared status line
  (`EditorToolStatus.jsx`, rendered by both toolbars) is the only exit that exists on touch at all.
  Don't simplify that chip away as redundant with Escape or double-click; for a touch user it is not a
  shortcut, it is the only way in.
- **Redact's page `touch-action` is armed with the tool, not left unconditionally `none`.** In
  `PdfRedactTool.jsx` it's `activeStyle && activeStyle !== 'delete' ? 'none' : 'auto'`: a drawing tool
  (blackout/whiteout/blur) has to own the touch so a drag draws a box instead of scrolling the page,
  but Delete places by tapping a highlighted run, not dragging, so it leaves the browser's own panning
  alone. Before the arming model landed, `touch-action: none` was set unconditionally and `activeStyle`
  always had a tool selected (Delete, by default), so the two bugs compounded: a phone could not scroll
  the redact document at all, from the moment it opened.
- **Selection and text editing are separate states.** `activeElementId` means selected (toolbar points
  at it, Backspace deletes it, drag moves it); `editingElementId` means a text edit session is open.
  A text element is a live `<textarea>`, so without the split there was no state where a text box was
  selected but not being typed into, and Backspace could never delete one - only the trash icon worked.
  The invariant (`editingElementId` is null or equals `activeElementId`) is enforced **only** in the
  reducer, so no call site has to remember to close a session. Escape unwinds one level at a time.
  Outside a session the textarea is inert (`text-input-inert`: `pointer-events: none`, plus `tabIndex
  -1` and `readOnly`), which is also what lets a text box be dragged from its middle. jsdom does not
  implement `pointer-events`, so that one is guarded in Playwright or not at all.
- **`TOOL_COPY` owns every tool-facing string**, visible and announced, so the two can't drift. Both
  toolbars keep their own `TOOL_COPY` object under the same contract - `SignToolbar.jsx` for Sign's
  tools, `RedactToolbar.jsx` for Delete/Blackout/Whiteout/Blur - and `EditorToolStatus.jsx` (the shared
  status line both render) only ever reads through it, never a raw tool id. Never interpolate a raw
  tool id into copy. Keep "click and" on the drag tools: "drag on a page" reads as dragging the tool
  from the toolbar onto the page, which older editors really did work like and this does not. Guarded
  by tests in `SignToolbar.test.jsx`.

**Sign editor positioning/color pitfalls (current guardrail work):**
- Text toolbar placement must stay stable above the element: LTR uses `top-start`, RTL uses
  `top-end`. Do not reintroduce Floating UI vertical `flip()` to `bottom-*`; that made the toolbar
  jump underneath selected text. Use horizontal `shift()` within the PDF page boundary instead.
- The toolbar should be validated in a real browser for actual rects and during live drag; jsdom can
  only assert middleware config and committed state.
- Text defaults and whiteout defaults are separate. New text may inherit the active/last edited text
  size, color, font, and typed-language direction; whiteout must use its own remembered whiteout color,
  not text/shape color.
- The main Sign/Redact toolbar (`SignToolbar.module.css`, shared by both tools and `FullscreenButton`)
  holds every control to a 44x44 CSS px touch target - `--btn-min-size`, the figure WCAG 2.5.5 (AAA)
  and Apple's HIG agree on. Below 920px the row is icon-only and every control shares one explicit
  `flex-basis` of `--btn-min-size`; at 560px and below it also drops to `flex-grow: 0` and the toolbar
  centres each wrapped line. Three rules hold this together, and each one is load-bearing:
  - **Size every control from `.toolbar > *`, never from `.toolbar .dropdown`.** The row mixes bare
    `<button>`s with `<div class="dropdown">` popover wrappers. A `.toolbar .dropdown` rule outranks
    `.toolbar > *`, so any `flex` on it silently wins and sizes those two controls differently. That,
    plus `flex-basis: 0` letting a border-box button floor at its own padding+border while a
    padding-less wrapper floors at 0, is why the dropdowns once rendered ~13px wide beside ~31px
    buttons. An explicit shared basis makes the markup underneath irrelevant.
  - **`flex-grow: 0` once it actually wraps.** Growing items size each line independently, so a line
    of five and a line of four end up different button widths - the same asymmetry stacked vertically.
    Growing items also eat all the free space, leaving `justify-content` nothing to centre. Above the
    wrap point they keep growing, so a single row still fills the bar.
  - **A per-line cap, or flex strands the remainder.** Flex packs greedily, so nine controls wrapped
    as 8+1 and seven as 6+1. `--controls-per-row` (half the control count, rounded up; derived from
    the markup with `:has(> :nth-child(N))`) becomes each control's `flex-basis` share, capping the
    line and giving 5+4 and 4+3 instead. It engages only inside `@container` queries sized to "one
    full line of controls no longer fits" - those two pixel figures are the one hand-computed thing
    in the file and must be redone if `--btn-min-size`, `--toolbar-gap` or `--toolbar-padding` change
    at that breakpoint.
  - **Flex, not grid, for the wrapped rows.** Grid rows share one set of columns, so a partial last row
    is always packed into the leading columns; only a wrapping flex container centres each line.

  Guarded by `e2e/sign/toolbar-touch-targets.spec.js` - jsdom has no layout, so only a real browser can
  prove the rects.

  Above 920px the same row must never truncate a label. Two rules hold that, and the reasoning lives in
  the desktop block of `SignToolbar.module.css`: the toolbar takes a **full row of its own** (the file
  identity line stacks above it at every width - it used to share the line and cost the toolbar 256px,
  which is why every label ellipsised on a 1512px MacBook Pro), and nothing in the row may **shrink**, so
  a button either shows its whole label, drops it for the icon at a container-query threshold, or the row
  wraps. Ellipsis is the one outcome that is always a bug, because it also hides itself: the row still
  measures as fitting. Label-drop order is by how much the icon carries on its own - Undo/Full screen/
  Replace first, this app's own vocabulary (Text, Symbols, Shapes, Whiteout, Sign) last, Download/Share
  never. Don't renumber `data-label-priority` back the other way on the "learned by icon" argument; that
  is true of the second document someone signs here, not the first.


## Known hazards (each one shipped once)

- **Invisible floating toolbars.** Replacing the semantic cascade
  (`.sign-element.active .sign-element-actions`) with naive utilities produced white text on a
  transparent background inside a white container. Keep active-state visibility in CSS (§3.1).

- **Shared geometry post-processing across handles/types (the whiteout-resize regression).** A single
  clamp added to the end of the shared `handleResizeMove` (`newLeft = min(100 - width, newLeft)`) was
  applied to **every** handle, including right/bottom handles that never move `left`/`top`, so growing a
  box's right edge past the page silently yanked the un-dragged left edge inward. The lesson: on-page
  bounds must be expressed **per handle, against that handle's true anchor edge** (cap the dragged
  *dimension*, never post-process another edge).
- **Vacuous geometry tests from unmocked 0x0 rects.** The whiteout tests that *should* have caught the
  above were hollow: they rendered against jsdom's default 0x0 element rect, which turns every pixel
  delta into ±Infinity and saturates both the MIN and MAX clamp identically, so the position math is
  never exercised. **Geometry/gesture tests must assert against a realistic mocked page-wrapper rect**
  (e.g. 600x800); a test that passes with a 0x0 rect is proving nothing. The invariant suites carry a
  non-vacuity meta-guard for exactly this reason.
- **Floating UI feedback loops & measure-then-mutate drift.** Toolbar placement is delegated to Floating
  UI deriving position from the anchor rect only (never its own already-positioned rect), and
  gesture-time measurement is read-only at pointer-down (never in a render effect). These prevent the
  "toolbar freaking out near the top edge" and the draft-restore sizing drift.
- **Toolbar vertical flip is not a harmless overflow fix.** The element toolbar stays above the selected
  element; LTR text aligns it to the element's left edge, RTL to the right edge. Letting Floating UI
  `flip()` to a `bottom-*` placement made the toolbar jump underneath text in real use. Keep vertical
  placement stable (`top-start` / `top-end`) and use `shift()` only for horizontal page bounds. Real
  browser tests must assert rendered toolbar rects, because jsdom can only inspect the config.
- **Creation defaults are per tool family, not one global color bucket.** Text, symbols, lines and
  shapes use the remembered drawing/text color. Whiteout uses its own remembered whiteout color and must
  not inherit the active text or shape color.

- **pdf.js inherits the page's text direction into the canvas, and paints glyphs wrong under
  `dir="rtl"`.** It draws each glyph with its own `fillText` at the default `textAlign: start` and
  never sets `direction`, so on a `/he/` edition "start" resolves to right-aligned and every glyph lands
  shifted left by its own advance - Hebrew *and* Latin, since the shift is per glyph, not per script.
  `/he/sign/` tore "כרטיס עובד" into "כרט ס ע בד" while `/sign/` was fine with the same file. Every
  pdf.js render site takes its context from `getPdfRenderContext` (`src/editor/adapters/pdf/
  renderContext.js`), which forces `ltr`; `renderContext.test.js` scans for a render call that does not,
  and `e2e/localized/pdf-render-direction.spec.js` requires the two editions to paint the same page
  bitmap. A detached canvas inherits the *document root's* direction, so the offscreen paths
  (thumbnails, compress, to-image, redact flatten) were exposed too, not just the editor canvas.
- **Some editor bugs require a browser, not jsdom.** Unit tests are the first guardrail for pure math,
  but jsdom cannot verify rendered toolbar overlap, real `getBoundingClientRect()` relationships after
  CSS/Floating UI, or whether the toolbar follows a DOM-mutated drag before `pointerup`.

## CI guards specific to the editor

7. **Gesture golden rule** (`check-gesture-golden-rule.js`) - §4, statically enforced.

8. **Playwright e2e** - reserved for what jsdom cannot prove (rendered rects, drag-time toolbar
   following, page-edge behavior, hydration/CSP flows). Keep the suite sparse, roughly one e2e test per
   ten unit/component tests, under `e2e/<module>/`. Includes a site-wide CSP smoke sweep. Also includes
   `export-render-guard.spec.js` (landed as W1 of the WYSIWYG text epic, see TODO.md): runs the real
   `signPdf` in-browser and rasterises the produced PDF with pdf.js to compare against per-case baselines.
   One rasteriser only (never poppler against Chromium - measured cross-rasteriser noise is 80-88%), and
   never "is there ink" as a pass condition, since `.notdef` commonly draws more ink than the glyph it
   replaced.

## Anti-patterns (a change doing any of these is wrong)

- Routing live drag/resize through React state or a store (§1.2, §4).
- Expressing editor active/selection state as inline conditional utility strings instead of a CSS
  cascade (§3.1).
- Trying to encode per-element runtime geometry as Tailwind classes (§3.1).
- Adding a `script-src`/`default-src` to the `vercel.json` header CSP (§5).
- Deleting semantic `.sign-*` cascades without verifying every conditional state (active, RTL, dark,
  mobile, whiteout) in a **running** editor (§5).
- Landing a styles/scripts/config change without a `build && preview` CSP pass (§5).
- Introducing a dependency that forces `legacy-peer-deps` without re-auditing the Astro pin (§5).

## Other `src/lib/` notes

- `src/lib/merge.js` — `@cantoo/pdf-lib` glue: `mergePdfs(files, onProgress) -> Blob`, plus `resolvePdfCreationDate(file)` which reads a PDF's internal `/CreationDate` metadata.
- `src/lib/sort.js` — `sortByName` (natural/locale-numeric) and `sortByDate`. Date sort is a cascading fallback: filename-embedded date (regex) → PDF internal creation date → `File.lastModified`. **The browser File API cannot read OS file creation/birth time** — `lastModified` is the only filesystem timestamp available, and it changes when a file is copied/downloaded, so it's intentionally the last resort, not the primary signal.
- `src/lib/thumbnails.js` — lazy (dynamically imported) `pdfjs-dist` page-1 rendering to a canvas/data-URL. The worker URL uses Vite's native `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` asset pattern, so Vite bundles and content-hashes it as a same-origin asset automatically — no copy plugin needed, never fetched from a CDN.
Drag-to-reorder uses **SortableJS**, wired directly to the DOM list in `PdfMergeTool.jsx`; on drop, the final DOM order is read back into Preact state, which remains the single source of truth for every re-render.

## Inline geometry is not a CSP problem

The editor intentionally uses runtime inline styles for geometry/Floating UI. This is **not** a CSP
problem and never was: per-property CSSOM writes (`el.style.width = ...`) are not governed by
`style-src`. The real `style-src` violations were a finite set of SSR-serialized static attributes,
since converted to classes, and `verify-csp.js` now fails the build on any literal `style=` in `dist/`.
Do not "fix" the gesture path's inline geometry on CSP grounds. Full reasoning in Part II §5.
