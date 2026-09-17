---
id: "QUAL-10"
title: "Saved-work restore must not shift Sign, Redact, or Merge"
status: "done"
priority: "P1"
epic: "site-quality"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-09-17"
---

# QUAL-10 · Saved-work restore must not shift the page

*Filed 2026-09-16 from the Vercel Speed Insights investigation.*

## Problem

`555d6dc3` made tool pages flow at their natural height, which fixed blank space
for normal visits. It also removed the desktop viewport reservation that had
absorbed Sign and Redact's asynchronous saved-work restore. A returning visitor
can therefore see the restored editor expand after first paint and push the
server-rendered content below it down the page.

Field data attributes the Sep 13-14 Desktop CLS regression to the ToolCard
island. A controlled 1440x900 restoration of real saved work measured CLS
0.440 on Redact and 0.584 on Sign after the change, versus 0.056 and 0.071
before it.

## Scope

- Reserve the prior desktop viewport geometry only while the blocking
  `data-draft-hint` marker says a current saved-work entry may be restored.
- Keep fresh visits in the natural-height layout and preserve the phone layout
  that deliberately stopped vertically centring short cards.
- Add real-browser restore assertions for Sign and Redact that measure CLS
  from navigation through restored editor readiness.

## Acceptance

- A saved-work restore for Sign, Redact, and Merge stays at CLS <= 0.01 in
  controlled Chromium runs at 1512x900, 900x900, and 390x844.
- Fresh desktop and mobile tool-page layout assertions stay green.
- The change passes the production build, CSP, CSS and targeted Playwright
  suites.

## Delivered

- The blocking head script now requires the current-entry pointer to appear in
  the synchronous recent-files index before setting the restore marker. A
  stale pointer therefore keeps the compact fresh-visit layout instead of
  reserving and later collapsing a desktop viewport.
- On desktop, only that validated saved-work state receives the former
  viewport/flex reservation. Fresh visitors still use the natural-height
  layout.
- The marker is independent of the user's Relaxed/Condensed preference:
  Relaxed keeps the reservation through restoration while ToolHero's compact
  presentation remains correctly gated to Condensed.
- Static follow-up cards stay visually hidden while a saved Sign/Redact
  document reconstructs, then appear only with the real editor shell. This
  avoids guessing a fixed height for arbitrary one- or multi-page PDFs.
- Opening or restoring an unchanged document no longer writes a duplicate
  draft after the load delay or flashes the `Draft saved` status; the first
  actual edit starts autosave.

## Verification (2026-09-16)

- `npm run build`
- `npm run test:csp`
- `npx vitest run src/editor-ui/useViewDensity.test.jsx`
- `npx playwright test src/tools/sign/e2e/sign-draft-restore.spec.js src/tools/redact/e2e/redact-draft-restore.spec.js e2e/tool-layout.spec.js --project=chromium`
- Controlled Sign saved-work restore at 900px: CLS `0.000`; the follow-up
  stream was never visible before the restored editor shell was present.

## Handoff (2026-09-17)

Worktree: `/Users/sh/work/pdkef/.claude/worktrees/cls-saved-work-restore`

Branch: `codex/cls-saved-work-restore`

The worktree is intentionally uncommitted and not deployed. Preserve all
changes; they are one integrated restore/CLS wave.

### Complete and green

- Sign strict saved-work acceptance passes at 1512x900, 900x900, and 390x844.
- Redact strict 77-page acceptance passes at all three viewports. Redact now
  waits for every PDF canvas to receive its final viewport dimensions before
  revealing the static content below the editor.
- An untouched restored Sign or Redact document no longer performs a redundant
  draft write or shows `Saving draft...` / `Draft saved`; a real edit still
  saves.
- Restored Redact work omits the newcomer-only `Tip: pick a tool...`; choosing
  a tool still shows the contextual instruction and Keep-tool switch.
- Sign and Redact's mobile file preview is inline beside filename/metadata
  instead of consuming a row above it. The four mobile/desktop identity layout
  assertions pass.
- Invalid Sign/Redact records are removed instead of recreating a stale restore
  marker on every visit.
- Merge has a pre-paint restore marker, hidden temporary/static content,
  restored-clean draft baseline, corrupt-recents fallback, and saved-revision
  dedupe. Its focused unit tests pass, but its visual acceptance is not yet
  green (below).
- Latest integrated non-browser verification:
  - `npm run build` passed.
  - `npm test` passed: 152 files, 2925 tests.
  - `npm run typecheck` passed with 0 errors (3 informational hints).
  - `npm run test:csp` passed for 42 HTML files.
  - Browser handoff suite: 17 passed, the three Merge cases below failed.

### Remaining tomorrow

1. Merge restore still fails the strict CLS threshold:
   - 1512x900: `0.10788598035236042`
   - 900x900: `0.09322598688271604`
   Add layout-shift source capture before changing more CSS. Two likely late
   shifts to verify are the readiness signal becoming true before
   `restoreHydrationComplete`, and the five-second restored-work sentence
   disappearing and collapsing its row.
2. Merge mobile acceptance times out while seeding the draft because it tries
   to click the desktop hover-only Rotate action. Seed a saved multi-file draft
   with a mobile-available edit (or no rotation) and keep the actual restore
   CLS assertions unchanged.
3. Rerun on a fresh preview port after the Merge correction:
   `PLAYWRIGHT_PORT=4191 npx playwright test src/tools/sign/e2e/sign-saved-work-restore-acceptance.spec.js src/tools/redact/e2e/redact-saved-work-restore-acceptance.spec.js src/tools/merge/e2e/merge-saved-work-restore-acceptance.spec.js e2e/editor-mobile-identity.spec.js e2e/tool-layout.spec.js --project=chromium --workers=1`
4. Once all three Merge cases pass, run the full unit/build/typecheck/CSP set,
   review the diff, then commit. Do not deploy until the user explicitly asks.

## Merge restore, closed out (2026-09-17)

Starting point `392a6547`: Merge restore CLS `0.10788598035236042` at 1512x900
and `0.09322598688271604` at 900x900; the mobile case timed out while seeding.

### What was actually moving

Layout-shift source attribution (a `PerformanceObserver` on `layout-shift`
with `entry.sources`, run against the built preview) put every point of both
desktop figures on `[data-tool-followups]` and `main`: the static content
under the workspace was revealed at ~74ms and then pushed down at ~116ms when
the grid mounted. Neither the rail nor the restore sentence contributed.

The cause was two readers of one hint disagreeing. The acceptance spec
deliberately corrupts the recent-files index; the head script keeps its
pre-paint marker in that case (the index is an optimisation, IndexedDB is
the truth), but `hasDraftHint()` returned `false`, so the island started as
"not restoring, no files" and removed `data-merge-restore` before IndexedDB
had answered.

Widening the spec's observation window past the five-second "Picked up"
sentence found three more movements the short window had hidden:

1. The rail's status row unmounted with the sentence, and the row carrying
   the Start fresh button was 15px taller than plain text (shift 0.0006).
2. The row then read "Saving draft…" and never stopped: once the effect
   consumed the restore-skip flag, the derived state took the settled
   restored revision for a pending write on the next unrelated render. The
   stored revision never changed; the label was wrong, and it was only ever
   hidden by the sentence.
3. At 900px the hero dropped 32px when the hint cleared (0.0046). The
   layout's compact-hero rules for Merge were dead CSS: written Astro-scoped
   in ToolPageLayout, they compiled against the layout's `data-astro-cid`
   while the hero carries ToolHero's. On the phone the header slot shrank
   4px when the sentence left (0.0016).

### Changes

- `src/lib/drafts/draftStore.js`: `hasDraftHint` mirrors the head script: a
  pointer whose index is unparseable keeps the hint. Unit test added.
- `src/tools/merge/PdfMergeTool.tsx`: one `workspaceReady` expression both
  releases the marker and sets `data-merge-workspace-ready`; a restored
  workspace keeps the rail status row (blank after the sentence) and a
  silent child in the phone header slot; `reset()` clears
  `isRestoredWorkspace`.
- `src/tools/merge/components/useMergeDraft.ts`: the settled restored
  revision reads as idle on every render (`settledRestoredRevisionRef`),
  with a re-render regression test.
- `MergeRail.module.css`: the status row is a 36px flex line, end-aligned.
  `MergeDocument.module.css`: the phone chip is 28px tall.
- `src/layouts/ToolPageLayout.astro`: the Merge hero rules are whole
  `:global()` selectors.
- The acceptance spec seeds the phone case by tapping the card (the action
  cluster is `display: none` until `data-selected` below 768px), asserts the
  sentence departs, and reads CLS only after it has.
- `useMergeDraft`'s derived state lets a cross-tab `conflict` win before the
  clean restored state (fresh review caught the ordering).
- Merged `origin/main` (SIGN-27). Its one-line, preview-less editor identity
  supersedes this ticket's phone preview grid, so
  `e2e/editor-mobile-identity.spec.js` was retired;
  `e2e/tool-toolbars/toolbar-phone-row.spec.js` is the phone guard. Redact's
  toolbar keeps SIGN-27's always-mounted status stack and passes an empty
  idle sentence on restored work. The Sign/Redact acceptance specs read
  SIGN-27's phone card as it is: the page-count meta text is present but
  not shown below 560px, and the keep-on switch is labelled "Keep on" there.

### Measurements after (controlled Chromium, built preview)

| Viewport | Merge restore CLS | follow-ups top | status shown | stored revision |
| --- | --- | --- | --- | --- |
| 1512x900 | 0.000 (one 0-value thumbnail entry) | one value | none | unchanged |
| 900x900 | 0.000 | one value | none | unchanged |
| 390x844 | 0.000 | one value | none | unchanged |

Observed through 7.5s after navigation, so past the five-second sentence.

Sign and Redact strict acceptance stayed green at all three viewports on the
merged tree, as did the tool-layout and SIGN-27 phone-row guards. The full
non-browser chain passed: 154 unit files / 2931 tests, typecheck 0 errors,
backlog, guidance, editor dependency directions, module boundaries, gesture
golden rule, class resolution, fonts, licences, dependency governance, CSP
(42 pages), SEO, redirects, CSS ratchets, page weight.

### Left open

- Between 768 and 1023px the restore sentence has no placement at all (the
  rail is hidden, the phone chip is desktop-hidden). A restored tablet
  workspace says nothing about being restored. Product question, not a CLS
  one.
- A fresh pick's first "Saving draft…" still appears 700ms after the edit in
  a row that did not exist before; that is user-input-adjacent and tiny, and
  left as is.
