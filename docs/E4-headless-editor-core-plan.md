# E4 Low-Level Design — Headless TS Editor Core (Lane E)

> Execution plan for backlog epic **E4** (tickets E4.2, E4.3, E4.4) in [scrum.md](../scrum.md).
> Design standard: [ARCHITECTURE.md](../ARCHITECTURE.md) §1.2 (gesture hot path), §3.2 (editor core),
> §3.1 (styling boundary), §4 (gesture golden rule), §5 (known hazards). **E4.1 and E4.2 are done**:
> E4.1 introduced `src/lib/editorModel.ts` and `coords.ts`; E4.2 introduced the framework-free gesture
> controller and pointer normaliser. This is the reference a fresh session
> reads before touching the Sign/Redact editors.
>
> **Lane E is internally serial:** E4.2 → E4.3 → E4.4. It runs in parallel with E2 (Lane C) and E3
> (Lane D). **E4.3 is next**; its E4.2 dependency is satisfied.

---

## 0. The three things this epic must not break (read first)

1. **The gesture golden rule (ARCHITECTURE §1.2 / §4).** During a gesture, mutate the DOM directly;
   commit React/Preact state **once** on `pointerup`. Never route continuous drag/resize/create
   through reactive state or a store. The core must make this rule *structural* — one controller both
   gestures share — not a convention two code paths can each break.
2. **The SEO/privacy island wall (ARCHITECTURE §1.1).** The core is plain TS behind the island; it
   ships no JS to the marketing surface and makes no network calls. Nothing here touches `.astro`.
3. **CSP is invisible in `npm run dev` (ARCHITECTURE §5, CLAUDE.md).** Every landing step that changes
   what the editor emits must pass `npm run build && npm run preview` and the e2e
   `securitypolicyviolation` guard, not just `npm run dev`. Prefer per-property CSSOM writes
   (`el.style.width = …`) over string `style=`/`cssText` — the former is CSP-exempt, the latter is not.

---

## 1. Current-state map (what E4 refactors, grounded in the code)

### 1a. The four gesture code paths that exist today, and which obey the golden rule

| Path | Location | Obeys golden rule? |
|---|---|---|
| **Sign drag** (move an element) | [`useDraggableElement.js`](../src/lib/useDraggableElement.js) | ✅ DOM-mutate `transform` during; single `onChange` on up |
| **Sign resize** (all handles) | [`DraggableWrapper.jsx`](../src/components/SignTool/DraggableWrapper.jsx) `handleResizeStart` (inline, ~250 lines) | ✅ `pendingResize` accumulator + CSSOM during; single `onChange` on up |
| **Sign create** (drag-drawn: whiteout/line/ellipse/rectangle) | [`useWorkspaceGestures.js`](../src/lib/useWorkspaceGestures.js) `handleOverlayPointerDown` | ❌ **dispatches `UPDATE_ELEMENT` per `pointermove`** |
| **Redact drag / resize / create** | [`PdfRedactTool.jsx`](../src/components/PdfRedactTool.jsx) `handleBoxDragStart` / `handleBoxResizeStart` / `handlePointerDown`+`drawingState` | ❌ **`updateElement` / `setDrawingState` per move** on all three |

**Finding that reshapes the ticket scope:** the ARCHITECTURE doc frames the divergence as "drag was
extracted, resize was inline." That is true for Sign, but the deeper reality is that **only Sign's
drag and resize obey the rule; Sign's *creation* path and *all three* Redact paths do not.** The
unified controller (E4.2) must therefore cover **create** as a first-class gesture, and E4.4 must move
Redact off its per-move dispatch — otherwise convergence would preserve a golden-rule violation.

### 1b. The resize math is physically duplicated (the E4.3 convergence target)

The per-handle, anchor-preserving shape-resize math exists **twice, near-verbatim**:

- [`DraggableWrapper.jsx:189-248`](../src/components/SignTool/DraggableWrapper.jsx) (whiteout/ellipse/rectangle branch).
- [`PdfRedactTool.jsx:452-508`](../src/components/PdfRedactTool.jsx) (`handleBoxResizeStart` onMove).

They already drifted once — the whiteout-resize-off-page regression (`ea10349`) was the Redact copy
lagging the Sign fix (`ca411be`). Both are now covered by the E1.5 invariants
(`DraggableWrapper.gestureInvariants.test.jsx`, `PdfRedactTool.test.jsx`), but the invariants only
*detect* drift; the registry (E4.3) *removes the ability to drift* by having one owner per type.

### 1c. Per-type resize/create behavior inventory (the registry's real contents)

The `type === 'line'` / `!isLine` / `isShape` / `symbol||signature` branching in
`handleResizeStart` and the `DRAG_DRAWN_TOOLS` list encode exactly these behaviors:

| Type | Handles emitted ([`ElementResizers.jsx`](../src/components/ElementResizers.jsx)) | Resize behavior | Create behavior |
|---|---|---|---|
| `text` | 4 corners | Scale `fontSize` by drag projected on box diagonal; adjust `left`/`top` to hold the anchor edge; RTL anchors via CSS `right`. `MIN/MAX_FONT_SIZE_PT`. | Click-place; `autoFocus`; inherits last text size/color/font/direction |
| `rectangle` / `ellipse` | 4 edges + 4 corners | Per-handle dimension cap vs anchor edge; `MIN/MAX_SHAPE_SIZE_PCT`; derives `left`/`top` from new dim on left/top handles | Drag-drawn; `ENSURE_MINIMUM_SIZE` on release |
| `whiteout` | 4 edges + 4 corners | **Same** as rectangle/ellipse (shared branch today) | Drag-drawn; own default color, **not** shape/text color |
| `symbol` | 4 corners | Center-anchored, aspect-ratio-locked; min **pixel** floor (`MIN_SYMBOL_WIDTH_PX`), `MAX_SYMBOL_SIGNATURE_WIDTH_PCT` | Click-place; square-ish via `ASPECT_RATIO_SYMBOL` |
| `signature` | 4 corners | Center-anchored, aspect-ratio-locked | Click-place (or dialog if none active) |
| `line` | `line-start` / `line-end` endpoint handles | Move the dragged endpoint only (no bbox); `MIN_LINE_LENGTH_PCT` reset on release | Drag-drawn from a point |

Geometry constants all live in [`signGeometry.js`](../src/constants/signGeometry.js); the registry
consumes them, it does not re-define them.

### 1d. The two element models are not the same shape (the E4.4 reconciliation)

- **Sign** uses the [`editorModel.ts`](../src/lib/editorModel.ts) union keyed on `type`
  (`whiteout`, `rectangle`, …).
- **Redact** stores `{ id, pageIndex, left, top, width, height, style, color }` where
  **`style` ∈ `blackout | blur | whiteout`** — a *different discriminant field*. `RedactBox.jsx`
  passes a rendering-only `type: 'whiteout'` shim so it can reuse `ElementToolbar`/clone, and
  `cloneWhiteoutElement` strips it back out ([`PdfRedactTool.jsx:389`](../src/components/PdfRedactTool.jsx)).

E4.4 must decide the unified model: most likely **fold Redact's `blackout`/`blur`/`whiteout` into the
`type` union** as first-class element types (each with its own registry entry), retiring the `style`
field and the shim. Redact whiteout then literally *is* the Sign `whiteout` type.

### 1e. The workspace substrate duplicated between the two tools

Both [`PdfSignTool.jsx`](../src/components/PdfSignTool.jsx) and
[`PdfRedactTool.jsx`](../src/components/PdfRedactTool.jsx) independently implement:

- **PDF load** with a monotonic `loadIdRef` race guard, a `loadStartedRef` first-wins claim, a 20s
  hang timeout, and draft-restore reconciliation (see the long comments around `loadPdf`).
- **Draft persistence** via [`useDraftPersistence.js`](../src/lib/useDraftPersistence.js) (Sign also has
  [`useSignDraftPersistence.js`](../src/components/useSignDraftPersistence.js)).
- **Fullscreen** (real + `pseudo-fullscreen` fallback) and **Escape precedence** while a modal is open.
- **Undo history** ([`actionHistory.js`](../src/lib/actionHistory.js),
  [`useUndoShortcut.js`](../src/lib/useUndoShortcut.js), `UndoHistoryModal`).
- **Download / continue-editing / start-over** flow and URL revocation.
- **Native share** of the baked PDF via [`usePdfShare.js`](../src/lib/usePdfShare.js) (added on `main`
  in `e2ab13b`, after this epic was scoped). This one is **already shared** — a single hook
  (`{ canSharePdf, shareReady, prepare, clearPrepared, sharePrepared, download, downloadPrepared }`)
  used by Sign (`SignToolbar`/`PdfWorkspace`), Redact (`RedactToolbar`), and the other tools alike.
  It is the *precedent* for what E4.4's substrate should look like: on-device only (Web Share API with
  a `File`; no bytes leave except to the OS share sheet the user explicitly taps — privacy-safe), and it
  deliberately splits `prepare()` (stash the async-generated `File`) from `sharePrepared()` (open the
  sheet from the *next* fresh tap, since `navigator.share()` requires a user gesture). **E4.4 must not
  regress this:** the converged output flow keeps the share/prepare split, the `canSharePdf && shareReady`
  gating of the button, and `clearPrepared()` on continue-editing/start-over. Do **not** fold share into
  the gesture controller — it is an output-flow concern, not a gesture. Reuse the hook as-is rather than
  re-implementing it inside the substrate.

Redact keeps its element list in local `useState`; Sign keeps it in the `SignToolContext` reducer
([`SignToolContext.jsx`](../src/components/SignTool/SignToolContext.jsx)). Convergence needs one
substrate that is agnostic to how the element list is stored.

---

## 2. Target module layout for `src/editor/` (plain TS, no Preact)

```
src/editor/
  model/
    element.ts          # re-exports/refines editorModel.ts union; add blackout/blur types (E4.4)
    document.ts         # EditorDocument: elements[], page sizes, helpers (add/update/delete/query)
    ids.ts              # uniqueId/seedUniqueId moved off sign.js (pure)
  geometry/
    coords.ts           # (already exists as src/lib/coords.ts — move here or re-export)
    bounds.ts           # per-handle anchor-preserving clamps as pure fns (from DraggableWrapper math)
    handles.ts          # Handle = 'top'|'right'|…|'line-start'|'line-end'; edge/anchor helpers
  gestures/
    controller.ts       # THE unified "imperative-during, commit-on-release" controller (E4.2)
    pointer.ts          # getPointerCoords + mouse/touch listener attach/detach (from usePdfCoordinates)
  registry/
    index.ts            # ElementTypeRegistry: type -> ElementModule (E4.3)
    text.ts  shape.ts  symbol.ts  signature.ts  line.ts  whiteout.ts  blackout.ts  blur.ts
  workspace/
    loadPdf.ts          # race-guarded loader + timeout (E4.4)
    substrate.ts        # shared load/render/draft orchestration seam (E4.4)
```

**Each registry `ElementModule`** (the ARCHITECTURE §3 shape `{ render, resizeBehavior, serialize, schema }`):

```ts
interface ElementModule<E extends EditorElement> {
  type: E['type'];
  schema: /* runtime validator / TS type guard for E */;
  create(ctx: CreateContext): E;            // point-place or drag-draw seed
  resizeBehavior: {
    handles: Handle[];                       // which handles ElementResizers renders
    // pure: given start geometry + handle + pointer delta (in page-% units) -> new geometry.
    // Owns its OWN per-handle bounds against that handle's true anchor edge. No shared
    // cross-handle post-processing (the exact failure mode of 434e844 / the whiteout regression).
    apply(start: E, handle: Handle, delta: Delta, page: PageRect): Partial<E>;
  };
  render(el: E, props): VNode;              // the Preact node (thin; wraps today's nodes/*.jsx)
  serialize(el: E, page, pdfCtx): void;     // bake into the pdf-lib page (from sign.js/redact.js)
}
```

Preact stays the render/event shell: `DraggableWrapper` calls `controller.start(...)` on
pointerdown and `registry[el.type].render(...)` for the body; it no longer contains gesture math.

---

## 3. E4.2 — Extract the framework-agnostic core + unified gesture controller — done

**Goal:** one "imperative-during, commit-on-release" controller unifying **drag, resize, and create**,
so they cannot diverge again (ARCHITECTURE §3.2, §4). Preact becomes a thin shell.

**Depends on:** E4.1 ✅, E0.1 ✅. Landed with the controller and pointer normaliser in
`src/editor/gestures/`; Sign drag, resize, and create use its listener lifecycle. Sign create now
renders imperatively during the gesture and commits one state patch on release.

### Scope
1. **Stand up `src/editor/geometry/` and `src/editor/gestures/pointer.ts`** by moving the pure parts of
   `usePdfCoordinates.js` and `coords.ts` down. Keep `usePdfCoordinates` as a thin hook wrapper so
   existing call sites don't churn in this step.
2. **Write `gestures/controller.ts`** — a framework-agnostic controller that, given a start descriptor
   (element snapshot, gesture kind, handle, page-wrapper rect getter, a `writeDOM(patch)` callback, and
   a `commit(patch)` callback), attaches mouse+touch move/up listeners, calls `writeDOM` per frame, and
   calls `commit` **exactly once** on release. This is the single chokepoint that enforces the golden
   rule. It contains no element-type math (that arrives in E4.3) — for E4.2 it just calls a passed-in
   `computePatch(delta)` function so the three current gestures can be routed through it unchanged.
3. **Route Sign drag + Sign resize through the controller.** Replace the bespoke
   `window.addEventListener` blocks in `useDraggableElement.js` and `DraggableWrapper.handleResizeStart`
   with `controller.start(...)`. Behavior identical; the accumulator/commit pattern is now shared code.
4. **Route Sign create through the controller.** `useWorkspaceGestures.handleOverlayPointerDown`
   currently dispatches per move — this is the golden-rule fix. Create the element once (`ADD_ELEMENT`),
   then drive the drag-draw sizing via the controller's `writeDOM` (mutating the just-added node), and
   `commit` the final geometry once on release (still followed by `ENSURE_MINIMUM_SIZE`).

### Acceptance
- A temporary `console.count` in each `commit`/`onChange` ticks **once per gesture**, for drag, resize,
  **and create** (the last one is a new guarantee — verify it explicitly; it fails today).
- Full unit + `gestureInvariants` + `interaction` suites green with **no source math changes** — the
  math is moved, not rewritten. The E1.5 invariants still pass (they now test the controller path).
- Sign e2e (`e2e/sign/`) green; `npm run build && npm run preview` CSP pass; zero
  `securitypolicyviolation`.
- Draft autosave/restore still correct (the controller must not disturb the `status === 'editing'`
  autosave debounce).

### Risks
- **Touch listeners use `{ passive: false }`** for `preventDefault` on `touchmove` — the controller must
  preserve that exact option or mobile scroll-during-draw regresses.
- **`elementRef` ownership:** `DraggableWrapper` owns `elementRef` because Floating UI also needs it
  (§ the comment at `DraggableWrapper.jsx:56`). The controller receives the node via callback; it must
  not try to own or create it.
- **Do not introduce a store/signal for live state** (ARCHITECTURE §1.2 anti-pattern). The controller's
  live state is plain locals/refs, exactly as today.

---

## 4. E4.3a/E4.3b — Per-element-type registry

**E4.3a goal:** each type owns its resize behavior in `src/editor/registry/<type>.ts`; the
`type === 'line'` / `isShape` / `symbol||signature` branching in `handleResizeStart` disappears.
**E4.3b goal:** extend the same modules with `{ create, render, serialize, schema }`, retiring the
`DRAG_DRAWN_TOOLS` list and Sign creation/render/bake type branches. This split keeps the already
valuable geometry boundary independently shippable.

**Depends on:** E4.2.

### Scope
1. **Create `src/editor/registry/` with one module per type** (§1c is the full behavior spec). Move the
   per-branch math out of `DraggableWrapper.handleResizeMove` into each type's `resizeBehavior.apply`.
2. **`DraggableWrapper` looks up the registry** by `el.type` instead of branching. `ElementResizers`
   reads `registry[type].resizeBehavior.handles` to decide which handles to render (replacing its
   `isShape`/`isLine` props).
3. **The controller (E4.2) calls `registry[type].resizeBehavior.apply(...)`** as its `computePatch`.
   No shared function post-processes geometry across handles or types.

### Acceptance (sharpened by the whiteout post-mortem — ARCHITECTURE §5)
- **No shared function post-processes geometry across handles or types.** Each `resizeBehavior` owns its
  own per-handle bounds against that handle's true anchor edge. Verify by the E1.5 meta-guard: a
  deliberately reintroduced blanket left/top clamp in one type's module must **not** affect another
  type, and must trip that type's own anchor test.
- Every type's `resizeBehavior` is covered by the E1.5 invariants ((a) move changes only position,
  (b) resize preserves the anchor edge, (c) zero-delta resize is a no-op) on a realistic mocked
  page-wrapper rect (never a 0×0 rect).
- Adding a *hypothetical* new type touches only new files (demonstrate with a throwaway type in a test,
  or argue it structurally in the PR).
- **The Sign shape-resize math now has one owner.** After E4.3,
  `git grep -l "maxWidthFromRightGrowth\|maxHeightFromBottomGrowth" -- 'src/**'` must no longer list
  `DraggableWrapper.jsx` — its shape branch is gone, replaced by a registry lookup. (Redact's copy in
  `PdfRedactTool.jsx` is retired in E4.4; E4.3 gets Sign down to the single registry owner + Redact's
  lingering copy = 2 files, and E4.4 finishes the job at 1.)
- Sign e2e + build/preview CSP pass unchanged.
- **Controller purity (do not let the abstraction erode):** `computePatch` is side-effect-free and
  returns the patch; `writeDOM(patch)` performs every CSSOM/SVG write. A no-op `writeDOM` with painting
  done inside `computePatch` (the transitional state in `DraggableWrapper.jsx`) is not an acceptable
  end state — it degrades `startGesture` to a listener-attach shim.
- **Touch scroll:** `startGesture` sets `{ passive: false }` but does not itself call `preventDefault`;
  each caller's `computePatch` must prevent default during the gesture. Verify in `e2e/sign/`.

### E4.3b follow-on scope

Each module gains `create` (point-place and drag-draw seeds), `render` (wrapping the current node
components), `serialize` (the existing `sign.js` bake behavior), and `schema`. `useWorkspaceGestures`,
`PdfWorkspace`, and `sign.js` then select the registry entry instead of branching on `type`.

### Risks
- **Text is the odd one out:** it resizes `fontSize`, not `width`/`height`, and re-derives `left`/`top`
  from a measured rect, and RTL anchors via CSS `right`. Its `resizeBehavior.apply` needs the measured
  start size + direction in its context, not just numeric geometry. Keep that measurement read-only at
  pointer-down (ARCHITECTURE §5 "measure-then-mutate drift").
- **Symbol's min-size floor is in *pixels*, not %** — the module must receive the page-wrapper rect to
  convert, exactly as `getWidthPercent(MIN_SYMBOL_WIDTH_PX, …)` does today.
- **`symbolType` legacy alias** (`cross` → `x`) and the `mark` field: keep the module tolerant of both
  when reading, emit only `mark` when writing.

---

## 5. E4.4 — Converge Sign and Redact onto the core + shared substrate

**Goal:** Sign and Redact share the editor core and one PDF-workspace substrate (load, page render,
draft persistence), removing today's duplication (§1e) and moving Redact onto the golden rule (§1a).

**Depends on:** E4.2, E4.3b.

### Scope
1. **Reconcile the models (§1d).** Fold Redact's `blackout` and `blur` into the `type` union as
   first-class element types with their own registry modules (`render` = the tinted/blurred box,
   `serialize` = the flatten-page bake from `redact.js`, `resizeBehavior` = the shared box behavior,
   8 handles). Redact `whiteout` becomes the existing `whiteout` type. Retire the `style` field and the
   `type: 'whiteout'` rendering shim in `RedactBox.jsx`/`cloneWhiteoutElement`.
2. **Extract `workspace/loadPdf.ts` + `workspace/substrate.ts`** from the two near-identical loaders
   (race guard, first-wins claim, 20s timeout, restore reconciliation). Both tools call the shared
   loader; each keeps its own status/UI.
3. **Move Redact's gestures onto the controller + registry** (this is where the §1a golden-rule
   violation is fixed): Redact drag/resize/create stop calling `updateElement`/`setDrawingState` per
   move and go through `controller.start(...)` with DOM mutation during and a single commit on release.
   Redact's element store stays `useState` (or optionally adopt the reducer) — the controller commits
   through whatever `commit` callback the tool passes, so the substrate stays store-agnostic.
4. **Unify draft persistence** so both tools use one hook path; keep tool-keyed IndexedDB drafts
   (`draftStore.js` keys by tool name) and the flagship crash-recovery behavior intact
   (CLAUDE.md draft-persistence section — do not regress the on-device guarantee).

### Acceptance
- Redact drag/resize/create each `commit` **once per gesture** (verify with `console.count`; fails
  today on all three). Redact e2e (`e2e/redact/`) green, including the page-edge-bound and
  8-handle cases.
- **The duplicated resize math (§1b) exists in exactly one place.** Concrete, falsifiable check
  (baseline today = **2 files**): the anchor-cap identifiers that fingerprint this math must resolve to
  a single owner module —
  ```
  git grep -l "maxWidthFromRightGrowth\|maxHeightFromBottomGrowth" -- 'src/**'
  ```
  must list **exactly one** file after E4.4, and it must be the shared box `resizeBehavior`
  (`src/editor/registry/` or `src/editor/geometry/bounds.ts`), **not** `PdfRedactTool.jsx` or
  `DraggableWrapper.jsx`. Both `PdfRedactTool.handleBoxResizeStart` and the `DraggableWrapper` shape
  branch are deleted, not merely re-pointed. Wire this grep as a one-line CI guard (extend
  `scripts/verify-csp.js` or a sibling `scripts/` check) so the duplication cannot silently return —
  the same "invariant as CI, not prose" posture as the CSP/CSS guards (ARCHITECTURE §6).
- Both tools' draft autosave/restore, undo history, fullscreen/Esc precedence, and download flow behave
  as before (regression-tested via existing suites + `draftRestoreRace.test.jsx`).
- **Native share is preserved** (§1e): both tools still expose the share button gated on
  `canSharePdf && shareReady`, still use the `prepare()`/`sharePrepared()` split, and still
  `clearPrepared()` on continue-editing/start-over. `usePdfShare.js` is reused unchanged, not
  re-implemented; the existing `PdfSignTool.test.jsx` / `PdfRedactTool.test.jsx` share cases stay green.
- Redact bake-out (flatten page to raster for blackout/blur, opaque fill for whiteout) is byte-for-byte
  behavior-preserving — `redact.js`'s scale-2.5 flatten path moves into the `serialize` of the
  blackout/blur/whiteout modules unchanged.
- `npm run build && npm run preview` CSP pass; zero `securitypolicyviolation` on both tools.

### Risks
- **Redact's bake is page-level, Sign's is element-level.** `redact.js` rasterizes whole pages that
  contain any redaction; `sign.js` draws each element onto the page. `serialize` per type is the right
  seam, but blackout/blur `serialize` must cooperate at the *page* level (a page-scoped pass that
  collects its boxes), not purely per element. Design `serialize` to receive a page-serialization
  context so a type can opt into the page-flatten path. Do **not** silently change redaction
  permanence — flattening is the security property (text is destroyed, not covered).
- **Whiteout means two slightly different things today:** Sign whiteout is an opaque fill drawn onto the
  live PDF; Redact whiteout participates in the page flatten. Confirm the merged `whiteout.serialize`
  produces the same visual/again-destructive result in both tools, or keep two serialize strategies
  behind one type with a flag. Decide this explicitly, with a maintainer visual pass.
- **Undo models differ subtly:** both log creation + deletion(snapshot) entries, but Sign's lives in the
  reducer (`UNDO` case) and Redact's in local state. Keep them behaviorally identical; don't force a
  single store in this ticket if it balloons scope — the substrate only needs the load/render/draft
  parts unified.

---

## 6. Sequencing & per-ticket guardrail (every step)

```
E4.1 ✅ ── E4.2 ✅ ── E4.3a ✅ ── E4.3b ✅ ── E4.4 ✅
```

Each ticket lands independently behind a working editor. For **every** step:

1. `npm test` green (watch tests that assert literal `.sign-*` class strings —
   `SignToolbar.test.jsx`, `DraggableWrapper.test.jsx`, `DraggableWrapper.interaction.test.jsx`,
   `*.gestureInvariants.test.jsx`).
2. `npm run typecheck` (`astro check`) — the core is TS; keep `src/editor/**` 100% clean. (Note the two
   pre-existing `index.astro` typecheck errors from E4.1 are unrelated and tracked in E6.)
3. `npm run test:e2e` green (Sign + Redact browser guardrails).
4. **`npm run build && npm run preview`** CSP/hydration pass — mandatory, `npm run dev` cannot catch the
   CSP class (ARCHITECTURE §5). Then hand to the maintainer for a visual pass in their own preview on
   4322 (per project convention — do not start a preview server yourself).
5. A temporary `console.count` proof that each touched gesture commits **once per gesture**.

---

## 7. Consolidated risks & gotchas (do not relearn these)

- **The golden rule applies to create, not just drag/resize** (§1a). This is the single most important
  correction to the ARCHITECTURE framing: three of the four/six current gesture paths violate it. The
  controller is the fix and its once-per-gesture commit must be *tested*, not assumed.
- **Per-handle bounds, never shared cross-handle post-processing** (§4 acceptance, ARCHITECTURE §5).
  This regression already shipped once (`434e844` blanket clamp) and re-shipped in Redact (`ea10349`).
  The registry structurally prevents it; the E1.5 meta-guard proves it.
- **Two element models, two discriminant fields** (§1d) — Redact `style` vs union `type`. Reconcile in
  E4.4; don't paper over it with more shims.
- **RTL text anchors via CSS `right`, and `element.left` is "the anchored edge"** — not always the
  physical left edge (`editorModel.ts` BoxGeometry comment, `DraggableWrapper.jsx:358-388`). Any
  geometry code that assumes `left` is the visual left will break RTL text drag/resize.
- **Measure read-only at pointer-down, never in a render effect** (ARCHITECTURE §5 measure-then-mutate).
  Text drag/resize both capture the measured rect once at gesture start — preserve that.
- **CSSOM vs `style=` for CSP** (§0.3): per-property writes are exempt; string style attributes are not.
  The controller's `writeDOM` must use `el.style.width = …` / `.transform = …` / SVG `setAttribute`,
  exactly as today.
- **Touch `{ passive: false }`** must survive the controller extraction or drawing scrolls the page on
  mobile.
- **Redaction is destructive by design** (§5 risk) — the page-flatten is the security property. Do not
  turn it into a cosmetic overlay during convergence.
- **Draft persistence is a flagship, on-device feature** (CLAUDE.md) — the substrate extraction must not
  weaken the 14-day IndexedDB draft, the visibilitychange/pagehide flush, or the first-wins restore
  race guard. `draftRestoreRace.test.jsx` is the canary.
```
