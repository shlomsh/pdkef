/*
 * Canonical backlog data for scrum-board.html.
 *
 * Edit this file to add, update, or close scrum work. The board reads it
 * directly, including when scrum-board.html is opened from the filesystem.
 * scrum.md is retained as narrative architecture history, not board data.
 */
(() => {
const LANES = {
  A: { name: "Lane A - Now",            color: "var(--lane-A)", desc: "Stabilize & de-risk; start immediately, no deps." },
  B: { name: "Lane B - Guardrails gate", color: "var(--lane-B)", desc: "Parallel; these gate the risky work in E2–E4." },
  C: { name: "Lane C - Styling",         color: "var(--lane-C)", desc: "Kill the global CSS monolith (parallel with D, E)." },
  D: { name: "Lane D - Tailwind static", color: "var(--lane-D)", desc: "Tailwind on the static/marketing surface." },
  E: { name: "Lane E - Editor core",     color: "var(--lane-E)", desc: "Headless TS editor core; internally serial." },
  X: { name: "Postponed",                color: "var(--lane-X)", desc: "Off the migration critical path (E6)." }
};

const EPICS = [
  { id: "E0", name: "Stabilize & de-risk", goal: "Start immediately, no deps." },
  { id: "E1", name: "Guardrails",          goal: "Parallel; these gate the risky work in E2–E4." },
  { id: "E2", name: "Kill the global CSS monolith", goal: "Lane C, parallel with E3." },
  { id: "E3", name: "Tailwind on the static surface", goal: "Lane D, parallel with E2." },
  { id: "E4", name: "Headless TS editor core", goal: "Lane E, internally serial, parallel to E2/E3." },
  { id: "E5", name: "Documentation",       goal: "Mostly done this session." },
  { id: "E6", name: "Carried-over backlog", goal: "Postponed, off the migration critical path." },
  { id: "E7", name: "Finish the headless convergence", goal: "Post-audit hardening; close the architecture gaps." },
  { id: "E8", name: "Post-assessment cleanup", goal: "From the 2026-08-08 repo health assessment. Every item is a fork of one idea, or a guard that does not reach far enough." }
];

const TICKETS = [
  // ----- E0 -----
  { id: "E0.1", epic: "E0", lane: "A", status: "done", priority: "high",
    title: "Land the resize perf fix on main",
    dependsOn: [],
    acceptance: "Re-apply the gesture portions of commit c4583df (pendingResize accumulator + direct DOM mutation during move, single onChange on pointerup) into DraggableWrapper/ElementResizers/TextNode, excluding the Tailwind className edits. Acceptance: drag AND resize stay smooth; a temp console.count in onChange ticks once per gesture, not per frame; draft autosave/restore still correct; build && preview CSP pass." },
  { id: "E0.2", epic: "E0", lane: "A", status: "done", priority: "normal",
    title: "Retire tailwind-refactor-wip",
    dependsOn: ["E0.1"],
    acceptance: "First rescue reusable pieces (index.astro utility patterns, tailwind.config.mjs, check-css-bundle.js scaffolding) by tagging the branch archive/tailwind-wip-2026-07, then delete it so no one resumes the tangled branch in place." },

  // ----- E1 -----
  { id: "E1.1", epic: "E1", lane: "B", status: "done", priority: "normal",
    title: "CSP hash-verification CI gate",
    dependsOn: [],
    acceptance: "On build && preview, diff the generated <meta> CSP hash list against every emitted inline script/style (sha256+base64), per CLAUDE.md's method. Fail CI on mismatch." },
  { id: "E1.2", epic: "E1", lane: "B", status: "done", priority: "normal",
    title: "SEO invariants test",
    dependsOn: [],
    acceptance: "Assert exactly one <h1> per page; <title>, meta description, canonical, OG/Twitter present; JSON-LD (SoftwareApplication + FAQPage) validates; FAQ schema matches on-page FAQ." },
  { id: "E1.3", epic: "E1", lane: "B", status: "done", priority: "normal",
    title: "CSS budget guard",
    dependsOn: [],
    acceptance: "Port check-css-bundle.js from the archived branch into CI so the global stylesheet can't silently regrow past a threshold." },
  { id: "E1.4", epic: "E1", lane: "B", status: "done", priority: "normal",
    title: "Editor interaction/visual test harness",
    dependsOn: [],
    acceptance: "Cover the states unit tests miss: active outline, floating-toolbar visibility + top-edge flip, RTL toolbar alignment + leftward growth, dark mode, mobile full-width toolbar, whiteout bounds." },
  { id: "E1.5", epic: "E1", lane: "B", status: "done", priority: "high",
    title: "Per-type gesture invariants + non-vacuous geometry harness",
    dependsOn: [],
    acceptance: "Done. Sign and Redact gesture invariants cover resizable types on realistic mocked page-wrapper rects, including blackout and blur after they gained the 8-handle path." },
  { id: "E1.6", epic: "E1", lane: "B", status: "done", priority: "high",
    title: "Playwright browser guardrails for editor layout",
    dependsOn: ["E1.4", "E1.5"],
    acceptance: "Done. One lean Sign browser guardrail and one lean Redact browser guardrail run against production preview via npm run test:e2e. Redact covers blackout/blur/whiteout handles, delete control behavior, whiteout fill/default, and page-bound drag/resize." },
  { id: "E1.6a", epic: "E1", lane: "B", status: "done", priority: "normal",
    title: "Wire Playwright e2e into CI",
    dependsOn: ["E1.6"],
    acceptance: "Done. CI installs Chromium, runs npm run test:e2e, and uploads Playwright artifacts on failure." },
  { id: "E1.7", epic: "E1", lane: "B", status: "done", priority: "high",
    title: "Runtime CSP style-attribute guard",
    dependsOn: ["E1.6"],
    acceptance: "Done. Runtime style-attribute CSP posture decided and source fixed; Sign and Redact e2e install securitypolicyviolation listeners and assert zero violations." },
  { id: "E1.7a", epic: "E1", lane: "B", status: "done", priority: "normal",
    title: "Build-time no literal style= in dist guard",
    dependsOn: ["E1.7"],
    acceptance: "Done. scripts/verify-csp.js fails on any literal style attribute in dist HTML, complementing the browser CSP guard." },

  // ----- E2 -----
  { id: "E2.1", epic: "E2", lane: "C", status: "done", priority: "normal",
    title: "Tokens as the only global CSS",
    dependsOn: [],
    acceptance: "Done. Theme-chrome color literals were audited and routed through design tokens where appropriate; annotation/pen defaults intentionally remain tool data literals." },
  { id: "E2.2", epic: "E2", lane: "C", status: "done", priority: "normal",
    title: "Colocate non-editor CSS into CSS Modules",
    dependsOn: ["E2.1"],
    acceptance: "DONE: E2.2b re-implemented the durable module artifacts and class swaps on main (a825e33), retaining share wiring and module-class assertions. The discarded branch-merge approach must not be reopened." },
  { id: "E2.3", epic: "E2", lane: "C", status: "done", priority: "normal",
    title: "Migrate editor .sign-*/.sig-* styles into scoped CSS Modules",
    dependsOn: ["E2.1", "E1.4"],
    acceptance: "DONE: editor surface, controls/popovers, dialogs, confirmations, and Redact's shared element seam migrated to colocated CSS Modules (EditorControls, EditorElement, SignatureDialog). Runtime/test class selectors replaced with semantic data attributes; descendant cascades preserved as real module CSS. 0 live .sign-*/.sig-* selectors left in global.css, enforced by scripts/check-editor-global-css.js. Verified: 312 unit tests, test:css, build, csp, e2e." },
  { id: "E2.4", epic: "E2", lane: "C", status: "done", priority: "low",
    title: "Clean up two small leftovers surfaced by E2.2",
    dependsOn: ["E2.2"],
    acceptance: "DONE: a48180f colocated the PdfToImage quality-preset tooltip chrome and removed the zero-consumer .list-hint selector." },
  { id: "E2.5", epic: "E2", lane: "C", status: "done", priority: "high",
    title: "BUG: Restore desktop width parity for every BasePdfTool card",
    dependsOn: ["E2.2"],
    acceptance: "DONE: restored the min-width:768px full-width/flex-shrink contract in PdfTool.module.css. e2e/merge/merge-layout.spec.js asserts the card fills #app while the dropzone remains correctly inset in a production preview." },
  { id: "E2.6", epic: "E2", lane: "C", status: "done", priority: "normal",
    title: "BUG: Give native Share buttons a deliberate icon-label gap",
    dependsOn: ["E2.2"],
    acceptance: "DONE: .pdf-share-button now uses a centered inline-flex row with var(--space-2) gap. The Merge production-preview guard exports two PDFs and asserts its computed layout without changing native-share behavior." },

  // ----- E3 -----
  { id: "E3.1", epic: "E3", lane: "D", status: "done", priority: "normal",
    title: "Clean Tailwind install (audit)",
    dependsOn: [],
    acceptance: "DONE: tailwindcss + @tailwindcss/vite@^4.3.2 installed cleanly against Astro ^7.0.3 with no legacy-peer-deps or new npm-audit vulnerabilities. Landed on main as part of E3.2 using the Vite plugin plus a project-scoped CSS-first theme and utilities-only import; Preflight and Tailwind's unused default palette remain excluded." },
  { id: "E3.2", epic: "E3", lane: "D", status: "done", priority: "normal",
    title: "Migrate the marketing .astro surface to utilities",
    dependsOn: ["E3.1", "E1.1", "E1.2"],
    acceptance: "DONE: the E3.1 scaffold, FeatureCard, Footer, ToolHero, AppBar, tool-page content cards, home first-fold/tool-grid structure and tile interactions, Why/Autosave/offline/open-source sections, licenses, and 404 are migrated. Generated CSS is 80,871 / 82,000 bytes. The home grid tooltip and its delayed reveal/arrow are the approved scoped exception. JSX and test sources are excluded from Tailwind scanning because the editor has no Tailwind surface. No editor components. Keep npm run test:css as a per-slice gate." },
  { id: "E3.3", epic: "E3", lane: "D", status: "done", priority: "high",
    title: "Align the shared tool hero with the app-bar breadcrumb grid",
    dependsOn: ["E3.2"],
    acceptance: "DONE: ToolHero now uses the AppBar's 1080px desktop grid and 24px inset. e2e/tool-layout.spec.js checks grid/leading-row alignment on Merge, Split, Compress, PDF to Image, Image to PDF, Unlock, Sign, Redact, and Edit PDF in a production preview." },

  // ----- E4 -----
  { id: "E4.1", epic: "E4", lane: "E", status: "done", priority: "normal",
    title: "Introduce TypeScript",
    dependsOn: [],
    acceptance: "Done. Added TypeScript tooling, introduced the editor model union in src/lib/editorModel.ts, and renamed coords.js to coords.ts with zero logic change." },
  { id: "E4.2", epic: "E4", lane: "E", status: "done", priority: "normal",
    title: "Extract a framework-agnostic editor/ core",
    dependsOn: ["E4.1", "E0.1"],
    acceptance: "Done. Added the framework-free gesture controller and pointer normaliser. Sign drag, resize, and creation now share its listener lifecycle; creation paints directly during movement and commits one state patch on release." },
  { id: "E4.3a", epic: "E4", lane: "E", status: "done", priority: "normal",
    title: "Per-element-type resize registry",
    dependsOn: ["E4.2"],
    acceptance: "DONE: each type owns its registry resize behavior; box geometry shares editor/registry/boxResize.ts as the single owner (CI-guarded via the anchor-cap fingerprint). No shared cross-family post-processing." },
  { id: "E4.3b", epic: "E4", lane: "E", status: "done", priority: "normal",
    title: "Per-element create/render/serialize registry",
    dependsOn: ["E4.3a"],
    acceptance: "DONE: each registry module now carries create, render, serialize, and schema; signPdf is a registry dispatch loop with no bake-out type branching." },
  { id: "E4.4", epic: "E4", lane: "E", status: "done", priority: "normal",
    title: "Converge Sign and Redact",
    dependsOn: ["E4.2", "E4.3b"],
    acceptance: "DONE: Redact's style model retired (blackout/blur/whiteout are first-class registry types on the flat type discriminant); Redact gestures route through the shared controller (commit once on release); duplicate resize math removed (single boxResize.ts owner); shared PDF-load substrate in editor/workspace/loadPdf.ts + useEditorDraftPersistence.js consumed by both tools. 342 unit tests, e2e 7/7." },

  // ----- E5 -----
  { id: "E5.1", epic: "E5", lane: "X", status: "done", priority: "normal",
    title: "ARCHITECTURE.md design standard",
    dependsOn: [],
    acceptance: "The forward-looking design standard / north star. Done." },
  { id: "E5.2", epic: "E5", lane: "X", status: "done", priority: "normal",
    title: "Realign CLAUDE.md + README.md; delete stale TAILWIND_MIGRATION_LEARNINGS.md",
    dependsOn: [],
    acceptance: "Docs realigned; stale learnings doc folded into ARCHITECTURE.md and deleted. Done." },
  { id: "E5.3", epic: "E5", lane: "X", status: "done", priority: "normal",
    title: "This backlog",
    dependsOn: [],
    acceptance: "scrum.md authored. Done." },
  { id: "E5.4", epic: "E5", lane: "X", status: "in-progress", priority: "normal",
    title: "Keep docs in sync as epics land",
    dependsOn: [],
    acceptance: "Update CLAUDE.md status + this backlog per ticket. Ongoing." },

  // ----- E6 (carried-over; no source IDs - grouped, not renamed) -----
  { id: "E6", epic: "E6", lane: "X", status: "todo", priority: "low", group: "Operational / SEO-launch",
    title: "Pre-launch real domain swap",
    dependsOn: [],
    acceptance: "astro.config.mjs site + sitemap/canonical still on the pdkef.vercel.app placeholder; re-verify canonical/OG after." },
  { id: "E6", epic: "E6", lane: "X", status: "done", priority: "low", group: "Operational / SEO-launch",
    title: "HSTS header in vercel.json",
    dependsOn: [],
    acceptance: "max-age=63072000; includeSubDomains; preload - only once the final domain is confirmed HTTPS-only." },
  { id: "E6", epic: "E6", lane: "X", status: "done", priority: "low", group: "Operational / SEO-launch",
    title: "Register Google Search Console + submit sitemap",
    dependsOn: [],
    acceptance: "Once the domain is final; monitor Core Web Vitals (prioritize INP for signature drawing)." },
  { id: "E6", epic: "E6", lane: "X", status: "done", priority: "low", group: "Operational / SEO-launch",
    title: "IndexNow (low priority) (Skipped)",
    dependsOn: [],
    acceptance: "public/<key>.txt + deploy ping for faster Bing/Yandex indexing." },
  { id: "E6", epic: "E6", lane: "X", status: "todo", priority: "low", group: "Operational / SEO-launch",
    title: "Homepage hub link check",
    dependsOn: [],
    acceptance: "Recurring guard: confirm no tool card points at a noindex route." },
  { id: "E6", epic: "E6", lane: "X", status: "done", priority: "low", group: "Operational / SEO-launch",
    title: "User feedback / suggestion channel",
    dependsOn: [],
    acceptance: "DONE: footer links \"Report a bug\" (GitHub Issues) and \"Feedback & ideas\" (GitHub Discussions), each with an inline icon. Link-only, so zero new network surface and no CSP change; in-app form rejected to avoid loosening connect-src 'self'. Bug issue template + ISSUE_TEMPLATE config route ideas/questions/kudos to Discussions and keep Issues bug-only. Discussions enabled with Ideas / Q&A / Show and tell." },
  { id: "E6", epic: "E6", lane: "X", status: "todo", priority: "low", group: "Operational / SEO-launch",
    title: "Long-tail landing pages",
    dependsOn: [],
    acceptance: "/sign-pdf-no-signup, /offline-pdf-form-filler, /open-source-pdf-editor." },
  { id: "E6", epic: "E6", lane: "X", status: "todo", priority: "low", group: "Operational / SEO-launch",
    title: "OS-specific how-to guides",
    dependsOn: [],
    acceptance: "Internally linking into the tools (no outbound promo links)." },
  { id: "E6", epic: "E6", lane: "X", status: "done", priority: "low", group: "Operational / SEO-launch",
    title: "Public GitHub repo + iframe embed model",
    dependsOn: [],
    acceptance: "For contextual backlinks. CORRECTION (2026-08-09): the iframe half of this never worked as an SEO play - an <iframe src> passes no link equity, so an embed is not a backlink unless the host also adds a real <a href>. The permissive 'frame-ancestors *' it motivated (commit 4909cb5) has been reverted to 'none', since it bought no links and left a clickjacking hole on a tool handling sensitive documents. The public repo half stands." },
  { id: "E6", epic: "E6", lane: "X", status: "done", priority: "normal", group: "Bugs / hardening",
    title: "Fix homepage typecheck errors",
    dependsOn: [],
    acceptance: "DONE: the redirecting FileDropzone declares its intentionally unused callback seam and the OS-install tab script guards its optional aria-controls value. npm run typecheck now has zero errors; build/preview verification passed." },
  { id: "E6", epic: "E6", lane: "X", status: "todo", priority: "low", group: "Editor / UX polish",
    title: "Verify Redact mobile toolbar on a real narrow viewport",
    dependsOn: [],
    acceptance: "Code updated (shared .sign-toolbar CSS, structure-agnostic mobile flex rule) but never visually confirmed." },
  { id: "E6", epic: "E6", lane: "X", status: "todo", priority: "low", group: "Editor / UX polish",
    title: "State-based drag halo",
    dependsOn: [],
    acceptance: "Replace the single-value .sign-element::after grab halo with a small resting halo + a larger halo only on .active (which is z-index:50, so it won't steal neighbor clicks)." }

  // ----- E7 -----
  ,{ id: "E7.1", epic: "E7", lane: "X", status: "done", priority: "high",
    title: "Reconcile the privacy invariant with analytics reality",
    dependsOn: [],
    acceptance: "Done. Google Analytics and its CSP allowances were removed; same-origin Vercel Analytics remains. Code and privacy documentation now agree." }
  ,{ id: "E7.2", epic: "E7", lane: "E", status: "done", priority: "high",
    title: "Thread the element union through the registry seam",
    dependsOn: [],
    acceptance: "Done. Registry definitions and render context are generic over the specific EditorElement union member, so the compiler now protects the type seam." }
  ,{ id: "E7.3", epic: "E7", lane: "E", status: "todo", priority: "normal",
    title: "Type the interactive shell (.jsx to .tsx)",
    dependsOn: ["E7.2"],
    acceptance: "Migrate editor-path components to TypeScript incrementally; npm run typecheck remains clean and incorrect element usage is caught at compile time." }
  ,{ id: "E7.4", epic: "E7", lane: "E", status: "done", priority: "normal",
    title: "Collapse RedactBox's duplicate paint and inline-conditional visuals",
    dependsOn: [],
    acceptance: "Done. RedactBox delegates painting to the registry, leaving no per-type visual ternaries in the component." }
  ,{ id: "E7.5", epic: "E7", lane: "E", status: "done", priority: "normal",
    title: "Converge Redact gesture wiring onto the shared hooks",
    dependsOn: ["E4.4"],
    acceptance: "Done, with scope narrowed after reading the real code rather than trusting the ticket's framing: E4.4's own claim ('Redact gestures route through the shared controller') is about the low-level primitive (startGesture in editor/gestures/controller.ts, commit-once-on-release) - already fully shared and untouched here. What wasn't shared was the pointer-lifecycle wiring one layer up: PdfRedactTool.jsx hand-rolled three separate startGesture call sites (handlePointerDown for drawing a new box, handleBoxDragStart, handleBoxResizeStart) instead of the hooks Sign already built for the same three families. Converged drag-to-move and resize in full: extracted DraggableWrapper.jsx's inline handleResizeStart (registry-driven, no Sign-specific logic) into new src/lib/useElementResize.js, mirroring how useDraggableElement.js already sits beside it; both hooks are now called once per box from RedactBox.jsx (they're hooks - call usePdfCoordinates()/hold useRef gesture state - so they cannot run from plain event-handler functions the way PdfRedactTool.jsx's old handleBoxDragStart/handleBoxResizeStart did; RedactBox already exists as the per-element component for exactly this reason, per its own doc comment about useFloating). PdfRedactTool.jsx's two hand-rolled functions are deleted; RedactBox.jsx gained a real elementRef and onSelect/onChange/getPageWrapper props. Left box CREATION (handlePointerDown, drawing a brand-new box) deliberately un-converged beyond swapping its raw coordinate math for the already-shared usePdfCoordinates() hook: two real, confirmed behavior divergences block a full merge without a separate product decision - (1) tiny-drag handling: Sign snaps a too-small drag to a default-sized box (reducer's ENSURE_MINIMUM_SIZE), Redact discards it (no element created) - user explicitly chose to keep Redact's discard behavior, not adopt Sign's snap; (2) creation drag-clamp math is genuinely different, not just differently-wired: Sign's box-creation computePatch is unclamped (verified in lib/coords.ts - pxDeltaToPercent is a pure unclamped ratio, and useWorkspaceGestures.js's box branch never bounds it), Redact's clamps x/y to [0,100] on every move - confirmed real via hand-checking the exact fixture math, not assumed. A third structural mismatch (Sign eagerly adds the real element to state before the drag and mutates its live DOM node; Redact draws into a separate preview node and only adds the real element on commit) exists specifically to support Sign's snap-to-default, which Redact doesn't have - forcing Redact onto it would be a bigger, riskier change than 'converge the wiring' and was correctly out of scope. Converging computePatch further was assessed and rejected as over-engineering: the part that would actually be shared is ~4-5 lines: everything that matters (clamp policy, DOM lifecycle, commit policy) stays caller-specific either way. Also fixed in passing: RedactBox's now-dead onResizeStart references in its unreachable !hasShapeHandles branch (hasShapeHandles is hardcoded true), the redundant e.nativeEvent || e unwrap at all three call sites (confirmed dead - Preact never wraps events the way React does, grepped the whole repo), and a latent guard fragility - handleBoxDragStart's .redact-box-resizer guard clause matched nothing live (ElementResizers uses a different class), so resize-vs-drag double-fire protection depended solely on stopPropagation; useDraggableElement's own [data-editor-resizer] guard now covers it independently, same belt-and-suspenders pattern Sign already relies on. One gap closed: added 'does not start a drag when the inline delete button is pressed' to PdfRedactTool.test.jsx - the one piece of Redact-specific logic (a target-closest guard for .redact-element-btn, which carries no data-editor-actions/data-editor-resizer marker so the shared hook's own guards don't catch it) that survives the convergence as a thin wrapper in RedactBox.jsx, previously untested. Non-vacuity: temporarily removed that guard and reran the new test - failed as expected (gestureCommitSpies grew from 1 to 2, meaning a drag gesture started under the delete button); restored and reran, passed. 491/491 unit tests (up from 490 with the new guard test), 0 typecheck errors, all CSS guards pass against a fresh build, 31/31 e2e including Redact's drag/resize/clamp coverage. Two visual-only checks flagged for manual follow-up, not blocking: touch-device drag/resize (zero automated coverage on either side of this change, pre-existing gap) and a selected whiteout box's floating toolbar during drag (the paint mechanism changed from direct style.left/top writes to transform-then-commit, matching Sign's existing pattern, which creates a new CSS containing block - same structure Sign already has, just new to Redact's DOM shape)." }
  ,{ id: "E7.6", epic: "E7", lane: "E", status: "done", priority: "normal",
    title: "Delegate DraggableWrapper's per-type DOM writes to the registry",
    dependsOn: ["E7.2"],
    acceptance: "Done. Per-type DOM writing now belongs to registry definitions; DraggableWrapper contains no actualType branching." }
  ,{ id: "E7.7", epic: "E7", lane: "B", status: "done", priority: "high",
    title: "Widen the editor-CSS ratchet beyond .sign-*",
    dependsOn: [],
    acceptance: "Done. The static CSS guard covers Redact and shared editor selectors, with non-vacuity checks." }
  ,{ id: "E7.8", epic: "E7", lane: "B", status: "done", priority: "high",
    title: "Add the two missing static guards",
    dependsOn: [],
    acceptance: "Done. Static gesture golden-rule and runtime-CSP smoke guards are wired into CI with non-vacuity checks." }

  // ----- E8 - from the 2026-08-08 repo health assessment -----
  // Findings keep their assessment letters (A/B/T) in the title so the report and
  // the board can be read against each other. A1, A2, A3 and T3 were fixed in the
  // same session and are recorded here as done.
  ,{ id: "E8.A1", epic: "E8", lane: "B", status: "done", priority: "high",
    title: "A1 - Home-page drop destroyed the saved Sign draft and lost the file",
    dependsOn: [],
    acceptance: "Done. FileDropzone parked the dropped file in the tool's own draft key, whose put() replaces the record, so one drop destroyed any saved signing work - and the record it wrote had no fileBytes, so the restore path skipped it and the file was lost too. Dropped files now go into a separate one-shot handoff key (draftStore.saveHandoff/takeHandoff, 5-minute TTL), the tool resolves a handoff before loadDraft rather than racing it, and a drop that would discard a draft asks first through the shared ConfirmDialog, naming both files." }
  ,{ id: "E8.A2", epic: "E8", lane: "C", status: "done", priority: "high",
    title: "A2 - UndoHistoryModal shipped unstyled; its CSS Module was orphaned",
    dependsOn: [],
    acceptance: "Done. The component rendered raw global class strings while its rules sat in an UndoHistoryModal.module.css nothing imported - the only orphaned module in the repo, and dead since the E2.2b reimplementation, which listed the file for CSS reuse but not for the class swap. Module now imported and the six classes swapped; the misleading undo-history-list entry is out of check-dead-utilities.js's allowlist." }
  ,{ id: "E8.A3", epic: "E8", lane: "C", status: "done", priority: "normal",
    title: "A3 - .hint-message had no rule in five tools",
    dependsOn: [],
    acceptance: "Done. The rule was deleted from global.css in a40a937 without being re-homed, so six render sites across five tools showed their 'skipped a file that wasn't a PDF' notice as bare text - and Edit PDF alone papered over it with inline centring and a danger colour. Restored in PdfTool.module.css with real .centered/.danger modifiers, and all six sites swapped." }
  ,{ id: "E8.T3", epic: "E8", lane: "B", status: "done", priority: "high",
    title: "T3 - Source-side guard: every class string must resolve to CSS",
    dependsOn: [],
    acceptance: "Done. scripts/check-class-resolution.js reads src/**/*.jsx rather than the built HTML, closing check-dead-utilities.js's structural blind spot (it only ever sees an island's initial SSR state, so post-interaction classes are invisible to it - which is how A2 and A3 shipped green). Catches three shapes: a class with no rule anywhere, a raw string whose rule is CSS-Modules-hashed, and a styles['key'] lookup that is not in the module it points at (class=\"undefined\"). Found redact-draw-area on first run. Wired into test:css and as its own pre-build CI step; non-vacuity proven against both original defects." }

  ,{ id: "E8.T2", epic: "E8", lane: "B", status: "done", priority: "high",
    title: "T2 - Make the FileList test double behave like a live FileList",
    dependsOn: [],
    acceptance: "Done. 38 call sites across 12 test files (not 14 - the earlier estimate undercounted PdfSignTool.test.jsx, which alone had 13) inlined `Object.defineProperty(input, 'files', {value: [...], configurable: true})`, which survives `input.value = ''` where a real live FileList does not - the exact gap that let a handler reading `files` after clearing the input ship to production with every test green. Added src/test/setInputFiles.js: installs a `files` getter that returns `[]` once an own `value` setter has observed an assignment of `''`, mirroring live-FileList semantics, then dispatches the `change` event itself. All 38 sites now call `setInputFiles(input, files)`; BasePdfTool.test.jsx's local `selectFile` wrapper was updated to delegate to it rather than duplicating the pattern. Non-vacuity proven by temporarily reordering BasePdfTool.jsx's onInputChange to clear `input.value` before reading `files` (the exact bug shape): 6 of BasePdfTool.test.jsx's 19 tests went red (onFilesAdded no longer called, replace-confirmation dialogs never opened) with the new helper, where the old Object.defineProperty double would have stayed green throughout. Reverted after confirming. Full suite 438/438 passed before and after; no build/CSP verification needed since this only touches test doubles." }
  ,{ id: "E8.T6", epic: "E8", lane: "B", status: "done", priority: "normal",
    title: "T6 - One browser test that puts a file into the five uncovered tools",
    dependsOn: [],
    acceptance: "Done. e2e/tool-output-paths.spec.js: one parameterised spec, five cases (Split, Compress, PDF to Image, Image to PDF, Edit Pages), each driving its tool's cheapest path to a single-file 'done' state and asserting the download link's href is a real blob: URL and its download attribute is set (plus the exact filename where the tool computes one deterministically). Each case's minimal path was chosen to actually reach the single-output branch rather than the multi-file one - Split and PDF to Image both default to the single-file/single-image path already, and Edit Pages ticks 'Add page numbers' rather than driving the drag/rotate/remove grid, since hasEdits is the only precondition the output path cares about. Image to PDF reads a real PNG from public/icons/icon-192.png rather than fabricating bytes, since @cantoo/pdf-lib's embedPng() parses the file for real - unlike PdfImageToPdfTool.test.jsx, which mocks imageToPdf.js outright. Non-vacuity proven on exactly that gap: swapped embedPng for embedJpg in src/lib/imageToPdf.js (a real PNG fed to the JPEG decoder throws). PdfImageToPdfTool.test.jsx stayed green throughout, since it mocks the module being broken - confirming the component-level double cannot see this class of bug. The new e2e case failed as expected (download link never appeared); reverted after confirming, diff clean. (imageToPdf.test.js, a separate direct unit test of the module, also caught the same break - the e2e case adds proof through the real browser and the real UI click path, not sole coverage.) Full e2e suite 25/25 (was 20); ratio to the 438 unit tests is ~1:17.5, inside the ~1:10 ceiling." }
  ,{ id: "E8.T6a", epic: "E8", lane: "B", status: "done", priority: "high",
    title: "Browser guardrail for the home-page handoff (finishes E8.A1)",
    dependsOn: ["E8.A1"],
    acceptance: "Done. e2e/home/handoff.spec.js (3 tests): a dropped file survives the navigation and opens in /sign; a drop that would discard a saved draft asks first, naming both files, and writes nothing until answered; declining leaves the draft intact and still restorable on a later visit - the exact case the original bug got backwards, since it had already overwritten the draft before any dialog could render. Seeds IndexedDB directly to set up the draft-exists case without driving a full signing session. Non-vacuity verified by reinstating the original bug (drop written straight to the tool's draft key, no confirmation) against a rebuilt dist: all three fail, the middle one on a 10s timeout waiting for the editor - the 'dropped file vanishes' signature - then reverted. Full e2e suite 20/20 (was 17); ratio to the 438 unit tests holds at ~1:22, inside the ~1:10 ceiling." }
  ,{ id: "E8.T5", epic: "E8", lane: "B", status: "done", priority: "high",
    title: "T5 - Unit-test redact.js and merge.js",
    dependsOn: [],
    acceptance: "Done. Neither had a test file; the component tests that appear to cover them vi.mock the module in question (PdfRedactTool.test.jsx mocks redact.js; PdfMergeTool.test.jsx mocks merge.js), so the mock asserted the wiring and nothing asserted the logic. redact.test.js (5 cases) and merge.test.js (6 cases) call the real functions against the real num-*.pdf fixtures already used by editPages/compress.test.js, reading results back with pdfjs the same way those files do. redact.js needed the same canvas stubbing compress.test.js uses (getContext), plus toDataURL (compress.js reads back via toBlob; redact.js uses toDataURL directly, a different method needing its own stub) and pdfjs-dist re-mounted to the legacy build so the worker resolves. Coverage: untouched pages stay lossless real text; a redacted page's text layer is destroyed (rasterized to JPEG - pdf.js can no longer extract anything from it) while every other page on the same document is untouched; flattened page dimensions still match the source page exactly despite the raster round-trip; blur redactions destroy text the same way solid ones do; progress fires once per page. merge.js: order and content preserved across files; addPageNumbers stamps a running index across file boundaries rather than resetting per file (Split had exactly this bug shape in its own numbering); the bare-callback back-compat call form; progress once per file; resolvePdfCreationDate round-trips a date the file actually has and returns null (not a throw) for bytes that aren't a PDF at all. Non-vacuity proven on the highest-value case in each file: inverted redact.js's `pageIndex === i` filter to `!==` (flips which page gets destroyed) - 2 of 5 new cases failed, PdfRedactTool.test.jsx's 26 stayed green throughout since it mocks the module being broken; reset merge.js's page-number counter per file instead of tracking a global index - the running-index case failed with a wrong stamp, PdfMergeTool.test.jsx's 7 stayed green. Both reverted, diffs clean. Full suite 449/449 (was 438), 48 files (was 46). Still unowned: split.js, sort.js (the three-tier date fallback), draftStore.js, thumbnails.js, usePdfShare.js, actionHistory.js, signHelpers.js." }
  ,{ id: "E8.T7", epic: "E8", lane: "B", status: "done", priority: "low",
    title: "T7 - Make a missing ToolShell provider loud instead of silent",
    dependsOn: [],
    acceptance: "Done. ToolShellContext's default value now carries requestReplace/requestClear stubs that throw a named, actionable error (\"no <ToolShellContext.Provider> above it... mount inside BasePdfTool, or wrap the render\") instead of createContext({})'s empty object, which let a control render outside the provider with onClick={undefined} - a click that silently did nothing, indistinguishable from a click that worked, the same failure shape as the FileList and dead-reset() bugs. Isolated rendering (SignToolbar.test.jsx mounts SignToolbar with only SignToolProvider, no ToolShellContext.Provider) still works, since nothing is called until a control is actually clicked - verified with an ad-hoc render-and-click check (not committed, since the ticket asks for the default to be loud, not for new permanent tests): clicking Replace with no provider now throws immediately instead of doing nothing. Full suite unaffected, 449/449, since no existing test clicks Replace on an unwrapped render." }
  ,{ id: "E8.C1", epic: "E8", lane: "B", status: "done", priority: "normal",
    title: "Extend the toolbar touch-target guard to Redact",
    dependsOn: [],
    acceptance: "Done. e2e/sign/toolbar-touch-targets.spec.js is now parameterised over both tools (same file, per the ticket - not a new one): Sign keeps its five hand-computed wrap widths, Redact gets its own three (300/320/340px), found the same empirical way against its own 7-control count rather than reused from Sign's. (280px was tried first and rejected - not a bug, just below the width where 4 min-size controls can physically fit in the container, confirmed by the real rendered rects.) Non-vacuity: temporarily changed the toolbar's base --controls-per-row from 4 to 6 (Redact's branch, since it never matches the :has(> :nth-child(9)) override that keeps Sign locked to 5 regardless) - the new Redact-only 340px case failed with an unbalanced 5+2 split, while every Sign case, old and new, stayed green throughout, proving the original Sign-only spec genuinely could not have caught a regression on this branch. Reverted after confirming. Full e2e suite 30/30 (was 25)." }

  ,{ id: "E8.B1", epic: "E8", lane: "C", status: "done", priority: "high",
    title: "B1 - The output state machine: the second BasePdfTool-shaped consolidation",
    dependsOn: [],
    acceptance: "Done, with the scope narrowed from the original write-up after reading every tool's actual code rather than trusting the summary: the duplication is real but less uniform than \"nine tools, one shape.\" useObjectUrls() (src/lib/useObjectUrls.js) fits 5 tools with a genuine single downloadUrl - Merge, Compress, Image to PDF, Edit Pages, Unlock. Split and PDF to Image manage an array of {url, filename} outputs, a different shape, not a variant - left untouched rather than forced through a single-URL API. Sign and Redact have no persisted download URL at all (usePdfShare's download() is called directly, no separate \"done\" screen, by design - crash-recovery drafts stay editable after downloading) - left out of B1 entirely, not touched. ProgressRing and ErrorMessage are pure presentational components adopted only where the exact markup already matched: ProgressRing in the 6 tools with the full animated ring (Merge, Split, Compress, PDF to Image, Image to PDF, Edit Pages) - Unlock has no ring (its operation reads as instant) and Redact's ring is a deliberately simplified track-only variant, both left as declared differences, not gaps to close. ErrorMessage adopted in all 8 non-Sign tools including Redact, whose per-instance width:100% override is passed through a style prop rather than forcing a wrapper change. DownloadButton (self-focusing on mount via its own effect, replacing the separate status-watching useEffect + ref every tool had) adopted only by the 5 single-output tools; Split/PDF to Image keep their own ref+focus handling since they still need it for the multi-output \"Download all N\" branch. PROGRESS_RING_CIRCUMFERENCE now lives in ProgressRing.jsx only, confirmed via repo-wide grep. Non-vacuity, two layers: (1) useObjectUrls.test.jsx (7 cases, new) directly proves create/replace-revokes-previous/clear/unmount-revokes-current/no-op-on-empty-clear. (2) An end-to-end proof against a real tool, not just the hook in isolation: mounted PdfMergeTool, completed a real merge, unmounted mid-\"done\", asserted revokeObjectURL was called with the download URL - passed on the new code. Then git-stashed PdfMergeTool.jsx back to its pre-refactor state and reran the identical test: failed, 0 calls - proving the original code never revoked on unmount, the exact gap the ticket named. Restored after confirming. Full suite 477/477, 0 typecheck errors, all CSS guards pass, build clean, 31/31 e2e (including tool-output-paths.spec.js, which independently re-confirms real download blob URLs for all 5 useObjectUrls-adopting single-output tools plus Split)." }
  ,{ id: "E8.B2", epic: "E8", lane: "C", status: "done", priority: "normal",
    title: "B2 - Rename .merge-tool / .merge-button, which are every tool's",
    dependsOn: ["E8.B1"],
    acceptance: "Done. .merge-tool -> .tool-card, .merge-button -> .tool-primary-action, .merge-button-progress -> .tool-primary-action-progress, .is-merging -> .is-processing (matches the name Workspace.module.css already uses for the analogous per-operation state, so 'an operation is running' now has one name in the codebase instead of two). .is-done was left alone - already tool-agnostic, unlike is-merging's borrowed verb. Renamed in PdfTool.module.css plus the 17 consumers a repo-wide grep for pdfToolStyles['merge-tool']/['merge-button'] turned up: BasePdfTool.jsx + its test, all 8 non-Sign/Redact tool components plus the 5 of their tests that assert the class directly, PdfRedactTool.jsx, SignTool/PdfWorkspace.jsx, and ProgressRing.jsx. No e2e spec asserted either class name. Also found by the same grep: .merge-tool is coincidentally a second, unrelated thing - a literal (non-module) class in global.css's two mobile/desktop media queries, matched by index.astro's homepage CTA dropzone wrapper (a static marketing mockup that never imports PdfTool.module.css). Left untouched: it's a leftover from before this class moved into CSS Modules (E2.2.10), not the shared tool-infra class this ticket is about, and renaming it would be a second, unrelated rename. That same grep surfaced a genuine latent bug out of scope for a rename: ToolPageLayout.astro's `[&_.merge-tool]:!p-4` Tailwind arbitrary-variant selector targets that literal string, but every real tool page renders BasePdfTool's card through the CSS-Modules-hashed class (confirmed against a pre-rename build's dist/*/index.html, e.g. class=\"_merge-tool_kg9td_5\"), so the selector has never matched on any tool page. Flagged separately rather than fixed here - what should target it, and why it was written against a name CSS Modules would hash, is its own investigation. Also cleaned the stale .start-over comment: the removed-classes note above .page-selector-field still explained a control (.start-over) deleted in an earlier ticket; trimmed the tangent, kept the still-true .list-header/.list-count/.clear-all part. Non-vacuity: repo-wide grep across dist/ after a full rebuild finds zero remaining merge-button or is-merging occurrences anywhere (page HTML, inline styles, the hydration bundle), with the new hashed classes present in their place (_tool-card_*, _tool-primary-action_*, _tool-primary-action-progress_*, _is-processing_*); the 12 residual merge-tool hits in dist are exactly the two out-of-scope literal-class sites above, nothing missed. 488/488 unit tests, 0 typecheck errors, all four CSS guards (class-resolution, editor-global-css, bundle size, dead-utilities) pass against the fresh build, 31/31 e2e including csp-smoke (re-confirms the CSS-Modules hash churn didn't touch anything CSP hashes). Update (2026-08-10, c5da633): the flagged ToolPageLayout.astro selector was investigated and fixed - git-blamed to confirm it genuinely worked before the CSS Modules move (not dead on arrival) and was never deliberately dropped, then moved the >=1024px padding it expressed into .tool-card (PdfTool.module.css) and the same-shaped .dropzone case it sat alongside (Dropzone.module.css), deleting both dead arbitrary variants from the layout." }
  ,{ id: "E8.B4", epic: "E8", lane: "C", status: "done", priority: "normal",
    title: "B4 - Collapse the two dropzones",
    dependsOn: ["E8.A1"],
    acceptance: "Done. Confirmed onFiles was genuinely dead (the only caller, index.astro, always passed onFiles={null} and toolTarget) before deleting it from FileDropzone.jsx's props and its handleFiles branch, and from index.astro's call site (which typecheck itself caught - the prop no longer existed on the type). Extracted the shared markup (icon, heading, choose-file control, privacy line, and now the drag-over state + input/drop wiring too) into DropzoneEmptyState.jsx; BasePdfTool.jsx and FileDropzone.jsx both render it, passing only what differs (href vs input, inputRef, message, onFiles callback). BasePdfTool's own isDragOver state and onDrop became dead once absorbed into the child and were removed with it. FileDropzone.test.jsx's five onFiles-only tests were pared to the three still testing real rendering behavior (multiple, href-mode, drag-class toggling), the two that asserted the dead callback were dropped, and one gap was filled: the toolTarget path previously had drop coverage but no file-input coverage, so `parks the file in a handoff when chosen via the file input too` was added. Non-vacuity: temporarily broke DropzoneEmptyState's ref forwarding (`ref={inputRef}` to `ref={null}`) and confirmed the `?action=open` auto-open feature's own (previously nonexistent) verification failed - that feature depends entirely on BasePdfTool's fileInputRef reaching the real DOM input through the new child component. Reverted after confirming. 113/113 across every BasePdfTool-consumer test file, 0 typecheck errors, 30/30 e2e including the real-browser home-page handoff spec." }
  ,{ id: "E8.B8", epic: "E8", lane: "C", status: "todo", priority: "low",
    title: "B8 - Move the ~20 static inline styles back into the styling system",
    dependsOn: [],
    acceptance: "Of 55 inline style sites, roughly a third qualify under ARCHITECTURE 3.1 (per-element runtime geometry, Floating UI coordinates, colour-from-element) and should be left exactly as they are. The rest are static: most visibly four copies of a centred loading block with three different paddings (PdfSignTool, PdfSplitTool, PdfEditPagesTool, PdfWorkspace/PdfRedactTool), plus Redact's page-header row, two Split layout blocks, popover sizing in SignToolbar/ThicknessPickerMenu, three SignatureDialog flex rows, and four bare `color: var(--color-muted)` declarations. None is a CSP risk - Preact routes object style props through per-key setProperty, which style-src does not govern." }

  ,{ id: "E8.B3", epic: "E8", lane: "E", status: "done", priority: "normal",
    title: "B3 - Cut the Sign editor's prop drilling with two small contexts",
    dependsOn: [],
    acceptance: "Done, with SignToolbar's projected count corrected: the ticket's \"~6\" assumed most of its 15 props would be absorbed, but only the four-prop saved-signatures cluster actually reaches SignToolbar - the seven remember*/seven last* cluster is consumed entirely inside PdfWorkspace (useWorkspaceGestures's initial* values, makeOnChange's remember calls) and never travels past it in the current code, so SignToolbar lands at 11, not ~6. New SignDefaultsContext.jsx (creation defaults: 7 remember* setters + 7 last* values, read only by PdfWorkspace) and SavedSignaturesContext.jsx (savedSignatures/activeSignature/setActiveSignature/onDeleteSavedSignature, read by both PdfWorkspace - activeSignature drives the click-to-place gesture - and SignToolbar directly, so SignToolbar no longer needs PdfWorkspace to re-forward three of the four untouched). Both Providers are mounted once in PdfSignTool.jsx around the PdfWorkspace subtree, fed from the same state/callbacks that used to go through props. PdfWorkspace: 38 props -> 20. SignToolbar: 15 -> 11 (isFullscreen={isFullscreen || isPseudoFullscreen}, the one transform, is still a real prop - it is call-site-specific, not part of either cluster). Followed ToolShellContext's default-value pattern (not SignToolContext's throw-if-missing) for both: PdfWorkspace's own prior default parameter values (DEFAULT_COLOR_BLUE, DEFAULT_STROKE_WIDTH, etc.) became SignDefaultsContext's default value verbatim, and SavedSignaturesContext defaults to an empty/no-op shape - neither carries state whose silent absence would corrupt production behavior the way the reducer would, so a consumer mounted without a real Provider (isolated tests) still renders. SignToolContext itself (the reducer) was correctly left alone - the ticket's own note to keep dispatch-adjacent state where it is, since context hides re-render scope next to the gesture hot path. Test fallout: PdfWorkspace.test.jsx's defaultProps() lost the 11 moved fields and gained a mountWorkspace()/workspaceTree() helper that wraps the two new Providers with realistic defaults (mirroring the removed parameter defaults) so each test only overrides what it actually asserts on; SignToolbar.test.jsx dropped the four dead props from all 11 render sites (10 were already passing the default values, doing nothing) and the one test with real signature data now wraps in SavedSignaturesContext.Provider instead. Non-vacuity came from the refactor itself rather than a separate contrived break: rerunning the untouched test files against the newly-context-reading source (before updating the tests) failed exactly the 4 tests that depend on the moved clusters - 0 remember-fn calls, 0 rendered signature items - proving they exercise the real wiring, not defaults; all 4 pass after the test updates. 490/490 unit tests, 0 typecheck errors, all CSS guards pass on a fresh build, 31/31 e2e including the Sign browser guardrail that specifically asserts whiteout/text defaults stay independent in a real browser." }
  ,{ id: "E8.B5", epic: "E8", lane: "E", status: "done", priority: "normal",
    title: "B5 - Redact's drag-draw preview is a second per-type paint owner",
    dependsOn: [],
    acceptance: "Done. Added redactionDrawingPreviewStyle(kind, color) beside renderRedactionSurface in registry/redactionSurface.ts, and PdfRedactTool.jsx's in-flight drawing preview now spreads its return value instead of re-deriving backgroundColor/opacity/backdropFilter/border inline from drawingState.type. The preview's intentional differences from the committed fill (translucent black instead of solid, dashed border, the red #ff4757 border on blackout specifically) were preserved exactly, including the pre-existing `color !== '#000000'` opacity quirk for whiteout - this ticket is about ownership, not about changing what anything looks like. Geometry (left/top/width/height/zIndex/pointerEvents) stayed in PdfRedactTool.jsx per the module's own doc comment split (paint is the type's job, geometry is the workspace's). Added redactionSurface.test.ts (4 cases, the file had none before), and proved it catches a real regression: temporarily made blur's preview border fall through to the blackout branch's red dashed border - one test failed exactly as expected, reverted after confirming. 74/74 across the editor registry and PdfRedactTool.test.jsx, 0 typecheck errors, all CSS guards (class-resolution, editor-global-css, bundle size, dead-utilities) pass." }

  ,{ id: "E8.B7", epic: "E8", lane: "X", status: "done", priority: "low",
    title: "B7 - One share gate, spelled two ways",
    dependsOn: [],
    acceptance: "Done. Picked ToImage/Split's spelling: visible={shareReady} everywhere, in Compress, EditPages, ImageToPdf, Security and Merge. canSharePdf dropped from usePdfShare()'s destructure in all five (it was used nowhere else in any of them) since shareReady can only become true after prepare()/prepareFiles() already confirmed canShareFiles(), making the && redundant by construction, not by observation. Sign and Redact's own canSharePdf usage (RedactToolbar/SignToolbar's desktop-download layout class) is a different, legitimate use of the same flag and was left untouched. 449/449 unit tests unaffected." }
  ,{ id: "E8.B9", epic: "E8", lane: "X", status: "done", priority: "normal",
    title: "B9 - Three checkable CLAUDE.md claims that are no longer true",
    dependsOn: [],
    acceptance: "Done. (1) Implementation-status table: dropped the Remove Pages row (route/component/lib all confirmed absent) and added the missing Edit Pages row (/edit-pdf, PdfEditPagesTool.jsx, editPages.js). (2) The two DoD/summary mentions of hand-editing public/sitemap.xml (confirmed not to exist) now point at src/pages/sitemap.xml.js, which generates /sitemap.xml from src/data/tools.js - so step 5 of the promotion checklist is now 'nothing to hand-edit' rather than a dead file reference. Also caught and fixed a third, unflagged instance of the same claim in the SEO-invariants bullet ('sitemap.xml in public/'). (3) Removed the stale 'soften these' instruction from both CLAUDE.md and PRODUCT.md's voice sections - confirmed via grep that src/data/tools.js no longer names any competitor." }
  ,{ id: "E8.B10", epic: "E8", lane: "X", status: "done", priority: "low",
    title: "B10 - Two em dashes in user-facing copy",
    dependsOn: [],
    acceptance: "Done. ElementToolbar.jsx's two RTL/LTR toggle tooltip strings rewritten with commas. Left the file's own code-comment em dash and the other 18 across the repo untouched, per the rule's own scope (comments aren't covered). No test asserted the old strings verbatim, so nothing else to update." }
  ,{ id: "E8.A4", epic: "E8", lane: "X", status: "done", priority: "normal",
    title: "A4 - Delete the dead reset() in four tools",
    dependsOn: [],
    acceptance: "Done. Confirmed each reset() had zero references beyond its own definition (grep for the bare identifier, not just the substring, to rule out resetOutput/resetX matches) before deleting from PdfSplitTool, PdfToImageTool, PdfCompressTool and PdfEditPagesTool. PdfEditPagesTool's was wrapped in useCallback; useCallback stayed imported since two other hooks in the file still use it. 449/449 unit tests and typecheck unaffected." }
  ,{ id: "E8.TS", epic: "E8", lane: "X", status: "done", priority: "normal",
    title: "npm run typecheck is no longer error-free",
    dependsOn: [],
    acceptance: "Done. The error was a stale JSDoc, not a caller bug: fonts.js's resolveFontFamily(fontFamily, text) already handles fontFamily being undefined by design (`fontFamily || HEBREW_FALLBACK_TEXT`), but its @param was typed as plain {string}, so TS's checkJs inference held every .ts call site to a stricter contract than the function actually has - text.ts's real element data (fontFamily?: string) legitimately violated it. Fixed the JSDoc to {string} [fontFamily] (optional) rather than forcing a fallback at the call site, which would have duplicated logic the function already owns. 0 errors now (was 1), 0 warnings, 28 hints. Added a Typecheck step to ci.yml (source-side, right after the unit-test step, no build required) so this can't regress silently again the way E4.1/E7.2's 'project-wide error-free' claim did." }
];

const LANE_FLOW = [
  { lane: "A", flow: ["E0.1", "→", "E0.2"], gate: "" },
  { lane: "B", flow: ["E1.1", "E1.2", "E1.3", "E1.4", "E1.5", "E1.6", "E1.6a", "E1.7", "E1.7a", "→", "E8.A1", "E8.T3", "→", "E8.T2", "E8.T6a", "E8.T5", "E8.T6", "E8.C1", "E8.T7"], gate: "gate → E2.*, E3.2, E4 verification · E8 extends the guards' reach before more feature code." },
  { lane: "C", flow: ["E2.1", "→", "E2.2", "→", "E2.3", "E2.5", "E2.6", "→", "E8.A2", "E8.A3", "→", "E8.B1", "→", "E8.B2", "E8.B4", "E8.B8"], gate: "Monolith gone (0 editor selectors); E8 is the per-tool duplication left after it." },
  { lane: "D", flow: ["E3.1", "→", "E3.2", "→", "E3.3"], gate: "✓ complete - static surface on Tailwind utilities." },
  { lane: "E", flow: ["E4.1", "→", "E4.2", "→", "E4.3a", "→", "E4.3b", "→", "E4.4", "→", "E7.2", "E7.3", "E7.4", "E7.5", "E7.6", "E8.B3", "E8.B5"], gate: "E7 hardening is in progress; type the shell and finish Redact convergence." }
];

const DONE_LOG = [
  { title: "Verified done this session", sub: "Were open in the old TODO.md, confirmed against code",
    items: [
      ["Header wordmark", "AppBar.astro renders the PDkef wordmark + logo; live in the header."],
      ["Desktop fullscreen button label", "FullscreenButton.jsx renders a \"Full screen\" / \"Exit full screen\" text label, used by both the Sign and Redact toolbars."],
      ["Founder story card real estate", "index.astro's whypdkef card has distinct layout/styling (tag, signature, proof panel), reading as a signed note."]
    ]},
  { title: "Earlier (pre-session) completed work", sub: "Editor / text-element hardening",
    items: [
      ["Add regression test for textarea cols constraint", ""],
      ["Fix vertical text wrapping regression", ""],
      ["Refine Text Element UX & Bounds", ""],
      ["Fix fullscreen button behavior on iOS", ""],
      ["Improve Redact PDF UI spacing and layout", ""],
      ["Fix text element minimum size and alignment", ""],
      ["Fix font list dropdown positioning", ""],
      ["Fix text element resizing sensitivity", "Proportional drag-vector projection replacing 1:1 pixel-to-point delta."],
      ["Write JS tests for text element padding", ""],
      ["Fix text element bug 1: excess side growth", "min-width: 0 on .sign-text-input."],
      ["Fix text element bug 2: Hebrew RTL right-side clipping", "padding: 0 4px."],
      ["Fix signature padding bug", "Fixed padding: 4px distorting percentage aspect ratio."],
      ["Verify Whiteout bounds after padding removal", ""],
      ["Fix text element padding/wrapping (multiline) regression", ""]
    ]}
];

/* =========================================================================
   RENDERING
   ========================================================================= */

  window.SCRUM_BOARD_DATA = { LANES, EPICS, TICKETS, LANE_FLOW, DONE_LOG };
})();
