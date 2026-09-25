---
id: "SNG-11"
title: "The precision floor: detection is shown only where it is right 95% of the time, scored the way the person meets it"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: []
---

# SNG-11 · The precision floor: detection is shown only where it is right 95% of the time, scored the way the person meets it

*Filed 2026-09-25* from Shlomi's call that the next generation assumes only reasonable precision and recall
(`docs/sign-next-gen.md` §5.6, `docs/sign-next-gen-guidelines.md` §1).

A dashed mark, a walk stop and a review highlight are claims the person acts on. Measured precision today
ranges from 100% down to 23.5% (ภ.ง.ด.90) and 4.3% (HMRC SA100, where each digit square reads as a
checkbox). Walking someone through 89 false stops is the "cry wolf" failure the research names: people stop
trusting even the right marks.

Recall stays what it is. It is recorded and ratcheted, but it is never a UI promise.

## What to build

- **Define the shown set:** what the UI marks, walks and highlights, after `reconcile` and after the person's "Not a field" verdicts.
- **Score it.** Add shown precision and shown recall per form to `score-form.mjs` and `baselines.json`, beside today's raw numbers.
- **Meet the floor:** at least 95% shown precision on every corpus form. The mechanism is open:
  - a per-candidate confidence threshold;
  - a per-document coherence gate (for example, rows of equal squares read as a comb, not as checkboxes);
  - or both.
- A form that cannot meet the floor shows nothing. The page then behaves as a scan does: tap to write, lined up with the print.

## Where

- `src/tools/sign/fields/` (pure; the `test:detection-purity` guard applies).
- `src/tools/sign/fields/corpus/scoring/` and `scripts/score-form.mjs`.
- Coordinate with whoever holds the FORM epic's detection work at the time, since this is a new consumer contract on its output.

## Acceptance

- [ ] `score-form.mjs --all` reports shown precision and recall, and `baselines.json` ratchets them.
- [ ] Every corpus form reaches at least 95% shown precision.
- [ ] HMRC SA100 and ภ.ง.ด.90 show only what clears the floor, possibly nothing.
- [ ] The floor is one exported value that the UI reads. No view filters detection on its own.
