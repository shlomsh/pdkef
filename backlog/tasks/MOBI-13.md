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

## Fixture decision: committing the originals was chosen, and is blocked here

Shlomi chose option 1 - commit the two Hebrew originals - on 2026-09-20. **It could not be done from
this environment.** The session's egress policy denies the public web at the gateway: `www.gov.il`,
and equally `irs.gov`, `gov.uk`, `incometax.gov.in` and `example.com`, all answer
`403 CONNECT tunnel failed`; only GitHub/npm/PyPI-style hosts are allowed, and the proxy README says
not to route around it. So the files have to arrive another way - added to the repo directly, or
this environment's network policy widened
(https://code.claude.com/docs/en/claude-code-on-the-web).

The recorded originals, for whoever fetches them:

| form | sha256 | url |
| --- | --- | --- |
| itc101 | `a5bfa867340f6569fb4e7d98e83a421e362f5c4b5ecf32037d6b51869913f8ad` | https://www.gov.il/BlobFolder/service/itc101/he/Service_Pages_Income_tax_annual-report-2024_itc101.pdf |
| health | `ccd0cb0257126e55192dda3c6cac822c0d3fdf785bbef9780f7e6ded94adba53` | https://www.gov.il/BlobFolder/service/issue_firearms_license_to_a_private_individual/he/services_health-declaration-2021.pdf |

Everything needed to land them the moment they exist is in place. Drop each file in, point its
`baselines.json` row at it, and run `node scripts/score-form.mjs --all`: it verifies the sha256
against the truth file, checks the page size, prints the new numbers and the row to paste. The
derivative note disappears on its own once the committed file *is* the annotated original, which is
the signal that these scores finally describe the real forms.

Expect both to move: itc101's 62 checkbox targets should come back (the text layer carries their
glyphs) and health's precision should return toward 94.2%.

## Candidate forms to widen the corpus (researched 2026-09-20, NONE verified)

Two scored Hebrew forms and one small Latin one is a thin corpus, and the detector's text-direction
and label logic has seen only Hebrew and Latin. A search pass produced this shortlist.

**Read the verification status before acting on any of it.** The same egress policy that blocked the
Hebrew originals blocks `WebFetch` too (confirmed directly: `EGRESS_BLOCKED` for `www.irs.gov`), so
only `WebSearch` worked and every URL below is a search-snippet lead, not a fetched file. No byte
size, page count, `Content-Type` or AcroForm-vs-flat claim here was measured. Re-fetch, confirm, and
record the sha256 before committing anything.

**Licensing is the gate, and it splits cleanly:**

- **Safe.** US federal works (IRS, USCIS, State Dept) are public domain under 17 U.S.C. §105. The
  UK's HMRC forms are Crown copyright under **OGL v3.0**, which explicitly permits commercial
  redistribution with attribution.
- **Do not commit without checking.** Every Indian government candidate. GODL-India covers
  central-government *open-data* uploads on data.gov.in, not ordinary departmental form PDFs, so it
  must not be assumed. The one Indian policy readable in full (UIDAI's) permits reproduction but
  bars use "in conjunction with commercial purposes" - a pattern that recurs. The terms pages for
  incometaxindia.gov.in and the ECI CEO sites could not be read this session. That is the unfinished
  homework.

| Rank | Form | Why it earns a place | Licence |
| --- | --- | --- | --- |
| 1 | IRS Form 1040, **1913** (`irs.gov/pub/irs-prior/f1040--1913.pdf`) | The corpus has **zero scanned forms**. A no-text-layer document is a whole class of failure we cannot currently see. | public domain |
| 2 | ECI **Form 6, Hindi** (`ceodelhi.gov.in/PDFFolder/forms/Form-6-Hindi.pdf`) | Devanagari, bilingual, with character-comb name boxes and drawn checkboxes - the closest Hindi analogue to what itc101 exercises in Hebrew. | **unclear** |
| 3 | IRS Form 1040 (2024) (`irs.gov/pub/irs-pdf/f1040.pdf`) | First live AcroForm among the real forms; everything else scored is flat. | public domain |
| 4 | USCIS Form I-9 | AcroForm with dropdowns and a genuine multi-column table, a shape nothing covers. | public domain |
| 5 | HMRC SA100 | Numeric comb boxes and right-aligned money columns, a different visual convention entirely. | OGL v3.0 |

Two findings worth keeping even if none of these are added:

- **A legacy-font Devanagari form is a feature, not a problem.** The Rajasthan mirror of Form 6
  returns mojibake in its own search title, meaning it uses a non-Unicode Devanagari font, which is
  endemic to Indian government PDFs. A *geometry* detector should find its boxes anyway. One such
  specimen would prove that, and nothing else in the corpus can.
- **Obvious guesses that are wrong.** Aadhaar enrolment forms are English on the static PDF (Hindi
  is applied at the kiosk), PAN Form 49A is English-only, the Indian passport form is generated
  per-session with no stable URL, and the RTI form lives on shared S3WaaS hosting with a per-department
  hash in the path. None are usable.

Given the licensing split, the cheapest honest widening is **IRS 1913 + IRS 1040 (2024)**: both
public domain, both fill real gaps (scanned; live AcroForm), neither needs a licence investigation.
Hindi should wait for someone to read the ECI terms page.

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
