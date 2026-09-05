---
id: "MOBI-03"
title: "Recover fillable geometry from a flat form's own vector content"
status: "open"
priority: "P1"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MOBI-03 · Recover fillable geometry from a flat form's own vector content

## Scope and acceptance

**The forms people actually receive have no form fields, and the boxes are right there in the page
geometry.** Two official Israeli government forms were measured for this ticket. Israeli income tax
form 101 (`itc101`, "כרטיס עובד", 2 pages, A4) and the National Insurance health declaration
(`services_health-declaration-2021`, 1 page). Neither has an `/AcroForm` entry. Neither has a single
`/Annots` widget. Both are nonetheless fully digital vector documents with real text layers, not
scans: form 101 embeds 7 fonts and no images at all, and the health declaration embeds 7 fonts, 844
text-showing operators, and exactly one 58x74px state emblem.

So the ruled boxes a person is meant to write into are ordinary drawing operators in the content
stream, and they can be recovered without OCR, without a model, and without a network call. Measured,
on page 1 of each:

| Form | Primitive | Recovered |
| --- | --- | --- |
| Income tax 101 | stroked vertical ticks (`m`/`l`/`S`) | 336 ticks → **17 comb runs covering 184 cells**, dominant pitch 11.4pt |
| Health declaration | filled rectangles (`re`) | 1,635 rects → **127 checkbox-sized squares** (dominant 6.6x6.6 and 7.6x7.6) and **2 comb runs covering 42 cells** |

**Two findings from that table are the whole difficulty, and both were surprises.** First, the two
forms draw the same visual object with *different primitives*: form 101's comb cells are stroked line
segments, the health declaration's are filled rectangles. A detector that handles one finds nothing at
all in the other, which is exactly what the first probe did. Second, **the geometry is only recoverable
with a CTM-aware walk.** Form 101 issues 370 `cm` operators on page 1, so raw operand coordinates
share no baseline and naive extraction finds zero runs out of a true 17. Applying the current
transformation matrix takes it from 0 to 17. Do not build this on a regex over the content stream.

Build the detector as a pure module under `src/editor/` with no Preact and no DOM, taking a page and
returning candidate regions in the page coordinate space the editor already uses. Route the
coordinates through the single page-coordinate transform (SIGN-05, ARCH-02); do not add a second copy
of that math. Two region kinds are in scope: a **comb run** (at least five equal cells on one baseline
at a regular pitch) and a **checkbox** (an isolated near-square in the checkbox size band). A run must
tolerate one wider gap without splitting, because form 101's identity-number combs are grouped and the
pitch conformance measured 8 of 11 on those rows for that reason alone.

Everything else is a later ticket. This one detects and reports; MOBI-04 and MOBI-05 make the regions
do something.

**A corpus is part of the deliverable, not a follow-up.** A geometric heuristic with no fixtures
regresses silently, which is the failure mode this repo already spends guards on everywhere else.
Commit the blank official forms as fixtures with their expected region counts, and assert the counts.
Two rules on the fixtures: only blank official templates, never a copy anyone has filled in, and check
each form's redistribution terms before committing it rather than assuming a public government form is
freely redistributable.

**Acceptance.** The detector recovers at least the 17 comb runs and 184 cells measured on form 101
page 1, and at least the 127 checkbox squares and 2 comb runs measured on the health declaration, from
committed fixtures, with the numbers asserted rather than eyeballed. It handles both the stroked-tick
and the filled-rectangle primitive, proven by the fact that both fixtures pass. A false-positive budget
is stated and measured, not assumed: report how many detected regions are not real fields on each
fixture, because a detector that offers a hundred wrong targets on a phone is worse than none. Runs
entirely on-device. No page is modified.
