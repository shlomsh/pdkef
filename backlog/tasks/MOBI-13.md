---
id: "MOBI-13"
title: "A scored form corpus: precision and recall measured every run, ratcheted so a gain is never quietly lost"
status: "in_progress"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-11"]
---

# MOBI-13 · A scored form corpus: precision and recall measured every run, ratcheted so a gain is never quietly lost

## Why

Two machines exist and they do not talk to each other.

**Regression:** `src/editor/adapters/pdf/corpus/` answers "does this element still behave the way we
decided". One row per element, real PDFs, 75 tests. It cannot say whether the detector is getting
better or worse on real forms, and it says so in its own README.

**Quality:** MOBI-10's spike left a genuine evaluation harness - `scripts/spike/mobi-10/score.mjs`
(IoU >= 0.5 one-to-one greedy matching, kind-compatibility groups, per-kind recall and precision
read from both sides, label association, confidence calibration), a data contract (`CONTRACT.md`),
two hand-reviewed ground-truth files (75 and 139 targets), and `overlay.mjs` to eyeball a result.
It runs by hand, against source PDFs that are not in the repo, and has not been run since the
numbers in `docs/mobi-10-field-map-spike.md` were recorded.

So today a change can improve recall and nobody notices, or cost 20 points of recall and nobody
notices - which is the half that matters. The target is one machine: add a form, annotate its true
fields once, and from then on every run both proves the old forms still work and measures how well
the detector does on all of them.

## Measured 2026-09-20, before any of this ticket's work

A ~40-line bridge from the product detector to `CONTRACT.md`'s `CandidateField`, scored against the
committed ground truth. Page sizes match the truth files exactly, so coordinates line up:

| Form | recall | precision | recorded in the spike |
| --- | --- | --- | --- |
| health declaration | **86.7%** | 80.2% | 86.7% / 94.2% |
| income tax 101 | 42.4% | 79.7% | 69.1% / 91.4% |

Health recall reproduces exactly. Both shortfalls have one cause, and it is the decision below:
**the committed fixtures are geometry-only.** They were reduced for the comb-geometry e2e tests and
drop the text layer, so `collectCheckboxGlyphs` finds none of form 101's 36 detectable checkboxes
(36/139 is ~26 points, almost exactly the 42.4 -> 69.1 gap) and `formCells`' own-text filter never
fires (which is why health precision lands on 80.2%, the spike's *pre-fix* number - that fix was
text-dependent).

## The decision this ticket cannot make for itself

**What document artifact may be committed?** Until the fixture carries text, CI cannot reproduce
true numbers. Three options, in the owner's gift:

1. Commit the original PDFs. Both are public Israeli government forms; the objection is repo weight
   and taste, not licensing. Note this is unrelated to "no file bytes leave the device", which is
   about a visitor's own files at runtime.
2. Commit a richer *scoring reduction* that keeps text, glyphs and paths but drops images - bigger
   than today's geometry-only fixture, still derived, still reviewable.
3. Leave originals out, and let the scored run be a local/manual step with the ratchet covering only
   forms whose artifacts we do commit.

Everything below is deliberately independent of that choice.

## Scope

- [ ] **One shared pipeline.** `corpus.test.js` re-implements what `useFormFieldRegions.ts` does;
      the scoring bridge would be a third copy. Extract it once, in the corpus package, and have
      both use it. This is a down payment on ARCH-24, not a competing design.
- [ ] **A committed bridge**, product regions -> `CandidateField`, pure and tested.
- [ ] **The matcher lifted into the corpus package**, with `score.mjs` importing it rather than
      owning it - the same direction MOBI-11 step 1 took for `cells.mjs` and `label.mjs`. It already
      exports `iou`, `kindsCompatible` and `greedyMatch` and guards its CLI, so this is a move, not
      a rewrite.
- [ ] **The practice form as the third scored form, and the first Latin one.** It is self-labelling:
      its nine AcroForm widgets *are* the truth, exact to the point, no annotation pass and no
      eyeballing needed. Annotate its kinds honestly (a signature field is `signature`, not `text`),
      so it reports our real gaps rather than a flattering 100%.
- [ ] **Baselines and a ratchet.** Per form, per kind, recorded; the test fails when a number drops.
      Like the CSS ratchets, it only ever goes down by a deliberate edit that says why.
- [ ] **A documented "add a form" path**, so the loop is repeatable by someone who was not here:
      commit the artifact, produce ground truth (a model proposes, a person eyeballs with
      `overlay.mjs`), record the baseline, done.

## Not in scope

Improving recall. This ticket builds the instrument; it does not move the needle, and a change that
does should be a separate ticket whose evidence is this instrument's numbers moving.

## Acceptance

- [ ] One command scores every committed form and prints a per-form, per-kind table.
- [ ] A baseline drop fails the test, naming the form, the kind and both numbers. Sabotage-checked.
- [ ] The corpus and the scored set share one detection path and one fixture set.
- [ ] Adding a form is documented in the corpus README and needs no new test code.
- [ ] The fixture decision above is recorded here with its date and reason once made.
