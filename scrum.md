# Scrum Backlog

The maintainability-migration backlog for PDkef, ready to assign. The design standard it serves is
[ARCHITECTURE.md](./ARCHITECTURE.md); day-to-day repo guidance is [CLAUDE.md](./CLAUDE.md).

**How to read this:** work is grouped into epics (E0–E6). Each ticket lists **Depends on** (what must
land first) and a **Lane** (which tickets can run in parallel). Every ticket's acceptance includes the
relevant guardrail - editor-touching work is verified in a *running* editor **and** with
`npm run build && npm run preview` (the CSP bug class is invisible in `npm run dev`).

Two things stay untouched across the whole migration: the **SEO/privacy island shell** and the
**gesture hot path** (see ARCHITECTURE §1).

---

## E0 - Stabilize & de-risk  ·  *start immediately, no deps*

- **E0.1 Land the resize perf fix on `main`.** Re-apply the gesture portions of commit `c4583df`
  (the `pendingResize` accumulator + direct DOM mutation during move, single `onChange` on
  `pointerup`) into `DraggableWrapper.jsx` `handleResizeMove`/`handleResizeUp` (and companions
  `ElementResizers.jsx`, `TextNode.jsx`), **excluding** the Tailwind className edits. `main` currently
  dispatches `onChange` per pointermove on resize - this removes a live thrash.
  - *Depends on:* - · *Lane:* A (start now)
  - *Acceptance:* drag **and** resize stay smooth; a temporary `console.count` in `onChange` ticks
    **once per gesture**, not per frame; draft autosave/restore still correct; `build && preview` CSP pass.
- **E0.2 Retire `tailwind-refactor-wip`.** First rescue its reusable pieces (the `index.astro` utility
  patterns, `tailwind.config.mjs`, `check-css-bundle.js` scaffolding) by tagging the branch
  (`archive/tailwind-wip-2026-07`), then delete it so no one resumes the tangled branch in place.
  - *Depends on:* E0.1 · *Lane:* A

## E1 - Guardrails  ·  *parallel; these gate the risky work in E2–E4*

- **E1.1 CSP hash-verification CI gate.** On `build && preview`, diff the generated `<meta>` CSP hash
  list against every emitted inline script/style (sha256+base64), per CLAUDE.md's method. Fail CI on mismatch.
- **E1.2 SEO invariants test.** Assert exactly one `<h1>` per page; `<title>`, meta description,
  canonical, OG/Twitter present; JSON-LD (`SoftwareApplication` + `FAQPage`) validates; FAQ schema
  matches on-page FAQ.
- **E1.3 CSS budget guard.** Port `check-css-bundle.js` from the archived branch into CI so the global
  stylesheet can't silently regrow past a threshold.
- **E1.4 Editor interaction/visual test harness.** Cover the states unit tests miss: active outline,
  floating-toolbar visibility + top-edge flip, RTL toolbar alignment + leftward growth, dark mode,
  mobile full-width toolbar, whiteout bounds.
  - *Depends on (all E1):* - · *Lane:* B (parallel with A)

## E2 - Kill the global CSS monolith  ·  *Lane C, parallel with E3*

- **E2.1 Tokens as the only global CSS.** Keep `:root` design tokens global; audit for escaped color
  literals (`grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and `public/`) and route them through vars.
  - *Depends on:* - · *Lane:* C
- **E2.2 Colocate non-editor CSS into CSS Modules,** component by component (cards, hero, footer, dropzone, tool chrome).
  - *Depends on:* E2.1 · *Lane:* C
- **E2.3 Migrate editor `.sign-*` styles into scoped CSS Modules** (currently ~121 `sign-*` references
  in a ~3,400-line `global.css`), **preserving descendant cascades** (`.sign-element.active
  .sign-element-actions`) as real CSS inside module scope. *(Absorbs the old "colocate `.sign-*`
  styles" tech-debt note - now a first-class migration step, not opportunistic.)*
  - *Depends on:* E2.1, E1.4 · *Lane:* C
  - *Acceptance:* every conditional state (active, RTL, dark, mobile, whiteout) verified in a running editor.

## E3 - Tailwind on the static surface  ·  *Lane D, parallel with E2*

- **E3.1 Clean Tailwind install.** Re-audit the `legacy-peer-deps` need against the Astro `^7.0.3`
  security pin (`npm audit`) before adopting any Tailwind version that forces it.
  - *Depends on:* - · *Lane:* D
- **E3.2 Migrate the marketing `.astro` surface to utilities** (`index.astro`, tool pages, `FeatureCard`,
  `ToolHero`, `AppBar`, `Footer`). No editor components.
  - *Depends on:* E3.1, E1.1, E1.2 · *Lane:* D

## E4 - Headless TS editor core  ·  *Lane E, internally serial, parallel to E2/E3*

- **E4.1 Introduce TypeScript** to the element model, geometry math, and core (UI can stay JSX initially).
  - *Depends on:* - · *Lane:* E
- **E4.2 Extract a framework-agnostic `editor/` core** (document model + geometry + gesture
  controllers) with **one** "imperative-during, commit-on-release" controller unifying drag **and**
  resize, so they can't diverge again (ARCHITECTURE §3.2, §4). Preact becomes a thin render/event shell.
  - *Depends on:* E4.1, E0.1 · *Lane:* E
- **E4.3 Per-element-type registry** - each type a module `{ render, resizeBehavior, serialize, schema }`;
  removes the `type === 'line'` / `!isLine` branching in `handleResizeMove`. *(Supersedes the old
  lighter `geometryKind` half-measure - the registry is the chosen fix; per-type `nodes/` already exist
  as the seam.)*
  - *Depends on:* E4.2 · *Lane:* E
- **E4.4 Converge Sign and Redact** onto the shared core + a common PDF-workspace substrate
  (load, page render, draft persistence), removing duplication.
  - *Depends on:* E4.2, E4.3 · *Lane:* E

## E5 - Documentation  ·  *mostly done this session*

- **E5.1** `ARCHITECTURE.md` design standard - **done.**
- **E5.2** Realign `CLAUDE.md` + `README.md`; delete stale `TAILWIND_MIGRATION_LEARNINGS.md` - **done.**
- **E5.3** This backlog - **done.**
- **E5.4** Keep docs in sync as epics land (update CLAUDE.md status + this backlog per ticket). *Ongoing.*

## E6 - Carried-over backlog  ·  *postponed, off the migration critical path*

Triaged from the former `TODO.md` (KEEP-POSTPONED items, code-verified this session).

**Operational / SEO-launch** (most gated on the final domain / launch):
- Pre-launch **real domain swap** - `astro.config.mjs` `site` + sitemap/canonical still on the
  `pdkef.vercel.app` placeholder; re-verify canonical/OG after.
- **HSTS header** in `vercel.json` (`max-age=63072000; includeSubDomains; preload`) - only once the
  final domain is confirmed HTTPS-only.
- **Register Google Search Console** + submit sitemap once the domain is final; monitor Core Web
  Vitals (prioritize INP for signature drawing).
- **IndexNow** (low priority) - `public/<key>.txt` + deploy ping for faster Bing/Yandex indexing.
- **Homepage hub link check** - recurring guard: confirm no tool card points at a `noindex` route.
- **User feedback / suggestion channel** - prefer a GitHub Issues/Discussions link (zero new network
  surface, respects CSP `connect-src 'self'`); an in-app form would require documented CSP loosening
  for text only, never file bytes - weigh against the privacy positioning first.
- **Long-tail landing pages** - `/sign-pdf-no-signup`, `/offline-pdf-form-filler`, `/open-source-pdf-editor`.
- **OS-specific how-to guides** internally linking into the tools (no outbound promo links).
- **Public GitHub repo + iframe embed model** for contextual backlinks.

**Editor / UX polish:**
- **Verify Redact mobile toolbar** on a real narrow viewport - code updated (shared `.sign-toolbar`
  CSS, structure-agnostic mobile flex rule) but never visually confirmed.
- **State-based drag halo** - replace the single-value `.sign-element::after` grab halo with a small
  resting halo + a larger halo only on `.active` (which is `z-index:50`, so it won't steal neighbor clicks).

---

## Dependency / lane summary

```
Lane A (now):   E0.1 ──► E0.2
Lane B (now):   E1.1  E1.2  E1.3  E1.4        ── gate ──► E2.*, E3.2, E4 verification
Lane C:         E2.1 ──► E2.2, E2.3            (E2.3 also needs E1.4)
Lane D:         E3.1 ──► E3.2                  (E3.2 also needs E1.1, E1.2)
Lane E:         E4.1 ──► E4.2 ──► E4.3 ──► E4.4   (E4.2 also needs E0.1)
```

C, D, E run in parallel once B is in place. E0.1 unblocks E4.2. E6 is independent and can be picked
up opportunistically (its launch items cluster around the domain cutover).

---

## Done (historical log)

Verified done this session (were open in the old `TODO.md`, confirmed against code):
- **Header wordmark** - `AppBar.astro` renders the `PDkef` wordmark + logo; live in the header.
- **Desktop fullscreen button label** - `FullscreenButton.jsx` renders a "Full screen" / "Exit full
  screen" text label, used by both the Sign and Redact toolbars.
- **Founder story card real estate** - `index.astro`'s `whypdkef` card has distinct layout/styling
  (tag, signature, proof panel), reading as a signed note.

Earlier (pre-session) completed work:
- Add regression test for textarea cols constraint
- Fix vertical text wrapping regression
- Refine Text Element UX & Bounds
- Fix fullscreen button behavior on iOS
- Improve Redact PDF UI spacing and layout
- Fix text element minimum size and alignment
- Fix font list dropdown positioning
- Fix text element resizing sensitivity (proportional drag-vector projection replacing 1:1 pixel-to-point delta)
- Write JS tests for text element padding
- Fix text element bug 1: excess side growth (`min-width: 0` on `.sign-text-input`)
- Fix text element bug 2: Hebrew RTL right-side clipping (`padding: 0 4px`)
- Fix signature padding bug (fixed `padding: 4px` distorting percentage aspect ratio)
- Verify Whiteout bounds after padding removal
- Fix text element padding/wrapping (multiline) regression
