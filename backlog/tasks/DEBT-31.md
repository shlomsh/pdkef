---
id: "DEBT-31"
title: "Error reports carry the last few UI actions, so a crash's trigger is read, not inferred"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-27"]
needs: "The privacy-page sentence for action names in error reports"
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

## Acceptance

- [ ] The list and the helper exist; every tool's main actions push to it (a unit test per tool
      that its handlers record the right names).
- [ ] The schema accepts only names off the list, adversarially tested as the other fields are.
- [ ] DEBT-30's sequence replayed against a build with the Merge bug put back: the report's actions
      read `add_files, clear_all, add_files` (or the tool's real names for them).
- [ ] The disclosure is literally true afterwards.
