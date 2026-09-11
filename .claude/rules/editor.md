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
two constraints on everything here are in CLAUDE.md: no file bytes leave the device, and gestures
mutate the DOM live and commit state once on release. This file holds the rules that fixed shipped
bugs, each with its tell and its guard. Fonts and text export: `fonts-and-text.md`. Styling
boundary: `styling.md`. Design record for the core: [docs/E4-headless-editor-core-plan.md](../../docs/E4-headless-editor-core-plan.md).

## Shape of the editor (landed, do not re-migrate)

- `src/editor/` is plain TS with no Preact: the document model (`model/editorModel.ts`, one typed
  union keyed on the flat `type` discriminant), geometry, the gesture controller
  (`gestures/controller.ts`), and a per-type registry (`registry/`: render, resize, serialize,
  schema per module; `blackout`, `blur` and `whiteout` are each a module). Preact only renders from
  state and binds events to the core. Sign and Redact both sit on it.
- Anchor-preserving box resize has exactly one owner, `registry/boxResize.ts`; CI greps that the
  `maxWidthFromRightGrowth`/`maxHeightFromBottomGrowth` names exist in one file.
- Editor `.sign-*`/`.sig-*` styles live in CSS Modules; `check-editor-global-css.js` holds
  `global.css` at zero editor selectors.
- Warnings you may find in old tickets about "the branch broke the PDF math" or per-frame `onChange`
  in `DraggableWrapper` describe one early wip snapshot and were fixed under E0.1. Do not act on them.

## Gesture golden rule (drag, resize, and create)

During `pointermove`, write the DOM directly (`style.transform`, `.width/.height/.left/.top`, SVG
`x1/y1/x2/y2`) and accumulate the final value in a local. On `pointerup`, call `onChange(final)`
exactly once, then clear the inline overrides so state resumes control. State is the source of truth
between gestures, never during one. Never introduce a store or signals for live gesture state: routing
pointer events through reactive state is the "reconciliation thrash" that made the editor unusable.
Create is a gesture too (click-place or drag-draw), not an exception.

- Guard: `scripts/check-gesture-golden-rule.js` scans every `computePatch` body and fails on a direct
  `onChange`/`dispatch`/`setState`.
- Runtime inline geometry is **not** a CSP problem: per-property CSSOM writes are not governed by
  `style-src`. Only literal `style="..."` markup is, and `verify-csp.js` fails the build on any in
  `dist/`. Do not "fix" the gesture path on CSP grounds.

## Tool arming, selection and text editing

- **Tools are one-shot.** An armed tool disarms after one committed placement (`DISARM_TOOL` from
  every creation path in Sign's `useWorkspaceGestures`; `disarmTool()` from Redact's box-commit and
  mark-for-deletion paths), so the click after a placement means "deselect". Both toolbars arm through
  `src/lib/toolArming.js`'s `makeArmTool`, so they cannot drift. Tell of the old bug: clicking empty
  space to get out of a tool placed a stray element, and with a drag tool `ENSURE_MINIMUM_SIZE`
  promoted a zero-size drag into a default box; Redact used to arrive with `'delete'` armed forever.
- **Repeat placement is opt-in by double-click** (`SET_TOOL` with `{ tool, locked: true }` in Sign;
  `setTool(tool, true)` in Redact). Toggle buttons read `e.detail >= 2` off `onClick`, not
  `ondblclick`, because the second click of a real dblclick would disarm before the lock landed. Shapes
  locks from its own button with a real `ondblclick`, since a menu item unmounts on first click.
- **The "Stop" chip in `EditorToolStatus` is the only exit from a locked tool on touch.** No Escape key
  on a phone; double-tap is the browser's zoom. Never remove it as redundant.
- **Redact's page `touch-action` is armed with the tool**: `activeStyle && activeStyle !== 'delete' ?
  'none' : 'auto'`. Drawing tools own the touch; Delete taps a highlighted run and leaves panning to
  the browser. Unconditional `none` once made the document unscrollable on a phone from the moment it
  opened.
- **Selection (`activeElementId`) and text editing (`editingElementId`) are separate states.** Selected
  means the toolbar points at it, Backspace deletes it, drag moves it; editing means a text session is
  open. The invariant `editingElementId === null || editingElementId === activeElementId` is enforced
  only in the reducer. Escape unwinds one level at a time. Outside a session the textarea is inert
  (`text-input-inert`: `pointer-events: none`, `tabIndex -1`, `readOnly`), which is what lets a text
  box be dragged from its middle. jsdom has no `pointer-events`, so that is a Playwright guard or none.
- **`TOOL_COPY` owns every tool-facing string**, visible and announced; `SignToolbar` and
  `RedactToolbar` each keep one under the same contract and `EditorToolStatus` reads only through it.
  Never interpolate a raw tool id into copy. Keep "click and" on the drag tools ("drag on a page" reads
  as dragging from the toolbar). Guarded in `SignToolbar.test.tsx`.

## Element toolbar placement and creation defaults

- The element toolbar stays **above** the element: `top-start` for LTR, `top-end` for RTL. Never
  reintroduce Floating UI vertical `flip()` to `bottom-*` (it jumped under the text in real use); use
  horizontal `shift()` within the page only. Position derives from the anchor rect only, never from the
  toolbar's own already-positioned rect (feedback loop near the top edge).
- Gesture-time measurement is read-only at pointer-down, never in a render effect (draft-restore sizing
  drift).
- Creation defaults are per tool family: text, symbols, lines and shapes inherit the remembered
  drawing/text color, size, font and typed-language direction; whiteout uses its own remembered
  whiteout color and never the text/shape color.
- Active-state visibility lives in the CSS cascade (`.sign-element.active .sign-element-actions`), never
  in conditional utility strings: replacing it once produced white text on a transparent background.
- These need a real browser: rendered toolbar rects, toolbar following a DOM-mutated drag before
  `pointerup`, `getBoundingClientRect()` after Floating UI. jsdom can only assert middleware config and
  committed state.

## Geometry rules

- **Bounds are per handle, against that handle's anchor edge.** Cap the dragged dimension; never
  post-process another edge. A shared `newLeft = min(100 - width, newLeft)` clamp once yanked the
  un-dragged left edge inward when the right handle grew past the page (whiteout-resize regression).
- **Geometry tests must mock a realistic page rect** (e.g. 600x800). jsdom's default 0x0 rect turns
  every delta into ±Infinity and saturates MIN and MAX clamps identically, so a passing test proves
  nothing; the invariant suites carry a non-vacuity meta-guard for this.

## Main toolbar layout (`SignToolbar.module.css`, shared with Redact and `FullscreenButton`)

- Every control is a 44x44 CSS px touch target (`--btn-min-size`; WCAG 2.5.5 AAA and Apple HIG).
  Below 920px the row is icon-only with one explicit `flex-basis` of `--btn-min-size` per control; at
  560px and below `flex-grow: 0` and each wrapped line is centred. Guard:
  `e2e/sign/toolbar-touch-targets.spec.js` (jsdom has no layout).
- Size from `.toolbar > *`, never `.toolbar .dropdown`: the row mixes `<button>`s and
  `<div class="dropdown">` wrappers, and a `.dropdown` rule outranks the child selector (dropdowns once
  rendered ~13px beside ~31px buttons under `flex-basis: 0`).
- `flex-grow: 0` once it wraps, or lines of five and four get different widths and nothing is left to
  centre. `--controls-per-row` (half the count, rounded up, via `:has(> :nth-child(N))`) caps each line
  so nine controls wrap 5+4 not 8+1; it engages inside `@container` queries whose two pixel thresholds
  are the one hand-computed thing in the file and must be redone if `--btn-min-size`, `--toolbar-gap`
  or `--toolbar-padding` change. Flex, not grid: grid packs a partial last row into the leading columns.
- Above 920px no label may ever truncate. The toolbar takes a full row of its own (the file identity
  line stacks above it; sharing the line once cost 256px and ellipsised every label on a 1512px
  MacBook Pro) and nothing in the row may shrink: a button shows its whole label, drops to the icon at
  a container threshold, or the row wraps. Ellipsis is always a bug and hides itself (the row still
  measures as fitting). `data-label-priority` drops Undo/Full screen/Replace first, this app's own
  vocabulary (Text, Symbols, Shapes, Whiteout, Sign) last, Download/Share never; do not renumber it
  on the "learned by icon" argument.

## pdf.js render direction

Every pdf.js render site takes its context from `getPdfRenderContext`
(`src/editor/adapters/pdf/renderContext.js`), which forces `ltr`. pdf.js paints each glyph with its
own `fillText` at `textAlign: start` and never sets `direction`, so under `dir="rtl"` every glyph
(Hebrew and Latin alike) lands shifted by its own advance: `/he/sign/` tore "כרטיס עובד" into
"כרט ס ע בד". A detached canvas inherits the document root's direction, so thumbnails, compress,
to-image and redact flatten were exposed too. Guards: `renderContext.test.js` scans for a render call
that bypasses it; `e2e/localized/pdf-render-direction.spec.js` requires both editions to paint the
same bitmap.

## Draft persistence (flagship, on-device)

`src/editor/workspace/draftStore.js` is a dependency-free IndexedDB wrapper (DB `pdf-toolkit-drafts`,
store `drafts`, keyed by tool name: one draft per tool) holding the full source PDF bytes plus edit
state, 14-day expiry, no-op when IndexedDB is unavailable. `useDraftPersistence.js` debounce-saves
while `status === 'editing'`, flushes on `visibilitychange`/`pagehide`, restores silently on mount
(the draft is the source of truth; download does not clear it), and clears on "Replace file" or
expiry. Sign and Redact share a `loadPdf()` for fresh picks and restore, and call `seedUniqueId()` (in `sign.js`)
after restore so new ids don't collide. Nothing is uploaded. It is marketed as crash recovery on the
sign, redact and home pages, with one FAQ entry each mirrored into `<SeoSchema>`.

## Other tools and `src/lib/`

- **Merge flow**: after a merge the "Merge PDFs" button goes grey (`.is-done`) and focus moves to
  "Download PDF"; any file mutation (add, remove, reorder, sort) resets to `'idle'` and revokes
  `downloadUrl`. Reordering is SortableJS on the DOM list; on drop the DOM order is read back into
  Preact state, which stays the single source of truth.
- **FAQ disclosure** on tool pages is a details/summary whose summary holds the hero text; a click
  interceptor makes only the styled `.faq-toggle` link toggle it.
- `src/lib/merge.js` (`@cantoo/pdf-lib`): `mergePdfs(files, onProgress) -> Blob`, plus `resolvePdfCreationDate(file)`
  reading `/CreationDate`. `src/lib/sort.js`: `sortByName` (locale-numeric) and `sortByDate`, a
  cascade of filename date → PDF creation date → `File.lastModified`. The File API cannot read OS
  birth time and `lastModified` changes on copy/download, so it is deliberately last.
- `src/lib/thumbnails.js`: lazy `pdfjs-dist` page-1 render. The worker is
  `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, bundled same-origin, never a CDN.

## E2E scope

Playwright is for what jsdom cannot prove; keep roughly one e2e per ten unit tests under
`e2e/<module>/`. `export-render-guard.spec.js` runs the real `signPdf` in-browser and rasterises the
PDF with pdf.js against per-case baselines: one rasteriser only (poppler vs Chromium noise measured at
80-88%), and never "is there ink" as a pass condition, since `.notdef` often draws more ink than the
glyph it replaced.
