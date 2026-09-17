---
id: "MOBI-10"
title: "Spike: can PDF Inspector map a flat form into answerable fields?"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Done"
---

# MOBI-10 · Spike: can PDF Inspector map a flat form into answerable fields?

**Done 2026-09-17, decision REWORK.** Record: [docs/mobi-10-field-map-spike.md](../../docs/mobi-10-field-map-spike.md).
anydoc / pdf-inspector emits no coordinates for PDF input at all, so it cannot help locate fields;
the on-device geometry path reaches 70-87% recall, 80-89% precision, 83-97% labels on the two
Hebrew forms, under the gate for automatic filling and inside it for a reviewable field map. The
follow-up is MOBI-11. Tooling and reviewed ground truth live in `scripts/spike/mobi-10/`.

## Why this is a prerequisite

`MOBI-03` deliberately detects only comb runs and checkbox geometry. `MOBI-06` can navigate those detected candidates, but that is **not** evidence that a person can complete a whole flat PDF form. A real form also has ordinary text cells, table rows, date lines, radio groups, signatures, and labelled choices.

The product goal is a safe guided flow:

1. identify what the form asks for;
2. know where each answer belongs;
3. ask the person understandable questions; and
4. fill only the confirmed answers into the correct PDF locations.

This spike decides whether `pdf-inspector`, via `@firecrawl/anydoc-wasm` or another locally usable integration, can materially improve the first three steps. It must not treat the existing comb/checkbox prototype as a full-form solution.

## Known evidence before testing

- The supplied income-tax source is a two-page, digitally generated PDF with a native text layer and no AcroForm widgets. It is therefore a representative flat-form sample, rather than a test of metadata that already exists in a fillable PDF.
- On page 1, the current PDkef geometry detector found 38 comb candidates and 36 checkboxes; on page 2 it found 31 checkboxes and no comb candidates. It does not currently emit ordinary text cells as fields.
- Visual review of the same form shows many additional answer locations: employer and employee details, dates, address and email lines, repeated table rows, and signature-related areas. Finding only digit boxes and checkboxes is insufficient for guided completion.
- The existing `SEO-32` record found that AnyDoc's historical PDF Inspector dependency had an RTL/Hebrew issue. A later upstream fix may exist, but the resolved dependency version and actual Hebrew behavior remain unverified and must not be assumed.

## Research question

For a digitally generated but non-fillable PDF, can PDF Inspector/AnyDoc provide semantic structure and location metadata that, combined with PDkef's existing PDF.js text positions and vector-geometry analysis, yields a trustworthy field map?

The field map must support an eventual question-and-answer flow, not merely extraction to Markdown.

## Scope and safeguards

- This is a research spike. Do not add a production dependency, upload a document, or change the filling workflow without an evidence-backed GO decision.
- Evaluate the user-provided source form locally:
  `/Users/sh/Downloads/Service_Pages_Income_tax_annual-report-2024_itc101 (5).pdf`.
  Record a content hash and page count in the research output; never commit the source PDF or any filled personal document.
- Re-use the committed geometry fixtures only as regression samples:
  `src/editor/adapters/pdf/__fixtures__/income-tax-101-page1-geometry.pdf` and
  `src/editor/adapters/pdf/__fixtures__/health-declaration-page1-geometry.pdf`.
- Include at least one non-Hebrew, non-trivial form before making a general claim. A scan is a separate class of problem and is out of scope unless an all-local OCR path is explicitly evaluated.
- Preserve the current all-local privacy model. A remote PDF conversion API is not an acceptable substitute.
- `backlog/tasks/SEO-32.md` contains earlier AnyDoc/PDF Inspector research, including an RTL concern. It is context, not proof: versions, transitive dependencies, license, and Hebrew/RTL behavior must be verified again during this spike.

## Compare the available signals

Build a small, reproducible runner that accepts an input path and records the output of each applicable source:

| Signal | What to establish |
| --- | --- |
| Native PDF form widgets | Whether AcroForm fields exist; their names, flags, values/options, page, rectangle, and required/read-only state. |
| PDF.js + existing PDkef geometry | Text content with page coordinates, drawing/vector clues, combs, boxes, underlines, table cells, and nearest labels. |
| PDF Inspector / AnyDoc | Exact package and transitive `pdf-inspector` versions; whether it emits page-aware blocks, reading order, bounding boxes, table/label structure, or field-like metadata. |

Do not infer an API capability from marketing documentation. Save a compact, redacted sample of the actual structured output or a schema summary, sufficient for another developer to repeat the result.

## Candidate field contract

Define and test a candidate record suitable for the later product flow:

```ts
type CandidateField = {
  id: string;
  pageIndex: number;
  bounds: { x: number; y: number; width: number; height: number }; // normalized to page size
  kind: 'text' | 'comb' | 'checkbox' | 'radio' | 'date' | 'signature' | 'select' | 'unknown';
  label?: string;
  question?: string;
  options?: Array<{ label: string; value?: string }>;
  required: boolean | 'unknown';
  confidence: number;
  source: 'native-widget' | 'pdfjs-layout' | 'pdf-inspector' | 'combined-heuristic';
};
```

Rules:

- Bounds must map back to the page unambiguously and be visually reviewable.
- `required: true` is allowed only when a native PDF flag or explicit source evidence supports it; otherwise use `unknown`.
- A `question` must be traceable to an adjacent label or source semantic block. Never invent a fact, option, or legal meaning.
- Preserve source text and RTL reading direction. A low-confidence candidate must remain reviewable rather than silently becoming a question.

## Evaluation method

1. Manually create a reviewed ground-truth map for page 1 of the original income-tax form. Count atomic targets by kind: comb, checkbox/radio, ordinary text cell, table cell, date/underline, and signature if present. Include the expected nearby label.
2. Run the current PDkef detector as the baseline. Its expected limitation—no ordinary text-cell support—must be visible in the report.
3. Run PDF Inspector/AnyDoc, PDF.js/vector analysis, and a documented combined heuristic where possible.
4. Match a predicted candidate only when it has the correct page, compatible kind, and a meaningful geometric overlap with the reviewed target (record the chosen threshold, initially IoU >= 0.50). Score label association separately.
5. Repeat on the selected non-Hebrew form. Keep Hebrew/RTL results separate; do not average them into a single flattering number.
6. Render the source and an annotated candidate overlay to inspect false positives and misses visually. The measurement is not complete if it is only a text dump.

Report, per form and field kind:

- target count, detected count, true positives, false positives, and misses;
- field recall and precision;
- correct page/bounds rate;
- correct-label/question association rate;
- confidence calibration: how often high-confidence candidates are correct; and
- examples of the most consequential misses and false positives.

## Decision rules

This spike produces a written **GO**, **NO-GO**, or **REWORK** decision.

- Native-widget forms are viable only if the extraction preserves at least 95% recall and 95% precision against reviewed fields.
- For flat, digital vector forms such as the income-tax sample, do **not** promote an automatic question flow unless the combined approach reaches at least 90% field recall, 90% field precision, and 85% correct label association on the reviewed Hebrew sample, including ordinary text cells—not only combs and checkboxes.
- Any candidate below the confidence threshold must be exposed through a field-map review/edit step before it can be asked or filled.
- A result that lacks reliable page coordinates, reverses/corrupts Hebrew labels, or only improves Markdown conversion is a NO-GO for this product goal, even if its prose extraction looks good.
- A successful result is not authority to autofill invisibly. The eventual flow must present a clear question, accept skip/unknown, let the person review the mapped field, and write only explicitly confirmed answers.

## Acceptance criteria

- [x] A local, reproducible spike runner accepts `--input <pdf-path>` and does not require an external upload.
- [x] A short research report records package/license/version evidence, including the resolved `pdf-inspector` version, supported metadata, local bundle/runtime impact, and offline/CSP feasibility.
- [x] The reviewed page-1 field map and annotated overlay exist for the original income-tax form; the source PDF itself is not committed.
- [x] Baseline, PDF Inspector/AnyDoc, PDF.js/vector, and combined results are reported using the defined metrics for the Hebrew form and a second form. The second form (the health declaration) is also Hebrew, at the owner's choice; a Latin-script form is carried into MOBI-11.
- [x] The report contains a clear GO/NO-GO/REWORK recommendation and, if GO, a narrowly scoped implementation ticket for a reviewable field-map stage before conversational filling.
- [x] No production dependency or automatic-fill behavior is added by this spike.

