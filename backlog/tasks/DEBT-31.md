---
id: "DEBT-31"
title: "Error reports carry the last few UI actions, so a crash's trigger is read, not inferred"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-27"]
---

# DEBT-31 · Error reports carry the last few UI actions, so a crash's trigger is read, not inferred

*Filed 2026-10-01, from the first day of field data (DEBT-30).* The Merge crash report named the
browser, the page and the exact line, which was enough to find the bug. Its trigger (Clear all,
then add files again) was not in the report: it was inferred from the effect's dependencies, and
then confirmed by a test. That works when the trigger is visible in the code; it does not for a bug
that needs a particular sequence of clicks.

## What to build

- A per-page ring of the last 10 UI actions, each a name off a closed list (`add_files`,
  `remove_file`, `clear_all`, `reorder`, `rotate`, `undo`, `export`, `share`, `replace_file`,
  `arm_tool`, `place`, ...), pushed from each tool's action handlers through one small helper in
  `src/lib/`. No free text, no counts, no positions, nothing from a document: the same kind of value
  as `step`.
- `errorReportSchema.ts` gains `actions: readonly string[]` (0 to 10, each off the list), validated
  on both sides like every other field; the sample stored per fingerprint carries it.
- `errors:read` prints the actions under each sample, oldest first.
- The privacy page and `ANALYTICS.md` / `docs/maintenance-telemetry.md` say it, in Shlomi's words.

## Decision (2026-10-02)

Shlomi kept the privacy page to one clause, appended to the crash note's list: "and anonymous crash
data to fix unreported runtime errors". The closed list of action names is disclosed only in
`docs/maintenance-telemetry.md` and `ANALYTICS.md`.

## Acceptance

- [x] The list and the helper exist (`ACTIONS`, 28 names, in `errorReportSchema.ts`;
      `src/lib/actionTrail.ts`, a ring of 10 that drops an immediate repeat); all nine tools record
      their main actions from their handlers, at the commit of a gesture and never from a move,
      with a trail test per tool.
- [x] The schema accepts only names off the list, adversarially tested; the largest valid report is
      1,538 bytes against the 2,048 limit.
- [x] DEBT-30's sequence replayed in Chromium against a production build with the Merge bug put
      back, through the real endpoint and the real store: the uncaught `TypeError` in Sortable's
      `destroy()` arrived with `actions: add_files, clear_all, add_files`, and `errors:read` printed
      it. The trigger that had to be inferred is now read. The replay's entries were removed.
- [x] The disclosure is literally true: the privacy page, `docs/maintenance-telemetry.md` (the full
      list) and `ANALYTICS.md`.
- [x] A fresh review found five should-fix points, all fixed: load and export are recorded before
      the work that may throw (Sign, Redact, Edit Pages), so the trigger is in the trail of a crash
      during them; a draft restore and automatic field detection are no longer recorded as the
      person's actions; a report from an older cached build, which sends no `actions`, is still
      counted (empty list) instead of dropped; the trail ignores any name off the list.
- [ ] `check:push` green on the fixed branch, pushed.

## What it leaves out, on purpose

Zoom and the shell's own recents menu are not recorded (they live in shared code the tools do not
own), nor is a person's typing, positions or file names. Merge and Split build automatically on idle,
so they record no `export`.
