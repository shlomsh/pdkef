---
id: "FORM-21"
title: "The scored corpus locks in gains and names every regression"
status: "open"
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

- [ ] `score-form.mjs --all` prints a signed delta per form and per kind against `baselines.json`,
      marks any drop, and ends with one summary line (forms improved / unchanged / regressed).
- [ ] `scoring.test.js` fails when a score rises more than `SLACK` above its baseline, with a
      message saying to re-record (the ratchet only moves when someone writes the new number down).
- [ ] Per-kind precision is recorded in `baselines.json` and ratcheted like per-kind recall.
- [ ] Baselines re-recorded with a dated note; no detection code changes; README updated.
- [ ] Each new check is sabotage-checked (a nudged number makes it fail) in the commit notes.
