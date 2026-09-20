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

## Fixture decision: committing the originals was chosen, and is DONE (2026-09-20)

Shlomi chose option 1 - commit the two Hebrew originals - on 2026-09-20. An earlier session could
not carry it out: its egress policy denied the public web at the gateway, so `www.gov.il` and every
other candidate host answered `403 CONNECT tunnel failed`. A later session on an environment whose
policy allows the public web fetched both, checked both sha256s against the values recorded here
(they matched, so the committed ground truth still describes the form), and landed them in
`src/editor/adapters/pdf/corpus/scoring/forms/`.

| form | sha256 | url |
| --- | --- | --- |
| itc101 | `a5bfa867340f6569fb4e7d98e83a421e362f5c4b5ecf32037d6b51869913f8ad` | https://www.gov.il/BlobFolder/service/itc101/he/Service_Pages_Income_tax_annual-report-2024_itc101.pdf |
| health | `ccd0cb0257126e55192dda3c6cac822c0d3fdf785bbef9780f7e6ded94adba53` | https://www.gov.il/BlobFolder/service/issue_firearms_license_to_a_private_individual/he/services_health-declaration-2021.pdf |

### The outcome, and the second cause the first one was hiding

| form | was (geometry-only) | now (original) | spike's recorded |
| --- | --- | --- | --- |
| health | 86.7% / 80.2% | **86.7% / 94.2%** | 86.7% / 94.2% |
| itc101 | 42.4% / 79.7% | **69.1% / 91.4%** | 69.1% / 91.4% |

Both reproduce the spike exactly, to the decimal. That is the strongest evidence available that the
committed instrument and the hand-run spike measure the same thing, and it is worth more than either
number on its own.

**itc101 moved on the file alone, and health did not move at all.** The prediction above was half
right, and the half it got wrong is the useful part. Two different things read a PDF's text and they
were being treated as one:

- `collectCheckboxGlyphs` reads glyphs off the **content stream** via pdf-lib. The reduction had
  stripped them, so committing the original was enough: 36 of the 62 checkbox targets came straight
  back. (The remaining 26 are drawn squares, which is the element corpus's standing `known gap` row,
  not a fixture problem.)
- `formCells`' own-text filter is fed by the **pdf.js text pass**, which `detect.js` does not run and
  says so in its docstring. No fixture could have fixed that. `health` precision sat at 80.2%
  with the original committed, exactly as it had with the reduction.

So `score.js` now does its own pdf.js text pass and feeds `detectPage`, because
`useFormFieldRegions.ts` does one and a score of a pipeline we do not ship is not a measurement.
That is what took health to 94.2% and itc101's precision to 91.4%. The conversion from pdf.js items
to `formCells`' shape is now one shared module, `src/editor/adapters/pdf/textRuns.js`, rather than a
copy in each caller. The element corpus still runs without text, deliberately and for the reasons in
`detect.js`: it isolates a geometry rule, where this measures the shipped pipeline.

The lesson worth keeping: **"the fixture is the problem" was a correct diagnosis that explained only
one of the two symptoms**, and the one it did not explain went unnoticed because it was filed under
the same cause. A gap that a change was predicted to close and did not is evidence, not noise.

## Candidate forms: the shortlist, now fetch-verified (2026-09-20)

The shortlist below was researched from search snippets alone, because that session's egress policy
blocked the web. A later session fetched and measured every lead. **Two of the three "safe" picks
had a false premise**, which is the argument for never committing to a lead you have not opened.

### What the measurements changed

| Claim from the shortlist | What the file actually is |
| --- | --- |
| IRS 1040 **1913** is a scan, and fills the "zero scanned forms" gap | **False.** A clean vector re-typesetting (Distiller 4.05, 2000), 165 text items on page 0, **zero image XObjects** on any of its 4 pages. It cannot show us anything about a text-free page. It is an outlier in its own archive: its neighbours really are scans. |
| `irs.gov/pub/irs-pdf/f1040.pdf` is the 2024 form | **Rolled over.** That path is always the current year and now serves 2025. The 2024 revision is at `irs.gov/pub/irs-prior/f1040--2024.pdf`, which is also the stable URL a recorded sha256 wants: a current-year path changes underneath its own hash every January. |
| ECI Form 6 Hindi is "unclear" licensing | **Blocked, and the file could not even be found.** See below. |

### Where the scanned forms actually are

The IRS switched from scan-to-PDF to vector re-typesetting between 1950 and 1955. Everything
measured from 1955 back to 1918, and forward to 1980, is a pure raster scan with **zero text items
on every page**. 1940 and 1950 are transitional and do carry text layers. So the gap is easy to fill
with a public-domain file, just not with the one the shortlist named:

| Form | bytes | page 0 content | why it is interesting |
| --- | --- | --- | --- |
| `f1040--1970.pdf` | 174K, 2pp | one CCITT G4 image, 2925x4105, 1bpc | the cheapest true scan; page 1 is a different size from page 0 |
| `f1040--1962.pdf` | 553K, 2pp | one **Flate** bilevel raster, 4824x6710 | a **CropBox whose origin is not 0,0** (y=23.04), and a second decode path |
| `f1040--1944.pdf` | 736K, 4pp | **25 stacked CCITT strips** | one page sliced into 25 image XObjects, which breaks any "find the page image" assumption |

All three are US federal works, public domain under 17 U.S.C. 105.

**A real hazard came out of this, and the repo was already defended against it.** pdf.js 6 decodes
CCITT fax and JBIG2 through its WASM module, and a `getDocument()` call with no `wasmUrl` renders a
scan as a **silently blank page** - a warning, no error. `src/lib/pdfjsWasm.js` exists for exactly
this and `pdfjsWasm.test.js` walks `src/` to fail any call site that forgets. It caught the scored
corpus's new pdf.js pass the same day, before any scan was committed.

### Licensing: the Indian homework, done

The terms pages were read this time rather than guessed at.

**ECI Form 6 (Hindi): BLOCKED.** Three independent reasons, any one sufficient:

- **eci.gov.in grants nothing.** Its own footer asserts `(c) Copyright Election Commission of India`
  and its terms page says all content "is the exclusive property of the ECI and is protected under
  Indian copyright laws". A search of the site's full application bundle for any reproduction
  permission found none. GODL is not asserted anywhere on it.
- **The state CEO sites, which are the class of site that hosts this form, restrict it** and do not
  even agree with each other. CEO Puducherry permits reproduction free of charge but states
  "Commercial use of web contents is prohibited without the written permission of the Department".
  CEO Uttarakhand requires permission "by sending a mail to us" for any reproduction. `ceodelhi.gov.in`,
  the shortlist's own source, is unreachable, so its policy is unread.
- **The Hindi file could not be located at all.** `voters.eci.gov.in/formspdf/Form_6_Hindi.pdf`
  answers 406 across six filename variants, while `Form_6_English.pdf` and `Form_8_English.pdf`
  both serve a real PDF from the same directory.

Silence about redistribution is a block, not a gap to read hopefully. This closes the most valuable
structural candidate, so if Devanagari matters it should be **generated** as a synthetic corpus
document we own outright, which is what `documents.js` is for.

**ITR-1: permitted, but unverified as a file.** Both the e-filing portal's live policy page and the
department's own copyright policy grant reproduction "free of charge... without specific permission",
with no commercial restriction and no third-party carve-out that would bite here. The conditions are
accurate reproduction and prominent source acknowledgement. But `incometaxindia.gov.in` answers 403
and **not one byte of an actual ITR-1 PDF was downloaded**, so the file itself stays unverified. Note
also that this is a permission rather than an open licence: it is not ours to sublicense, so the repo's
MIT grant would not extend to it and a NOTICE beside the fixture would have to say so. ITR-1 is
English anyway, so it buys far less than Form 6 would have.

## Corpus widened: IRS Form 1040, tax year 2024 (2026-09-20)

Committed from `irs.gov/pub/irs-prior/f1040--2024.pdf` (sha256
`0a7a54354283044cb41373c6faabfa50955d44bdf91b4b76fa1ca2bf13f6d718`), public domain under
17 U.S.C. 105. The prior-year path rather than `irs-pdf/f1040.pdf`, because that one is always the
current year and would change underneath its recorded hash every January.

The first live AcroForm among the real scored forms: 88 widgets on page 0 (60 `/Tx`, 28 `/Btn`,
6 comb, no `/Sig`), against our practice form's nine. Truth is generated by
`scripts/generate-irs-1040-truth.mjs`, which reproduces its output byte for byte, so it is
regenerated rather than hand-edited. It scores **98.9% / 94.6%**.

Three things that generator had to decide, and the evidence for each:

- **Filing Status is `checkbox`, not `radio`**, though the page says "Check only one box". Measured,
  not assumed: no field carries the Radio flag, no field has more than one kid widget, and the XFA
  template has zero `<exclGroup>` and 74 `<checkButton>`. Exclusivity is enforced by per-field
  mouse-up scripts. The `/AP` on-state names (`/1`..`/5`) look like a radio group and are the one
  thing that could mislead.
- **Labels are the form's own `<assist><speak>` captions, verbatim.** The XFA field names
  (`f1_01[0]`) say nothing, and "never invented" applies to a label as much as to a question. A
  stale second `<speak>` on the eight dependents-table checkboxes, 2018 wording matching nothing
  printed on the page, had labelled all eight wrongly on the first pass.
- **Nothing was excluded**, and the filter is there anyway: every widget on this page is `/F 4`,
  print-only, with no push button, hidden, no-view, read-only or zero-area rect among them.

**Its 98.9% is structural and the note in `baselines.json` says so.** The truth comes from the same
widgets `formWidgets.js` reads. What the row really watches is the widget pass still working and the
ink pass not going greedy beside it: 92 candidates for 88 targets, so 5 false positives, all
printed-geometry cells the widgets do not corroborate, plus one cell that falls under IoU 0.5
against its own widget.

## Corpus widened: IRS Form 1040, tax year 1970, a true scan (2026-09-20)

The shortlist wanted a scanned form and named the 1913 one, which turned out not to be a scan at all.
`irs.gov/pub/irs-prior/f1040--1970.pdf` (sha256
`8d9b89b6966313ada1cf15f9e51fee18f110bfac63ab85b4623ee53255305811`) is one: 174K, two pages, page 0
is a single CCITTFaxDecode image, 2925x4105 at 1 bit, with no text layer and no AcroForm. Public
domain under 17 U.S.C. 105. Its 64 targets were annotated by eye from the render and reviewed
against `overlay.mjs`.

**It scores 0% recall with 0 candidates**, and the measurement says exactly why:

```
ink: verticals 0  horizontals 0  rects 0
regions: combs 0  cells 0  checkboxes 0
```

Every rule on that page is pixels, and the detector reads content-stream geometry. This is the class
of failure the corpus existed to expose and could not: three forms in, a scanned document was a blind
spot, and nothing in a green run would have hinted at it. MOBI-14 now holds the question of whether
to serve raster input, with the evidence and the annotated truth already in place to measure it.

Two things it broke on the way in, both fixed:

- `score-form.mjs` crashed calling `toFixed` on a null precision, at the exact point where the most
  interesting form had the most to say.
- `scoring.test.js` asserted `candidates > 0` as a non-vacuity check, which is right for a truth file
  that failed to load and wrong for a measurement that is legitimately zero. Non-vacuity now rests on
  targets, and a recorded `null` precision pins the zero exactly instead.

**That second fix means this ticket's "adding a form needs no new test code" is not quite true, and
the acceptance box below says so.** It holds for a form the detector can see. A form it cannot see
was a new kind of row and the vocabulary had to grow once to express it, which is a fair price and
worth recording rather than glossing.

## Scope

- [x] **One shared pipeline.** `corpus.test.js` re-implements what `useFormFieldRegions.ts` does;
      the scoring bridge would be a third copy. Extract it once, in the corpus package, and have
      both use it. This is a down payment on ARCH-24, not a competing design.
- [x] **A committed bridge**, product regions -> `CandidateField`, pure and tested.
- [x] **The matcher lifted into the corpus package**, with `score.mjs` importing it rather than
      owning it - the same direction MOBI-11 step 1 took for `cells.mjs` and `label.mjs`. It already
      exports `iou`, `kindsCompatible` and `greedyMatch` and guards its CLI, so this is a move, not
      a rewrite.
- [x] **The practice form as the third scored form, and the first Latin one.** It is self-labelling:
      its nine AcroForm widgets *are* the truth, exact to the point, no annotation pass and no
      eyeballing needed. Annotate its kinds honestly (a signature field is `signature`, not `text`),
      so it reports our real gaps rather than a flattering 100%.
- [x] **Baselines and a ratchet.** Per form, per kind, recorded; the test fails when a number drops.
      Like the CSS ratchets, it only ever goes down by a deliberate edit that says why.
- [x] **A documented "add a form" path**, so the loop is repeatable by someone who was not here:
      commit the artifact, produce ground truth (a model proposes, a person eyeballs with
      `overlay.mjs`), record the baseline, done.

## Not in scope

Improving recall. This ticket builds the instrument; it does not move the needle, and a change that
does should be a separate ticket whose evidence is this instrument's numbers moving.

## Acceptance

- [x] One command scores every committed form and prints a per-form, per-kind table.
- [x] A baseline drop fails the test, naming the form, the kind and both numbers. Sabotage-checked.
- [x] The corpus and the scored set share one detection path and one fixture set.
- [x] Adding a form is documented in the corpus README and needs no new test code. *(True for a form
      the detector can see. The scanned form needed one amendment to `scoring.test.js` so a
      legitimately-zero candidate count could be expressed; see the 1970 section above.)*
- [x] The fixture decision above is recorded here with its date and reason once made.
