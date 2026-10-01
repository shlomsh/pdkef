---
id: "FORM-10"
title: "The undivided-panel test reads the whole page, and a lone tick square survives only by accident"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-10 · The undivided-panel test reads the whole page, and a lone tick square survives only by accident

## Why

`buildClosedCells` in `src/editor/adapters/pdf/formCells.js` drops a row band whose interior has
fewer than three distinct vertical edges (`xs.length < 3`). The rule is sound and its comment says
why: every instructional or explanatory panel observed on both spike forms is one bordered
paragraph with no internal rule, while every real labelled-field row sits next to at least one more
column. Requiring a genuine interior wall drops the panels and keeps the rows.

The bug is where the edges come from. The test is computed from a **page-global** edge list, not
from the band's own x-range. That is accidental, not designed, and it changes what the rule means:
a band is judged by ink that may be nowhere near it.

Measured on the health declaration, 2026-09-20. A lone checkbox square's own top rule spans only
the square, so inside its own x-window the band has exactly two edges and the rule would drop it as
an undivided panel. Those squares are detected today **only** because unrelated ink elsewhere on
the same page contributes a third edge to the same band. Production depends on the leak.

The evidence is an attempt to fix it halfway. Scoping the edge list to the band's own spans, and
changing nothing else, took the health form from **86.7% -> 84.0% recall** and its `text` kind from
**66.7% -> 53.3%**, losing 29 cells, every one of them a lone tick square.

So this is a latent correctness bug that current behaviour leans on, and it has to be fixed
deliberately and as a pair:

1. scope the panel test to the band's own spans, and
2. give a lone closed square its own admission path, so it is kept for what it is rather than for
   what an unrelated rule elsewhere on the page happens to add.

Doing only the first is a regression, and it is a regression that looks like a cleanup, which is
why it is written down here rather than left for someone to find mid-refactor.

**Priority P2:** nothing is broken for a person using the tool today, but every future change to
band construction is standing on this, and the failure mode is a quiet recall loss rather than an
error.

## Scope and acceptance

- [ ] Scope the `xs` list to the band's own spans, and add the admission path for a closed square
  that stands alone, **in one change**. Neither half lands on its own.
- [ ] The admission path is a rule about a square, not a loosening of the panel test: the panel
  test should still drop a bordered paragraph whose interior is one wide undivided box.
- [ ] Health recall must not fall below 86.7% and `text` recall must not fall below 66.7%; the
  ratchet in `src/editor/adapters/pdf/corpus/scoring/baselines.json` is the arbiter. Re-score with
  `node scripts/score-form.mjs --all` and re-record any number that goes up in the same change.
- [ ] Unit fixtures in `formCells.test.js`, synthetic ink rather than a real form, in the style of
  the tick-column tests: a lone square in a band with no other ink in its x-window (kept), the same
  square with unrelated ink elsewhere on the page (kept, and kept for the same reason), and a
  one-paragraph bordered panel (still dropped).
- [ ] Add an element-corpus row for the panel that must stay dropped, per
  `src/editor/adapters/pdf/corpus/README.md`. The negative row is the one that matters here.
- [ ] Replace the comment above `xs.length < 3` with what the rule actually means once it is
  band-local, so the next reader does not have to re-derive the page-global history.

Note for whoever picks this up: the fixture corpus carries no text layer, so the numbers it prints
are not the numbers the real form produces. FORM-11 is about that blind spot; read it before
trusting a fixture-only delta.

## 2026-10-01 done

`buildClosedCells` (`formCells.js`) now judges a box as lone from the walls inside its own band span
(`bandSpan`: the stretch its top and bottom rules share with its column, chained while they touch), not
from every wall at the same heights anywhere on the page. That alone is the known regression, so a closed
square of up to 20pt with no text of its own is admitted as a checkbox on its own merits, with no caption
and no neighbouring column to lean on (`isSquare`). Squares under 15pt keep the existing tick-column
rule: admitting them dropped health precision from 100 to 91.5. A second clause was needed that the
ticket did not predict: a lone box that abuts a cell of similar height in its own column (`isStackedRow`)
is one row of a divided box and skips the lone-box caption test, because with span scoping alone the SA100's
two-line answer box lost its target (recall 100 -> 93.3). Scored forms: 0 changed, 9 unchanged (health
86.7 recall, 100 precision). Two element-corpus rows pin it: an undivided panel holding its own paragraph
stays dropped beside unrelated ink, and a lone 18pt square with nothing else on the page is kept; three
unit tests in `formCells.test.js`.
