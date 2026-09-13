---
id: "MERGE-16"
title: "Read the merge funnel before and after each phase, with the guardrails that keep it honest"
status: "done"
priority: "P2"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-03"]
legacy_state: "Open"
---

# MERGE-16 · Read the merge funnel before and after each phase, with the guardrails that keep it honest

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

The aim of this epic is people returning and recommending, and merge rankings are an authority fight
(SEO-35), so the UX work is measured on use, not on position. The lifecycle events already exist and
carry nothing identifying (`ANALYTICS.md`): `tool_file_accepted`, `tool_operation_started`,
`tool_result_ready`, `tool_operation_failed`.

**Before anything ships**, record the baseline in this ticket: accepted to ready conversion for
`merge`, failures per accepted, split by viewport class if the dashboard allows it, over the last 28
days. Re-read after each phase (0: MERGE-01..05, 1: MERGE-06..07, 2: MERGE-08..12, 3: MERGE-13..14)
and keep the table here. Referring domains and stars stay in SEO-03; read them alongside, never
attribute them to this alone.

**Guardrails** land with the phase they protect, one Playwright spec per phase under `e2e/merge/`,
roughly one e2e per ten unit tests as CLAUDE.md asks: single-button done state (MERGE-03), the phone
toolbar and pinned button (MERGE-06), strip page count (MERGE-08), the two-tap path (MERGE-11),
Download-ready time on the 20-file fixture (MERGE-12), crash restore (MERGE-13).

**Acceptance.**

- Baseline table in this ticket before MERGE-03 merges to `main`; one row per phase afterwards.
- Each listed guard exists and is green in `ci.yml`'s Playwright step.
- The Speed Insights view for `/merge/` shows no regression in INP after MERGE-08 and MERGE-12.

## Updates

- 2026-09-13: the guards exist and are green in the full Playwright run (248 passed, 3 pre-existing
  font guards skipped): `merge-layout.spec.js` (single Download control, two-tap path),
  `merge-mobile.spec.js` (phone hero, one-line sort row, pinned button, two-tap path at iPhone 15 on
  the webkit project), `merge-strip.spec.js` (page count equals the sum of the files, rotate, skip,
  keyboard move, strip drop), `merge-ready-time.spec.js` (ready time and cancellation on the
  20-file fixture), `merge-restore.spec.js` (crash restore), `merge-handoff.spec.js`,
  `merge-insert.spec.js`, `thumbnail-render.spec.js`. The baseline funnel read and the per-phase
  rows need the Vercel dashboard and are Shlomi's, as is the Speed Insights INP read after deploy;
  `ANALYTICS.md` records that Merge's `tool_operation_started` now fires on the Download tap so the
  read compares like with like. Guards done; the readings stay open with Shlomi.
- Direction A (2026-09-13): the guards follow the new structure (rail rows, the wrapping grid, the chip row and bottom sheet at iPhone 15 on both engines, the grid cell thumbnail for the pixel guard) and three joined in merge-direction-a.spec.js: the Download element keeps its DOM node across preparing and ready, a caption's centre resolves to the caption under elementFromPoint, and the phone subhead shows one whole sentence with no clipped line. 29 passed on chromium and webkit against the 4173 preview.
