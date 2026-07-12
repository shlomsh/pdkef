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
  { id: "E7", name: "Finish the headless convergence", goal: "Post-audit hardening; close the architecture gaps." }
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
    acceptance: "For contextual backlinks." },
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
];

const LANE_FLOW = [
  { lane: "A", flow: ["E0.1", "→", "E0.2"], gate: "" },
  { lane: "B", flow: ["E1.1", "E1.2", "E1.3", "E1.4", "E1.5", "E1.6", "E1.6a", "E1.7", "E1.7a"], gate: "gate → E2.*, E3.2, E4 verification" },
  { lane: "C", flow: ["E2.1", "→", "E2.2", "→", "E2.3", "E2.5", "E2.6"], gate: "✓ complete - global CSS monolith gone (0 editor selectors)." },
  { lane: "D", flow: ["E3.1", "→", "E3.2", "→", "E3.3"], gate: "✓ complete - static surface on Tailwind utilities." },
  { lane: "E", flow: ["E4.1", "→", "E4.2", "→", "E4.3a", "→", "E4.3b", "→", "E4.4", "→", "E7.2", "E7.3", "E7.4", "E7.5", "E7.6"], gate: "E7 hardening is in progress; type the shell and finish Redact convergence." }
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
