# PRD: AI PDF Filler (Beta)

Date: 2026-09-29. Epic: **AI PDF Filler (Beta)**. Route: `/ai-pdf-filler/`.
Status: lean implementation in progress; local auth runner and editor slice under construction. No live sign-in or inference proven.

## Goal

Deliver a small, fully working vertical tool around the new Sign in with ChatGPT integration:
open an existing PDF form → provide facts → AI proposes positioned answers →
review/apply → correct manually → sign → download the filled PDF.

An old scanned or unfillable PDF is the central case. English and Hebrew documents first;
English UI. General web forms and website autofill are outside scope.
The first milestone must use live OpenAI inference and produce a real usable PDF.
Fixtures are development aids, not completion.

## First exploration: the new OpenAI integration

Prove the smallest supported connection and one image-analysis request using the user's ChatGPT
plan before building a broad feature. No maintainer-paid API tokens.

Current official docs describe open-source/local apps with a loopback listener at 127.0.0.1;
remotely hosted apps have a separate interest path. A static PWA cannot open that listener.
Resolve that fit first. A Continue with ChatGPT identity button alone does not prove inference.
[Overview](https://developers.openai.com/siwc/token-sharing-open-source),
[registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

The exploration should establish:
- Supported sign-in, granted plan-usage scope, and account-specific available models.
- One completed streamed request on a non-personal sample PDF page image.
- A user-funded response containing fields, labels, bounds, and proposed values.
- Whether the flow can run in hosted PDkef. If local-only, demonstrate locally and document that
  limitation without silently committing the public product to a companion installer.

This is the first executable milestone. A locally hosted experiment can teach us about the
integration even if the hosted release path needs OpenAI approval. Local success does not prove
a hosted-browser flow. No credential exchange has been run yet.
See [dated integration findings](../docs/ai-pdf-filler-integration-spike.md).

## Smallest useful product

1. Open a PDF in the existing editor. Initially analyze one selected page while preserving
   the whole PDF for manual editing/export. Include a scanned example.
2. Continue with ChatGPT through the proven connection path.
3. Enter/paste facts such as name, address, ID, and date. Do not imply account-memory access.
4. Click Fill with AI after a short disclosure of the page image/text and facts being sent.
5. Preview proposed answers over the PDF, plus a short list of missing/conflicting answers.
   Supply those answers and regenerate explicitly if needed.
6. Review/apply proposals as ordinary editable text/check marks.
7. Move, edit, delete, or add anything manually with Sign's controls; undo works.
8. Add a signature explicitly and download through the existing PDF export engine.

The PDF stays central. One compact panel holds connection, facts, missing answers and Apply.
A comprehensive field-map management screen and separate chat interface are later scope.
Unsupported complex fields remain manually fillable and visibly unresolved.
No automatic declarations, signing, or remote submission.

## Acceptance stories

### Working live form-to-PDF loop

- A real supported ChatGPT-plan connection completes page-image inference.
- One English and one Hebrew legacy/scanned PDF with synthetic facts can be filled, reviewed,
  corrected, signed and exported end to end.
- Proposed values come from supplied facts; missing/contradictory facts remain questions.
- Exported answers land in the intended fields; Hebrew/mixed text retains correct shaping.
- Browser verification demonstrates the complete loop, including opening the exported PDF.

### Optional, correctable AI

- Existing Sign remains available without OpenAI access; no provider initialization in its default path.
- Manual mode in the beta preserves applied answers, signatures and undo through cancellation,
  offline use, unavailable access and provider failure.
- Late responses never overwrite manual edits. Analysis is explicit, not a background loop.
- Invalid/out-of-page positions are rejected; missing personal facts are never invented.
- Reuse existing session/draft persistence rather than designing another storage system.
- Browser verification exercises correction, cancellation, failure and manual export.

### Truthful standalone beta

- Name/epic/Beta badge agree: AI PDF Filler (Beta), at /ai-pdf-filler/.
- Connection/cloud disclosures reflect the supported distribution and eligibility actually proven.
- No maintainer-paid inference or promise of free unlimited AI.
- Cloud analysis is a scoped exception to local processing; adjust affected privacy/CSP promises
  without changing ordinary tools' behavior.
- A public beta requires the working live flow; a fixture experiment is not advertised as usable AI.

## Reuse only the architecture needed now

Use Sign's actual document/session model, preview, geometry, fonts, manual tools, signature UI,
history and PDF export. Add a second product island inside the existing Sign module, with an
optional compact AI panel/session seam. Keep the standalone route and default manual Sign
experience separate. No editor fork, sibling-tool imports, or broad shared-editor extraction.
Coordinate with Sign-next-gen rather than starting another redesign.

Keep OpenAI behind a small analyze-page function with a typed validated result. Core editor
code has no provider imports. This leaves room for Claude and eventual integration into Sign
without building a provider framework now.

Use existing widget/vector detection when useful, and vision for scans and semantics.
Start with the simplest working combination; add OCR/line refinement when observed errors justify
it. Reuse FORM-02 vocabulary where available; FORM-02/06/07/09 completion is not a prerequisite
for this live vertical experiment.

Map recorded render-image → viewport → PDF transforms, including rotation/crop handling.
Do not guess a y-flip or treat proposal rectangles as editor text widths.
Respect intrinsic text/comb layout and RTL anchors. Apply reviewed answers as ordinary elements,
so correction uses the existing editor.

Keep credentials out of drafts/logs/analytics/exports. Bound request/result sizes, validate
output, allow cancellation, and use supported provider request settings. These are necessary
integration mechanics, not a broader enterprise-control programme.

## Recall, precision and placement: a small learning set

Start with four non-personal forms: English/Hebrew × scanned/flat digital, including two scanned
examples. Reuse existing scoring. Independently mark expected fields and record misses,
false fields, wrong labels/values and displaced answers.

Report recall and precision separately with one-to-one same-page compatible-kind matching at
IoU ≥0.5. Precision is undefined when there are no candidates. Measure answer placement separately:
field-box IoU alone does not prove correct x/y.

Track corrections and time to a usable exported PDF against manual filling on the same forms.
The immediate question is whether this live tool saves effort and is easy to correct.
Earlier 90% recall / 90% precision / 85% association targets are comparison points, not a mandatory
broad-corpus programme before the first working experiment.
Do not infer general accuracy from four examples.

First-release blockers: invented personal facts, wrong-page application, uneditable answers,
broken export/RTL, lost manual work, unsupported auth/billing. Missed/uncertain fields stay visible
and manually fillable. Publish the supported scope and observed limitations.

## Five tasks, one vertical deliverable

| Task | Deliverable |
| --- | --- |
| AI-01 | Lean plan, chosen name and Trends evidence; completed |
| AI-02 | New OpenAI connection: real auth + one PDF-page image request; first priority |
| AI-03 | Working PDF → positioned editable answers → correction → signature → export |
| AI-04 | Four-form English/Hebrew trial, recall/precision/placement and correction results; fix critical failures |
| AI-05 | Separate beta at /ai-pdf-filler/ using the proven distribution and claims |

Canonical tasks: [BACKLOG](../BACKLOG.md). Build AI-03 as one usable slice rather than splitting
it into infrastructure epics. Measure AI-04 against that slice, improve it, then release AI-05.

## Later, when the experiment earns it

Saved profiles, supporting-document facts, multipage batch AI, extensive field-map editing,
broad holdout/calibration programmes, Claude, and optional AI inside Sign.
These are possibilities, not first-beta dependencies.

SEO title: “AI PDF Form Filler (Beta) – Fill & Sign | PDkef.” H1: “Fill PDF forms with AI.”
Copy targets existing/scanned/unfillable PDFs. [Trends evidence](../docs/ai-form-filler-seo.md)
informs the chosen name; it does not establish keyword volume or ranking.

