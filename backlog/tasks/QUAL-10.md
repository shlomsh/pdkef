---
id: "QUAL-10"
title: "Saved-work restore must not shift Sign, Redact, or Merge"
status: "open"
priority: "P1"
epic: "site-quality"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
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
