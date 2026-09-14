---
paths:
  - "src/editor/**"
  - "src/editor-ui/**"
  - "src/tools/sign/**"
  - "src/tools/redact/**"
  - "scripts/check-gesture-golden-rule.js"
  - "scripts/check-editor-dependency-directions.mjs"
  - "docs/E4-headless-editor-core-plan.md"
  - "docs/editor-module-boundaries-plan.md"
  - "docs/view-density-control-spec.md"
  - "docs/sign-redact-draft-validation-plan.md"
---

# Sign/Redact editor

Loaded when working on the headless `src/editor/` core, the shared `src/editor-ui/` chrome, or the
Sign and Redact tool islands. The two constraints on everything here are in CLAUDE.md: no file bytes
leave the device, and gestures mutate the DOM live and commit state once on release. This file holds
the rules that fixed shipped bugs, each with its tell and its guard. Fonts and text export:
`fonts-and-text.md`. Styling boundary: `styling.md`. The other tools, draft persistence, the
cross-tool hand-off pattern and the UX guideline live in `tools-and-shell.md`. Design record for the
core: [docs/E4-headless-editor-core-plan.md](../../docs/E4-headless-editor-core-plan.md). The target
folder layout for `src/`, the dependency rules between tools, shell, editor-ui, editor and lib, and
the evidence behind both are in
[docs/module-boundaries.md](../../docs/module-boundaries.md) (ARCH-15); read it before moving a file
into or out of `src/editor/`, `src/tools/sign/` or `src/tools/merge/`.

## Shape of the editor (landed, do not re-migrate)

- `src/editor/` is meant to be plain TS with no Preact: the document model (`model/editorModel.ts`,
  one typed union keyed on the flat `type` discriminant), geometry, the gesture controller
  (`gestures/controller.ts`), and a per-type registry (`registry/`: render, resize, serialize,
  schema per module; `blackout`, `blur` and `whiteout` are each a module). Preact only renders from
  state and binds events to the core. Sign and Redact both sit on it. This is a checked invariant, not
  just prose: `npm run test:module-boundaries` fails on any new `src/editor/` import of a tool or of
  `src/components`, with no editor entry left on the allowlist since ARCH-19. The core never
  imports a tool's Preact components: a tool builds its own renderer map with
  `registry/renderers.ts`'s `createElementRenderers(nodeComponents)`, called once from its own entry
  point, and the returned map throws by type name for any registerable type whose component was not
  supplied. `registry/text.ts`'s resize paint finds the text node's parts by `data-text-part`
  attribute, so the core needs no class names from the tool at all.
- Anchor-preserving box resize has exactly one owner, `registry/boxResize.ts`;
  `check-editor-dependency-directions.mjs` fails if the `maxWidthFromRightGrowth`/
  `maxHeightFromBottomGrowth` names turn up in a second file (`check:fast`, not only CI, since DEBT-12
  moved this off a standalone `ci.yml` grep step).
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
  `src/editor-ui/hooks/toolArming.js`'s `makeArmTool`, so they cannot drift. Tell of the old bug: clicking empty
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
  `e2e/tool-toolbars/toolbar-touch-targets.spec.js` (jsdom has no layout; it drives both `/sign` and
  `/redact`, so it lives under `e2e/`, not either tool's own `e2e/` folder).
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
(`src/lib/pdfRender.js`, moved out of the editor under DEBT-04 since compress, split, to-image,
editor-ui and `lib/thumbnails.js` were already its majority consumers), which forces `ltr`. pdf.js
paints each glyph with its own `fillText` at `textAlign: start` and never sets `direction`, so under
`dir="rtl"` every glyph (Hebrew and Latin alike) lands shifted by its own advance: `/he/sign/` tore
"כרטיס עובד" into "כרט ס ע בד". A detached canvas inherits the document root's direction, so
thumbnails, compress, to-image and redact flatten were exposed too. Guards: `pdfRender.test.js` scans
for a render call that bypasses it; `e2e/localized/pdf-render-direction.spec.js` requires both
editions to paint the same bitmap.
