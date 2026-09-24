---
paths:
  - "src/editor/**"
  - "src/editor-ui/**"
  - "src/tools/sign/**"
  - "src/tools/redact/**"
  - "src/lib/gestures/**"
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
  one typed union keyed on the flat `type` discriminant), geometry, and a per-type registry
  (`registry/`: render, resize, serialize, schema per module; `blackout`, `blur` and `whiteout` are
  each a module). The gesture controller (`src/lib/gestures/controller.ts`) moved out of the editor
  under DEBT-04 (part 2): `CompareSlider` (shell) needed the same golden-rule engine for its
  before/after drag handle, so it now lives in `src/lib/` alongside the editor's own consumers
  (Sign, Redact, `editor-ui`'s drag/resize hooks) - see the Gesture golden rule section below. Preact
  only renders from state and binds events to the core. Sign and Redact both sit on it. This is a
  checked invariant, not just prose: `npm run test:module-boundaries` fails on any new `src/editor/` import of a tool or of
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
- **Field detection is Sign-only and stays behind a dynamic `import()`.** Its five chunks
  (`pageInk`, `formGrid`, `formCells`, `fieldRegions`, `formWidgets`) are PDF geometry and AcroForm
  parsing that a Redact or Merge visitor has no use for, and `useFormFieldRegions.ts` is the only
  thing that may reach them. A static import from any eagerly-loaded module puts all five into every
  tool's first paint, and it would build and test clean; `npm run test:lazy-modules`
  (`scripts/check-lazy-modules.js`, after `build`) walks the built graph per page and fails on it.
  Measured: /redact/ and /merge/ cannot reach them at all.
- **The form-field detector has a corpus, and a new element belongs in it**:
  `src/editor/adapters/pdf/corpus/` (Nx project `form-corpus`) is one row per form element - live
  AcroForm widgets, printed ink, hybrids of both, page geometry, and the known gaps - each built into
  a real PDF and run through the whole pipeline. Read its `README.md` before changing `pageInk.js`,
  `formGrid.js`, `formCells.js`, `fieldRegions.js` or `formWidgets.js`: a third of the rows pin things
  that must *not* be detected, which is what catches a change that makes the detector greedier. It is
  not a recall/precision measurement - those live in `docs/mobi-10-field-map-spike.md` and a synthetic
  fixture cannot contribute to them.
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
  `src/editor-ui/hooks/toolArming.js`'s `useArmTool`, so they cannot drift. Tell of the old bug: clicking empty
  space to get out of a tool placed a stray element, and with a drag tool `ENSURE_MINIMUM_SIZE`
  promoted a zero-size drag into a default box; Redact used to arrive with `'delete'` armed forever.
- **Repeat placement is opt-in by double-click** (`SET_TOOL` with `{ tool, locked: true }` in Sign;
  `setTool(tool, true)` in Redact). Toggle buttons read `e.detail >= 2` off `onClick`, not
  `ondblclick`, because the second click of a real dblclick would disarm before the lock landed. Shapes
  locks from its own button with a real `ondblclick`, since a menu item unmounts on first click.
- **A double-tap locks too, by time, not by `detail`** (SIGN-30). iOS Safari reports every tap as
  `detail: 1` (and the click as `pointerType: "mouse"`), so on a coarse pointer a second tap on the
  tool the first tap armed, within `DOUBLE_TAP_MS`, locks it; `touch-action: manipulation` on
  `.toolbar` keeps Safari from reading the two taps as zoom. Chromium's touch emulation counts taps
  as `detail: 2`, so no Playwright spec can reproduce the iOS failure: `toolArming.test.js` is the
  guard. Menu-armed tools (Shapes, Sign) still lock only by `ondblclick`.
- **Arming must not move the toolbar** (SIGN-30): the second click of a double-click lands where the
  button was. The status row reserves every state's height (`.help-stack`), and in Sign on a form it
  also reserves the field arrows' footprint while they are absent (`reserveFieldNav`,
  `.help-reserve-nav`). Touch gets short "Tap"/"Tap and drag" sentences (`ToolCopy.actionTouch`) so the armed
  row stays within two lines beside the switch and arrows. Guard:
  `e2e/tool-toolbars/toolbar-arm-no-shift.spec.js`, every tool, phone and desktop.
- **The "Stop" chip in `EditorToolStatus` is the only exit from a locked tool on touch.** No Escape key
  on a phone, and a double-tap only locks. Never remove it as redundant.
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
  as dragging from the toolbar), and "tap and" in their touch forms for the same reason. Guarded in `SignToolbar.test.tsx`.

## Undo and redo

- **Undo and Redo are two controls, in both tools, and they are the whole history model.** One tap
  each, plus Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y (`src/lib/history/useHistoryShortcuts.js`, which
  deliberately does not bind Cmd+Y, macOS's own). Undo is disabled with an empty `actionHistory`,
  Redo when nothing has been undone. **The shared change-history dialog (`UndoHistoryModal`) was
  removed - do not rebuild it.** Beside a real Undo/Redo pair a timeline is redundant, and its
  "Revert selected" was a selective undo that fought linear redo: reverting a checked set from the
  middle of the stack had to throw the future away, so the dialog and Redo kept undoing each other's
  work. The shipped bug behind that pair is still the reason Undo and Redo may never fold back into
  one button, or into a dialog: a control that only exists while a dialog is open is, on a phone, no
  control at all - a toolbar Undo that opened the dialog left touch with no single-step undo and
  Redo reachable only in the one place that closed itself on use. Redact's five-second undo chip is
  a separate feature and stays.
- **The redo stack is strictly linear and lives only in memory.** `src/editor/model/historyStack.ts`
  owns it: `revertCommands` keeps the future when the reverted set is a contiguous run at the top of
  the past (that is an undo by another name) and clears it otherwise, and any new command clears it.
  Without that rule a redo can re-insert an element a still-live later command assumed was gone.
  Undo->redo preserves exact z-order *because of* it: `restoreSnapshots` splices at
  `Math.min(index, restored.length)`.
- **Undo covers add and delete only** (`HistoryOperation`), so redo does too. Moves, resizes, styling
  and typing are deliberately untracked; "I nudged a box and can't get it back" is not a redo bug and
  is not fixed by one - it needs a third `update` operation carrying before/after snapshots.
- **Redo must bump `documentRevision`,** exactly as undo does: SIGN-14 makes any edit revoke a
  prepared share file and a running export, and a redo that skipped it would let a stale export
  download against a changed document.

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
  Below 920px the row has one explicit `flex-basis` of `--btn-min-size` per control and, once it
  has to wrap, `flex-grow: 0` with each wrapped line centred. Guard:
  `e2e/tool-toolbars/toolbar-touch-targets.spec.js` (jsdom has no layout; it drives both `/sign` and
  `/redact`, so it lives under `e2e/`, not either tool's own `e2e/` folder).
- Size from `.toolbar > *`, never `.toolbar .dropdown`: the row mixes `<button>`s and
  `<div class="dropdown">` wrappers, and a `.dropdown` rule outranks the child selector (dropdowns once
  rendered ~13px beside ~31px buttons under `flex-basis: 0`).
- `flex-grow: 0` once it wraps, or lines of five and four get different widths and nothing is left to
  centre. `--controls-per-row` (half the count, rounded up, via `:has(> :nth-child(N))`) caps each line
  so nine controls wrap 5+4 not 8+1; it engages inside `@container` queries whose pixel thresholds
  are the one hand-computed thing in the file and must be redone if `--btn-min-size`, `--toolbar-gap`
  or `--toolbar-padding` change, or if a control is added anywhere. Round a new threshold **up** past
  its figure unless you have checked the box cannot land in the band below it: the content box is the
  viewport less 96.8px on a phone and 112.8px in the tablet band, so an ordinary integer window width
  puts it on x.2, and both thresholds that were left on the floor() side of a whole-number figure
  (581px, 288px) were measured stranding or unbalancing a real row at one - 693px gave 11+1, 384px
  gave 5+5+2. Flex, not grid: grid packs a
  partial last row into the leading columns. **Only some counts can be balanced at the 44px floor**,
  because greedy flex fills each line to the cap: ten lands 4+4+2 or 3+3+3+1 and thirteen lands
  6+6+1 or 4+4+4+1, while nine, eleven and twelve all land evenly. That is what decides when an
  optional control stands down, not taste. The counted set is
  `:nth-child(N of :not(.desktop-download):not([role="radiogroup"]))`: Sign counts **twelve** (with
  Share or without), Redact **nine** (ten once a redacted export exists and "Compress it" appears).
  Both are counts that balance, so neither needs a stand-down until the very bottom. Measured
  2026-09-20, every integer viewport from 919px to 220px in headless Chromium: Sign holds one line
  to 694px, wraps 6+6 to 385px, 4+4+4 to 336px, 4+4+3 to 288px and 3+3+3+2 to 239px; **Feedback -
  now the only `[data-optional-control]` on either toolbar, since History and its dialog came out -
  stands down at 335px** (239px of content box), and nothing else does. Redact holds one line to
  544px, wraps 5+4 to 348px and 3+3+3 from 347px, and stands nothing down. Redact's tenth control
  (the "Compress it" hand-off, which only exists once a redacted export does) puts it on the one
  count that cannot balance: measured one line to 608px, 5+5 to 336px, then 4+4+2 from 335px down.
  That is the shape the file tolerates for ten - a full short row, never a lone control - and no cap
  improves it (three gives 3+3+3+1). It was an eleven, and balanced, until History left.
  Thirteen was the count that could not be balanced, and the second, earlier stand-down step Sign
  used to carry at 344px existed only to get back to twelve; it went with History.
- Two anchors, desktop and iPhone, one step between (SIGN-29, 2026-09-18). From 1300px the row is
  one line with labels, set 4px apart; the toolbar box plateaus at 1172px of content (it reaches
  that plateau at a 1280px window, so a classic scrollbar at 1300px no longer eats into it).
  Measured 2026-09-20 in headless Chromium on Linux, the wide DejaVu face CI lands on, with Share
  stubbed present: Sign's labelled row is **1139.7px against the 1172px box, 32.3px spare**. Spend
  that on a thirteenth control and the next label to go is Replace's (62.7px of label); Date's is
  not - it was icon-only for one day, and History leaving is what paid it back. Keep the gap at 4px
  while the margin is this thin: the twelve gaps between the thirteen rendered controls would cost
  24px of the 32.3px at 6px. Undo, Redo and Feedback stay `data-icon-only` at every width:
  an arrow is a convention, and none of them is a tool. Below 1300px every control is icon-only on
  one line, until the row's 44px targets stop fitting, and from there down the phone grid above. No
  label may ever
  truncate: `flex-shrink: 0`, and if the labelled row ever outgrows the box it wraps whole, which
  `e2e/tool-toolbars/toolbar-desktop-one-line.spec.js` catches. Container-query label tiers were
  tried twice and drifted twice; do not bring them back.
- Sign's own toolbar order reads in the order a form gets done: the filling vocabulary first (Text,
  Date, Symbols, Shapes, Whiteout), then Sign as the last thing you do to a filled form (it is the
  tool the page is named for, but it led the row for one day under SIGN-29 and read as the wrong
  first step), then the history group beside the work it acts on (Undo, Redo - the same
  pair, in the same order, as Redact), then the chrome group (view density, full screen,
  Feedback), then Replace with the other finishing action, then export at the far edge - one kind of
  thing per group. Redact's own order is unchanged: it already led with Blur, its named tool, since
  f48fcbd8.
- The view-density segmented control's selected segment is a tint (`--color-primary-tint` fill,
  `--color-primary-text`), not the solid `--color-primary` fill: that fill is what `.active` means on
  a toolbar button (a tool armed for the next click), and a persistent view setting wearing it read as
  a tool that was always on.

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
