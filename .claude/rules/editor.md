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
  - "docs/archive/editor-module-boundaries-plan.md"
  - "docs/view-density-control-spec.md"
  - "docs/archive/sign-redact-draft-validation-plan.md"
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

**Next generation (2026-09-25).** Sign is being redesigned, phone first, with desktop on the same
architecture. The plan of record is [docs/sign-next-gen.md](../../docs/sign-next-gen.md), under the SNG
epic, and its normative rules are [docs/sign-next-gen-guidelines.md](../../docs/sign-next-gen-guidelines.md).
Local mobile fixes are frozen by Shlomi's decision. Read the record's §3 (iOS learnings) and the
guidelines' §11 checklist before touching any touch, zoom, focus or keyboard code. The floating-toolbar rules below govern the current editor only, and
retire with SNG-06.

The main toolbar row (touch targets, wrapping, label fit, the phone grid) is `editor-toolbar.md`, loaded
with the toolbar files; read it before changing any control in that row.

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
- `src/editor-ui/whiteout/` holds the Sign-and-Redact shared whiteout colour group, page sampler and eyedropper.
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
  `src/tools/sign/lib/fields/corpus/` (Nx project `form-corpus`) is one row per form element - live
  AcroForm widgets, printed ink, hybrids of both, page geometry, and the known gaps - each built into
  a real PDF and run through the whole pipeline. Read its `README.md` before changing `pageInk.js`,
  `formGrid.js`, `formCells.js`, `fieldRegions.js` or `formWidgets.js`: a third of the rows pin things
  that must *not* be detected, which is what catches a change that makes the detector greedier. It is
  not a recall/precision measurement - those live in `docs/mobi-10-field-map-spike.md` and a synthetic
  fixture cannot contribute to them.
- How the detectors are reconciled, how a box is placed on each kind of field, and the live-form
  measurements behind the numbers are in [docs/sign-form-fields.md](../../docs/sign-form-fields.md); the
  comments in `formCells.js`, `fieldRegions.js` and `fieldOrder.ts` carry only the reasons.
- Warnings you may find in old tickets about "the branch broke the PDF math" or per-frame `onChange`
  in `DraggableWrapper` describe one early wip snapshot and were fixed under E0.1. Do not act on them.

## Document memory and field detection: pure, apart from the UX (SIGN-32..34)

Shlomi, 2026-09-26: "the behavior of the detector and the memory of the sign tool should be completely
detached from the overall sign tool UX". The Sign UX is being rewritten (SNG). These two capabilities are
logic, not UI, and any UX (today's editor, fill mode, whatever comes next) calls them rather than
re-deriving them.

- **Field detection** lives only in `src/tools/sign/lib/fields/`, as pure functions behind `detectFormFields`
  (`test:detection-purity`). How the UI draws, walks or offers a found spot never feeds back into it.
- **Document memory** lives only in `src/editor/model/`:
  - `documentStyle.ts` holds the style: font, size, direction, colour, alignment, bold, italic, date
    format, mark and size, line thickness, whiteout colour, signature width.
  - `carriedPatch.ts` decides what an explicit change carries.
  - `elementDefaults.ts` decides what a new element starts from. `resolveDocumentStyle` resolves the
    three layers key by key: the document's own style, the app-wide style, the shipped defaults.
  - The state is `SignToolState.carried`, with one action, `SET_CARRIED`. It is saved in the draft's
    `extra.carried` and validated key by key in `draftValidation.ts`.
  - The app-wide style (SIGN-35) is `SignToolState.appStyle`, with `SET_APP_STYLE`. It is one on-device
    record (`preferenceStore.ts`'s `getAppStyle`/`rememberAppStyle`), read through the same validator,
    re-read whenever a document opens, and never written into a draft. `chooseStyle.ts` writes both.
- **The rules**, each guarded by `src/tools/sign/e2e/per-document-style.spec.js` (Shlomi's A/B/A) and
  unit tests:
  - Every setting belongs to its document. Going back to a document, through recents or after a reload,
    brings its own settings back.
  - An explicit choice also becomes the app default (SIGN-35): a new document starts from the person's
    latest choices, then the shipped defaults, and a key a document never set follows the latest choice.
    The direction stays with the document (it is the form's language), and so does a font the typing
    switched to. Seeding is not choosing: only the size seeds, from the first field, and only while the
    person has set no size anywhere; the seeded size stays with its document.
  - The signature pen colour and thickness and the saved signatures are the person's, not any
    document's. Never add a separate browser-wide "last used" preference for a form setting: it is a key
    of `DocumentStyle`, and the app-wide layer comes with it.
  - What the person sets explicitly carries forward: A-/A+, a resize drag, a font or colour pick,
    alignment, bold, italic, a date format, a mark. What the app computes does not: a field's
    fit-shrink, a date's generated text.
  - With no size chosen anywhere, the first field's computed size, uncorrected, is the document's size.
    `fieldFontSize` is the one sizing function, and a field only ever shrinks the carried size to fit
    itself.
  - Direction comes from typed letters. Until then every new box, free or on a field, starts in the
    document's direction, or for a field on a document with none yet, the page's printed direction.
    Digits and dates render LTR by design and never change the document's direction.
- **Adding a setting** means one key in `DocumentStyle`, one validator line, one mapping in each of
  `carriedPatch.ts` and `elementDefaults.ts`, an A/B/A assertion, and a decision whether it is
  document-only (`DOCUMENT_ONLY_KEYS`). Never a `remember*` function, a
  context value or a `localStorage` key.

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
- **The Blur and Whiteout brushes are the one exception** (RED-32): armed in brush mode, they stay armed after each stroke until Stop or Esc, because painting takes several strokes. One stroke is still one committed element.
- **Repeat placement is opt-in by double-click** (`SET_TOOL` with `{ tool, locked: true }` in Sign;
  `setTool(tool, true)` in Redact). Toggle buttons read `e.detail >= 2` off `onClick`, not
  `ondblclick`, because the second click of a real dblclick would disarm before the lock landed. More
  locks from a real `dblclick` on its wrapper div (the armed, or last picked, More tool), since a menu
  item unmounts on first click.
- **A double-tap locks too, by time, not by `detail`** (SIGN-30). iOS Safari reports every tap as
  `detail: 1` (and the click as `pointerType: "mouse"`), so on a coarse pointer a second tap on the
  tool the first tap armed, within `DOUBLE_TAP_MS`, locks it; `touch-action: manipulation` on
  `.toolbar` keeps Safari from reading the two taps as zoom. Chromium's touch emulation counts taps
  as `detail: 2`, so no Playwright spec can reproduce the iOS failure: `toolArming.test.js` is the
  guard. The menu tools (More, Sign) lock on touch through `useDoubleTap` (key `'more'` for More), only while the menu the
  first tap opened is still open, and on touch their menus open by tap alone, never by the emulated
  hover (it opened and shut the menu on one tap) (SIGN-31). The shortcut is taught once: a floating
  bubble on first arm, once per session with a mouse and once per device on touch
  (`useAutoArmHint`), never as text in the phone's status row.
- **Arming must not move the toolbar** (SIGN-30): the second click of a double-click lands where the
  button was. The status row reserves every state's height (`.help-stack`), and in Sign on a form it
  also reserves the field arrows' footprint while they are absent (`reserveFieldNav`,
  `.help-reserve-nav`). Touch gets short "Tap"/"Tap and drag" sentences (`ToolCopy.actionTouch`) so the armed
  row stays within two lines beside the switch and arrows. Guard:
  `e2e/tool-toolbars/toolbar-arm-no-shift.spec.js`, every tool, phone and desktop.
  The page under it holds too (RED-70): Redact's Box / Brush is a hover submenu of its tool with a
  mouse (`BrushToolMenu`) and hangs below the card on touch, never in its flow, or a finished box
  jumps from the pointer. Guard: `arm-page-still.spec.js`.
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
- **Undo covers add, delete and update** (`HistoryOperation`, UNDO-04), so redo does too. An
  `update` entry carries only the changed fields, `{ id, before, after }`, and is reverted in place.
  It is logged at each tool's one choke point (`updateElement` in Sign's `PdfWorkspace.tsx` and in
  `PdfRedactTool.tsx`) through `createUpdateEntry` (`src/editor/model/updateKind.ts`), never in
  gesture code: the gesture controller already commits once per gesture, so one gesture is one step.
  Typing is one step per text edit session (`group`), and the textarea's native undo still owns
  Cmd/Ctrl+Z while it is focused. `pushCommand` folds same-element changes of one kind within 500ms
  into one step, never while a redo is pending, and caps history at `MAX_HISTORY_DEPTH` (also on
  restore). Drag-create dispatches `UPDATE_ELEMENT` directly and must stay unlogged: its `add` entry
  is the step. No "Moved · Undo" chip. Undo does not roll back the carried or app-wide style
  (SIGN-33/35): undoing a colour change leaves the next placement in that colour (open question, 2026-09-26).
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
- Every text box but a comb has the alignment control (SIGN-36): a free box's lines align within its
  widest line, on screen and in the export alike (`textPdf.ts`). A comb places one character per cell.
- Creation defaults come from the document's carried style (see "Document memory" above). Whiteout
  carries its own colour and never takes the text or shape colour.
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

## pdf.js render direction

Every pdf.js render site takes its context from `getPdfRenderContext`
(`src/lib/pdf/pdfRender.js`, moved out of the editor under DEBT-04 since compress, split, to-image,
editor-ui and `lib/pdf/thumbnails.js` were already its majority consumers), which forces `ltr`. pdf.js
paints each glyph with its own `fillText` at `textAlign: start` and never sets `direction`, so under
`dir="rtl"` every glyph (Hebrew and Latin alike) lands shifted by its own advance: `/he/sign/` tore
"כרטיס עובד" into "כרט ס ע בד". A detached canvas inherits the document root's direction, so
thumbnails, compress, to-image and redact flatten were exposed too. Guards: `pdfRender.test.js` scans
for a render call that bypasses it; `e2e/localized/pdf-render-direction.spec.js` requires both
editions to paint the same bitmap.
