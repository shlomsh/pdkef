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
  ,{ id: "E7.5", epic: "E7", lane: "E", status: "todo", priority: "normal",
    title: "Converge Redact gesture wiring onto the shared hooks",
    dependsOn: ["E4.4"],
    acceptance: "Remove Redact's local pointer and box-gesture wiring in favor of the shared controller and hooks, retaining the commit-once rule." }
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
  ,{ id: "E8.T7", epic: "E8", lane: "B", status: "todo", priority: "low",
    title: "T7 - Make a missing ToolShell provider loud instead of silent",
    dependsOn: [],
    acceptance: "ToolShell.jsx's `createContext({})` lets a control render outside the provider with `onClick={undefined}` - SignToolbar.test.jsx does exactly that and asserts the Replace button's class rather than its behaviour. Give the default a requestReplace that throws, so isolated rendering still works but dead wiring is not something a test can pass through." }
  ,{ id: "E8.C1", epic: "E8", lane: "B", status: "todo", priority: "normal",
    title: "Extend the toolbar touch-target guard to Redact",
    dependsOn: [],
    acceptance: "SignToolbar.module.css's container-query thresholds (349/447/251px) are hand-computed and honestly documented as such, and e2e/sign/toolbar-touch-targets.spec.js guards them the right way - by asserting outcomes (rows balanced within one control, every control >=44px, each row centred) rather than restating the numbers. It only drives /sign. Redact has 7-8 controls and takes the --controls-per-row:4 branch, which no browser test exercises. This is a parameter on the existing spec, not a new file." }

  ,{ id: "E8.B1", epic: "E8", lane: "C", status: "todo", priority: "high",
    title: "B1 - The output state machine: the second BasePdfTool-shaped consolidation",
    dependsOn: [],
    acceptance: "Measured: nine hand-rolled useState('idle') machines with nine different status vocabularies, PROGRESS_RING_CIRCUMFERENCE redeclared in six files, the progress-ring SVG in six, the error-message block in eight, resetOutput in five, 27 hand-managed revokeObjectURL sites in seven files, and the done-focus effect in every tool. Do NOT extract one useToolOutput() - the bodies genuinely differ and that would be the god-abstraction ARCHITECTURE section 2 warns about. Extract exactly three things: (1) a useObjectUrls() owning create/replace/revoke/unmount - highest value and already inconsistent, since only Split registers unmount cleanup so every other single-output tool leaks its blob if unmounted mid-'done'; (2) progress-ring, error-message and download-button as components; (3) PROGRESS_RING_CIRCUMFERENCE as one constant. Status vocabularies, announcement strings and download filenames stay per-tool - those are declared differences." }
  ,{ id: "E8.B2", epic: "E8", lane: "C", status: "todo", priority: "normal",
    title: "B2 - Rename .merge-tool / .merge-button, which are every tool's",
    dependsOn: ["E8.B1"],
    acceptance: "pdfToolStyles['merge-tool'] is BasePdfTool's wrapper for all nine tools and .merge-button is the primary CTA in eight plus PdfWorkspace; six of PdfTool.module.css's classes are named after one tool. Rename to something the shared module can own (tool-card / tool-primary-action). Mechanical and module-scoped; best done in the same pass as B1 so the nine tools are only touched once. PdfTool.module.css also still carries a comment about the removed .start-over." }
  ,{ id: "E8.B4", epic: "E8", lane: "C", status: "todo", priority: "normal",
    title: "B4 - Collapse the two dropzones",
    dependsOn: ["E8.A1"],
    acceptance: "FileDropzone.jsx and BasePdfTool.jsx render the same SVG, copy, button and privacy line from the same Dropzone.module.css, in two files; they diverged when BasePdfTool gained the FileList fix and the confirmation gate and FileDropzone got neither. Extract the shared presentation. Check first whether FileDropzone's `onFiles` branch can simply be deleted - no production caller passes it (index.astro passes onFiles={null}), and A1's fix means the toolTarget path is the only live one." }
  ,{ id: "E8.B8", epic: "E8", lane: "C", status: "todo", priority: "low",
    title: "B8 - Move the ~20 static inline styles back into the styling system",
    dependsOn: [],
    acceptance: "Of 55 inline style sites, roughly a third qualify under ARCHITECTURE 3.1 (per-element runtime geometry, Floating UI coordinates, colour-from-element) and should be left exactly as they are. The rest are static: most visibly four copies of a centred loading block with three different paddings (PdfSignTool, PdfSplitTool, PdfEditPagesTool, PdfWorkspace/PdfRedactTool), plus Redact's page-header row, two Split layout blocks, popover sizing in SignToolbar/ThicknessPickerMenu, three SignatureDialog flex rows, and four bare `color: var(--color-muted)` declarations. None is a CSP risk - Preact routes object style props through per-key setProperty, which style-src does not govern." }

  ,{ id: "E8.B3", epic: "E8", lane: "E", status: "todo", priority: "normal",
    title: "B3 - Cut the Sign editor's prop drilling with two small contexts",
    dependsOn: [],
    acceptance: "PdfWorkspace declares 38 props and its call site passes 38; it forwards 15 to SignToolbar of which 14 are verbatim (the only transform is isFullscreen || isPseudoFullscreen). Two cohesive clusters are visible in the prop list itself: the seven remember* setters plus seven last* values (creation defaults), and savedSignatures/activeSignature/setActiveSignature/onDeleteSavedSignature. Moving just those takes PdfWorkspace to ~15 and SignToolbar to ~6. Keep dispatch-adjacent state where it is - context makes re-render scope invisible, which matters next to the gesture hot path. The pattern is already proven twice in-tree (SignToolContext, ToolShellContext)." }
  ,{ id: "E8.B5", epic: "E8", lane: "E", status: "todo", priority: "normal",
    title: "B5 - Redact's drag-draw preview is a second per-type paint owner",
    dependsOn: [],
    acceptance: "registry/redactionSurface.ts documents itself as the sole owner of fill/blur/border, and E7.4 accepted on RedactBox having no per-type ternaries - but PdfRedactTool.jsx's in-flight preview re-derives all three inline, with raw #ff4757 / #000 / rgba(0,0,0,0.7) chrome literals against the no-hardcoded-colour rule. E7.4 is honestly closed; the invariant is just not true of the file next door. A dashed ghost differing from the committed fill is fine as intent - having two places decide it is not." }

  ,{ id: "E8.B7", epic: "E8", lane: "X", status: "todo", priority: "low",
    title: "B7 - One share gate, spelled two ways",
    dependsOn: [],
    acceptance: "Six tools pass visible={canSharePdf && shareReady}; ToImage and Split pass visible={shareReady}. Equivalent, since prepareFiles already refuses when canShareFiles is false - so canSharePdf is redundant everywhere, and ToImage's spelling is arguably the more correct one since canSharePdf probes a PDF while ToImage emits PNG/JPEG. Pick one." }
  ,{ id: "E8.B9", epic: "E8", lane: "X", status: "todo", priority: "normal",
    title: "B9 - Three checkable CLAUDE.md claims that are no longer true",
    dependsOn: [],
    acceptance: "(1) The implementation-status table still lists Remove Pages / /remove-pages / PdfRemovePagesTool.jsx / src/lib/removePages.js - none of the four exists, and the table is missing Edit Pages at /edit-pdf, the tool that actually shipped. (2) Two sections tell you to edit public/sitemap.xml, which does not exist; the sitemap is generated from src/data/tools.js by src/pages/sitemap.xml.js, so the documented definition-of-done points at a missing file. (3) The voice section asks for competitor jabs in tools.js to be softened; they are already gone (PRODUCT.md line 43 carries the same stale parenthetical). Worth fixing precisely because the rest of the file - the four hazard write-ups, the CSP split, the trailing-slash rule - checks out and is trusted." }
  ,{ id: "E8.B10", epic: "E8", lane: "X", status: "todo", priority: "low",
    title: "B10 - Two em dashes in user-facing copy",
    dependsOn: [],
    acceptance: "ElementToolbar.jsx's LTR/RTL tooltips are the only user-visible copy in the repo carrying an em dash; the other 18 are in code comments, which the rule does not cover. .astro and tools.js copy is clean." }
  ,{ id: "E8.A4", epic: "E8", lane: "X", status: "todo", priority: "normal",
    title: "A4 - Delete the dead reset() in four tools",
    dependsOn: [],
    acceptance: "be2b5fc removed the Start-over buttons and left their handlers behind: reset is defined and never referenced in PdfSplitTool, PdfToImageTool, PdfCompressTool and PdfEditPagesTool. Only Merge and ImageToPdf still wire theirs to onClearAll. Low cost today, but it is the FileList shape again - the next person adding 'clear the tool' edits the dead function, sees tests pass, and ships nothing." }
  ,{ id: "E8.TS", epic: "E8", lane: "X", status: "todo", priority: "normal",
    title: "npm run typecheck is no longer error-free",
    dependsOn: [],
    acceptance: "src/editor/registry/text.ts line 62 fails with ts(2345): resolveFontFamily(fontFamily, textValue) passes `string | undefined` where `string` is required. E4.1 and E7.2 both record typecheck as project-wide error-free with only hints remaining, so this is a regression that arrived without anyone noticing - which also means typecheck is not gating anything. Fix the error, then consider adding npm run typecheck to ci.yml so the claim stays true." }
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
