# ARCHITECTURE.md - Design & Architecture Standard

This is the forward-looking design standard for PDkef: the target architecture the codebase
is migrating toward, and the boundaries every change must respect. It is the "north star."

- **What/why the product is** → [PRODUCT.md](./PRODUCT.md) (voice, origin, positioning).
- **How to work in the repo today** (commands, current tool status, gotchas) → [CLAUDE.md](./CLAUDE.md).
- **The backlog that gets us there** (epics, tickets, sequencing) → [scrum.md](./scrum.md).

This document supersedes the former `TAILWIND_MIGRATION_LEARNINGS.md`; its still-true lessons
are folded in below (see "Gesture golden rule" and "Known hazards").

---

## 1. The two invariants that constrain every change

Everything below is subordinate to these. If a change threatens either, it is wrong by definition.

### 1.1 The SEO / privacy shell is sacred - and it is also our biggest architectural asset

- Marketing, how-it-works, FAQ, and JSON-LD are authored in `.astro` and **rendered at build
  time as static HTML with zero JS shipped**. Crawlers see everything without executing scripts.
- **No file bytes ever leave the device.** No `fetch`/`XHR` of PDF contents, no third-party API,
  no server (there isn't one). CSP `connect-src 'self'` is the browser-enforced backstop.
- Because the static content and the interactive tools are separated by the Astro **island wall**,
  the entire editor can be re-architected freely **without any risk to SEO or privacy**. Lean on
  this: keep the wall, and editor refactors stay cheap and safe.
- **Off the table:** SSR, moving marketing content into JS, any external `connect-src`, anything
  that ships JS to the SEO surface.

### 1.2 The gesture hot path stays as it is - it is already correct

Dragging/resizing PDF elements needs 60fps real-time feedback. The production pattern achieves it by
keeping the framework out of the loop during a gesture:

- **During the gesture (`pointermove`):** mutate the DOM directly
  (`elementRef.current.style.transform = ...` / `.width` / SVG `x1/y1`…). No React state per frame.
- **On release (`pointerup`):** dispatch **one** state update (`onChange`) with the final
  percentage-based coordinates, then clear the inline overrides so state resumes control.
- React state is the single source of truth **between** gestures, never **during** one.

**Do not** introduce a store (Zustand/Redux/signals) for live gesture state - routing high-frequency
pointer events through reactive state is what caused the historical "reconciliation thrash." This is
non-negotiable and applies equally to drag **and** resize (see the golden rule in §4).

---

## 2. The core diagnosis this architecture responds to

The recurring pain - *"adding a feature breaks an unrelated part"* - is not a CSS-framework problem.
It is the signature of **missing enforced boundaries**:

1. A single ~3,400-line `global.css` - one shared cascade namespace where any change can collide.
2. God-components that branch on concrete element type (`type === 'line'` / `!isLine`) - adding a
   type means editing the monolith.
3. Untyped shared state - breakage surfaces at runtime in an unrelated tool, not at edit time.
4. Invariants (CSP, SEO, the gesture rule) kept as **prose** - they're remembered, not enforced.

The target below makes every boundary either **scoped-by-construction** or **compiler-enforced**.

---

## 3. Layered target architecture

| Layer | Rule | Why |
|---|---|---|
| **Tokens** | The *only* global CSS is `:root` design tokens (colors, spacing, type). | Removes the shared-cascade namespace that is the #1 "change X breaks Y" source. |
| **Styling** | Static/marketing → **Tailwind utilities**. Interactive + editor → **CSS Modules colocated per component**. Dynamic geometry → inline styles / CSS custom properties. | Right tool per surface; scoping makes cross-component breakage structurally impossible. |
| **Editor core** | A framework-agnostic `editor/` core (plain TS, no Preact) owns the document model, geometry math, and gesture controllers. Preact is a thin render/event shell over it. | Testable without a DOM renderer; reusable across Sign **and** Redact; unifies drag+resize. |
| **Element registry** | Each element type is a module `{ render, resizeBehavior, serialize, schema }` in a registry - no `switch`. | Adding a type touches only new files. Direct fix for "new feature breaks old feature." |
| **Types** | TypeScript on the model, geometry, and core first; UI follows. | Compiler catches breakage at edit time instead of at runtime in an unrelated tool. |
| **Guardrails** | CSP, SEO, CSS-budget, and editor-state invariants are **CI checks**, not docs. | Maintainability stays fixed only when invariants are enforced. |

### 3.1 The styling boundary (the rule people will be tempted to break)

- **Tailwind** for `.astro` pages, cards, heroes, footer, dropzones, static buttons - no runtime
  state, no cascades. This is where utility-first genuinely shines.
- **CSS Modules** (preferred over `@apply`) for `SignTool/*`, `RedactTool`, `ElementToolbar`,
  resizers, and element nodes. Keep semantic class names (`.sign-element`, `.active`,
  `.sign-element-actions`) so **descendant-combinator state cascades survive as real CSS inside
  module scope**. CSS Modules give true scoping and colocation; `@apply` scatters editor styling
  back into a global file and drifts from the JSX.
- **Inline styles / CSS custom properties** for per-element geometry
  (`top/left/width/height/fontSize` percentages). These are continuous runtime floats and **cannot**
  be Tailwind utilities (the JIT only emits classes it sees at build time - there is no
  `top-[43.7%]` for an arbitrary value). Optionally consolidate them behind custom properties
  (`--el-top`, `--el-left`) so committed state and in-gesture overrides share one code path.

**The one styling rule to remember:** the editor's stateful/cascade appearance is **never** expressed
as inline conditional utility strings. State lives once (a class on the parent); CSS fans it out.

### 3.2 The editor core (the step-function change)

Today the editor is already well-decomposed on the JS side - extracted hooks
(`useDraggableElement.js`, `usePdfCoordinates.js`, `useWorkspaceGestures.js`), a context
(`SignToolContext.jsx`), per-type node components (`SignTool/nodes/*`), and centralized geometry
constants (`constants/signGeometry.js`). The gap is that these are Preact-coupled and the **drag path
is extracted into a hook while the resize path is still inline** in `DraggableWrapper.jsx` - the very
asymmetry that let the two diverge in performance.

Target: consolidate into a headless `editor/` core (plain TS) that owns:

- **Document model** - elements as typed data; one schema per element type.
- **Geometry math** - pure functions, seeded from `usePdfCoordinates` + `signGeometry` constants.
- **Gesture controllers** - drag, resize, and create behind **one** "imperative-during,
  commit-on-release" abstraction, so both paths follow the golden rule and can never drift again.

Preact then only renders from state and binds events to the core. Sign and Redact share the core and
a common PDF-workspace substrate (load, page render, draft persistence), removing today's duplication.

---

## 4. Gesture golden rule (folded from the retired learnings doc)

> During a gesture, mutate the DOM directly for real-time feedback. Commit React state **once**, on
> release. Never route continuous drag/resize through reactive state.

- ✅ `handlePointerMove` writes `element.style.transform` (drag) or `.width/.height/.left/.top`
  and SVG `x1/y1/x2/y2` (resize) directly; accumulates the final value in a local.
- ✅ `handlePointerUp` calls `onChange(final)` exactly once, then clears inline overrides.
- ❌ Calling `onChange(...)` inside `pointermove` (per-pixel state dispatch) - this is the
  reconciliation thrash. Historically the **drag** path obeyed the rule but the **resize** path did
  not; unifying them under one controller (§3.2) is what makes the rule structural rather than
  a convention two code paths can violate independently.

---

## 5. Known hazards (fold-in of hard-won lessons - do not relearn these)

- **Invisible floating toolbars.** Replacing the semantic cascade
  (`.sign-element.active .sign-element-actions`) with naive utilities produced white text on a
  transparent background inside a white container. Keep active-state visibility in CSS (§3.1).
- **CSP is invisible in dev.** Astro's `security.csp` (auto-hashing of inline scripts/styles) does
  **not** run in `astro dev` - only in `build`/`preview`/production. Any change to styles, scripts,
  `astro.config.mjs`, or `vercel.json` **must** be verified with `npm run build && npm run preview`.
  A silently-blocked hydration bootstrap looks fine (static HTML renders) but the island never
  hydrates. Do not add `script-src`/`default-src` back into the `vercel.json` header CSP - policies
  intersect, and a second `default-src 'self'` re-blocks scripts the meta tag allows.
- **`legacy-peer-deps` is a smell, not a fix.** Astro is pinned to `^7.0.3` on purpose (security
  advisories cover every version through 7.0-beta). Any tool that forces `legacy-peer-deps` to
  install must be re-audited against that pin before adoption - don't silence peer resolution.
- **Floating UI feedback loops & measure-then-mutate drift.** Toolbar placement is delegated to
  Floating UI deriving position from the anchor rect only (never its own already-positioned rect),
  and gesture-time measurement is read-only at pointer-down (never in a render effect). These
  prevent the "toolbar freaking out near the top edge" and the draft-restore sizing drift. Preserve
  the pattern when refactoring `DraggableWrapper` / the toolbar.

---

## 6. Executable guardrails (the invariants become CI, not prose)

1. **CSP hash gate** - on `build && preview`, verify the generated `<meta>` CSP still covers every
   emitted inline script/style (sha256+base64), per CLAUDE.md's method.
2. **SEO invariants test** - exactly one `<h1>` per page; `<title>`, meta description, canonical,
   OG/Twitter present; JSON-LD (`SoftwareApplication` + `FAQPage`) validates; FAQ schema matches
   on-page content.
3. **CSS budget guard** - a bundle-size check (reuse the `check-css-bundle.js` scaffolding from the
   paused branch) so the monolith can't silently regrow.
4. **Editor interaction tests** - the states unit tests miss: active outline, floating-toolbar
   visibility + top-edge flip, RTL toolbar alignment + leftward growth, dark mode, mobile full-width
   toolbar, whiteout bounds.

---

## 7. Anti-patterns (a change doing any of these is wrong)

- Routing live drag/resize through React state / a store (§1.2, §4).
- Expressing editor active/selection state as inline conditional utility strings instead of a CSS
  cascade (§3.1).
- Trying to encode per-element runtime geometry as Tailwind classes (§3.1).
- Adding a `script-src`/`default-src` to the `vercel.json` header CSP (§5).
- Deleting semantic `.sign-*` cascades without verifying every conditional state
  (active, RTL, dark, mobile, whiteout) in a **running** editor (§5).
- Landing a styles/scripts/config change without a `build && preview` CSP pass (§5).
- Introducing a dependency that forces `legacy-peer-deps` without re-auditing the Astro pin (§5).

---

## 8. Migration posture (details in [scrum.md](./scrum.md))

Value-first, low-risk ordering: (0) land the isolated resize perf fix on `main`; (1) stand up the
guardrails so risky work is caught; (2) tokens + scoped CSS Modules to kill the global monolith;
(3) Tailwind on the static surface; (4) the headless TS editor core + element registry, converging
Sign and Redact. The SEO island shell and the gesture hot path are untouched throughout, and every
step ships independently behind a working editor.
