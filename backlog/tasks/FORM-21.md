---
id: "FORM-21"
title: "The scored corpus locks in gains and names every regression"
status: "in_progress"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-21 · The scored corpus locks in gains and names every regression

## Why

Detection is meant to be swappable: a strategy changes, the contract stays, and the KPIs say what
moved. Today the scored corpus (`corpus/scoring/`) ratchets a floor per form (recall, precision)
and per-kind recall, with `SLACK` below each. Three things slip through:

- **Unrecorded gains.** A change that lifts a form above its baseline passes without re-recording,
  so a later change can give the gain back and still pass.
- **Per-kind precision.** Only recall is pinned per kind, so a kind can start producing false
  positives while another kind's gain holds the form's total up.
- **Reading the result.** `score-form.mjs --all` prints current values with the baseline in
  parentheses; spotting a regression means subtracting by eye.

This is the harness every refactor after it (ARCH-24, FORM-22..24) proves "unchanged" against, so
it goes first.

## Acceptance

- [x] `score-form.mjs --all` prints a signed delta per form and per kind against `baselines.json`,
      marks any drop, and ends with one summary line (forms improved / unchanged / regressed).
- [x] `scoring.test.js` fails when a score rises more than `SLACK` above its baseline, with a
      message saying to re-record (the ratchet only moves when someone writes the new number down).
- [x] Per-kind precision is recorded in `baselines.json` and ratcheted like per-kind recall.
- [x] Baselines re-recorded with a dated note; no detection code changes; README updated.
- [x] Each new check is sabotage-checked (a nudged number makes it fail) in the commit notes.

## Review follow-up (2026-09-25)

A review of the first pass (`32d91483`) found three gaps, now closed in this same ticket:

- The four per-kind checks in `scoring.test.js` iterated `Object.entries(form.byKind)` - the
  baseline's own keys - so a kind present only in the actual run (appeared) or only in the baseline
  (vanished) was never visited by either loop. Both checks now iterate the union of the baseline's
  and the actual run's kinds; a vanished kind fails as a regression, an appeared kind fails as an
  unrecorded change.
- `score-form.mjs --all`'s `classify()` only iterated the actual run's kinds (the same union bug) and
  only set the non-zero exit code on `regressed`, not on `improved` - so a ceiling breach or an
  appeared kind could pass `--all` while `scoring.test.js` failed on it. `--all`'s verdict is now
  built by a `findings()` function that walks the same union, the same floor/ceiling pairs and the
  same exact-count comparisons `scoring.test.js` does; both `regressed` and `changed` (renamed from
  `improved`, which was misleading for a value that just appeared) exit non-zero.
- `baselines.json` recorded only rounded percentages, so two different underlying counts could round
  to the same number and pass unnoticed. Every form and every kind now also carries the exact raw
  integer counts (`targets`/`candidates`/`matched` per form; `targets`/`found` for recall and
  `candidates`/`matchedCandidates` for precision per kind) that `score.js` already computed on the
  way to each percentage, and `scoring.test.js` checks them with exact equality (no `SLACK`).

Re-recorded from the current detector with no detection code change; every percentage in
`baselines.json` is unchanged from `32d91483`. Sabotage-checked again (see the commit message for the
three results). Left `in_progress`: FORM-21 is the harness later refactors (ARCH-24, FORM-22..24)
prove "unchanged" against, so it is worth one more pair of eyes before closing.
