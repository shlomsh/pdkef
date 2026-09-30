# PRD: AI PDF Filler (Beta)

Date: 2026-09-30. Epic: **AI PDF Filler (Beta)**. Route: `/ai-pdf-filler/`.
Status: revised user intent recorded; reusable AI detector migration is not implemented or live-tested.

## Goal

Analyze an original form page once to obtain persistent semantic field metadata. AI acts as a
smarter detector: it describes what each writing spot means and where it is. PDkef then fills,
corrects, signs and exports locally using that map. Editing answers, supplying new facts,
signing, exporting and reopening a cached form must not resubmit facts or the page to an LLM.

Start with one selected page of an English or Hebrew scanned/flat PDF while preserving the
whole PDF for ordinary editing and export. Do not build a profile system, chat, provider
framework or an LLM answer matcher. Reuse the existing Sign editor and detector contracts.

## Current evidence and architectural correction

The authorized local ChatGPT connection, model catalog and page-image inference work. The
2026-09-30 trials used the earlier architecture: original page plus synthetic facts produced
positioned proposed answers. Those provider results, corrections, scoring and exported PDFs
remain historical evidence, not proof of a reusable metadata detector or of facts staying local.
The prompt-only exclusions and AI text-width fit belong to that preceding answer path.

AI-02 remains completed as the local connection exploration. AI-03 is reopened for this revised
vertical slice. AI-04 must evaluate the new metadata-only path separately. Hosted eligibility
remains the AI-05 rollout gate; local success does not establish hosted-browser support.

## Small user stories

### US-001: Discover a selected page once

As someone opening an old form, I want AI to identify its fields so I can fill them locally.

- Explicit **Analyze form page** sends the original selected page image and optional original
  printed text/local detector rectangles. It sends no user answers, facts, annotations or signatures.
- The result contains field metadata only; no answer `value` or accepted declaration.
- Validate unique IDs, kind, finite bounded coordinates and the exact page/render geometry.
- Show analyzing, cancellation, unavailable/error and stale-result states beside Analyze. A page/document change announces cancellation or stale-result rejection rather than silently clearing review; retain the existing bounded timeout and show its failure. Manual editing continues.
- Verify the real beta UI in the available in-app browser; provider contract tests use mocks.

### US-002: Reopen and reuse the page map locally

As someone returning to the same form, I want its detected fields remembered without another call.

- Persist the validated map under the existing content-hashed document memory entry, per page.
- Reopen uses the cache; changing answers or annotations does not invalidate original-page metadata.
- Different PDF bytes, page/geometry identity or detector schema/source version cannot reuse a stale map.
- Changing detector version makes reanalysis available explicitly, never silently calls the provider.
- Unavailable IndexedDB leaves an in-memory map and a truthful non-persistence notice, not broken editing.
- Verify reload, another PDF, rotated/cropped page, cancellation and late-response behavior in-browser.

### US-003: Fill and finish from that map

As someone completing a form, I want local editable answers in the right fields and a usable PDF.

- Compact per-field inputs use stable field ID; printed label and section distinguish duplicate Name
  fields such as Employee / Employer. Values remain local and editable.
- Any saved fact-property association is an explicitly reviewed local `fieldId → factKey` binding;
  the first slice can simply accept each field's value. Do not add a second LLM semantic matcher.
- Local comb geometry supplies cell count/pitch/writable strip when available. Unmatched scan combs
  and uncertain/unsupported fields remain marked for manual work, not ordinary text over multiple cells.
- Checkbox answers are explicit local choices; office-only areas stay blank for officials. Signature
  metadata describes a location only; the person adds any signature explicitly with Sign.
- Reuse Sign placement, font/width fitting, undo, manual corrections, signature and PDF export.
- One English and one Hebrew example complete metadata detection → local fill → correction →
  explicit signature → reopened/rendered PDF; editing/refilling/export produces zero further AI calls.

## Minimal contracts

`PageFieldMap` owns `schemaVersion`, `detectorVersion`, `sourceId` (original bytes hash), `pageIndex`,
original `PageGeometry`, recorded image width/height/render transform, and `fields`.
Coordinates persisted for editor use are top-left page percentages; provider image-pixel bounds
are converted through the recorded full-page PDF.js viewport, including crop/rotation/UserUnit.
Keep this recorded transform; do not guess an independent y-flip.

Each field has a locally stable `id` independent of its printed label, `label`, nullable `section`
and `semanticRole`, `kind` drawn from existing `FieldKind`, and `bounds`. At minimum preserve
text/date, checkbox, comb, signature and unknown/manual classification. `officeOnly` is a local
fill restriction. Optional `format` is limited to observed date/number structure or explicit
segmented cell count, not invented validation rules. Optional confidence is a model estimate,
not calibrated probability or a placement guarantee; omit it in the first slice if unused.
No user answer or credential is stored in the provider/map response.

A provider ID is unique within one response; install local IDs once and preserve them with the
cached map and reviewed bindings. Labels are display data, never keys. Reanalysis must explicitly
replace/reconcile a map rather than silently remap existing answers by duplicate labels.

`CachedSemanticFieldSource` implements existing `FieldSource.detect → SourceRegions` from the
validated local map. It never calls a provider. Keep semantic metadata in a sidecar keyed by stable
ID: the existing region reconciler is geometric and does not itself preserve semantic identity.
Ordinary Sign retains its existing default sources and no provider initialization.

## Geometry and persistence seam

Run local detection first and reuse its ink/widget rectangles. Match compatible same-page fields
one-to-one; deterministic widget/comb geometry wins matched bounds, comb cells/boxed/writable geometry and
checkbox squares. Preserve AI semantics beside that geometry. Ambiguous matches remain visibly
manual rather than merging nearby repeated fields. Unmatched AI geometry remains provisional and
correctable. Unknown/source precedence must not promote confidence into geometric truth.

The first selected-page call can use one full original raster for scans. Digital forms can send
original text and local rectangles with the raster initially when context is needed. Do not promise
that the first call is faster or raster transmission is unnecessary before measuring; later reuse amortizes that call only when a valid cache exists; do not add tiling/OCR here.

Reuse `draftStore.js`'s content-hashed workspace entry and the existing Sign draft's optional
extra metadata, with schema validation and one writer. Do not call `saveDraft('sign', …)` from a
second panel writer that could overwrite editor elements/history. Thread beta metadata through
Sign's existing autosave/restore seam; avoid a new database, tool profile or service.

Cache identity is original source hash + page index/geometry + detector schema/source version.
Ordinary annotation revision guards local Apply but does not erase the original map. Late analysis
must compare original document/page identity and the active request generation before installing;
it may never overwrite another document's map or the person's local work.

## Narrow implementation sequence and concrete files

1. **Contract and provider:** add AI-owned `src/tools/sign/ai/fieldMap.ts` for validation, transform
   and metadata types, plus the cached source adapter. Change `scripts/ai-pdf-filler/analysis.mjs`
   and `server.mjs` to one detect-page contract accepting only original-page input, no facts.
   Keep the existing OAuth/models/SSE boundary; mocked checks reject answer-bearing responses.
2. **One source and cache seam:** extend optional beta session wiring in `PdfSignTool.tsx` with
   original source identity/geometry, local regions and cached-map install/read access. Thread
   validated optional metadata through the existing draft restore/save owner in
   `useEditorDraftPersistence.ts` only where necessary. `useFormFieldRegions.ts` may accept an
   optional cached source or additional validated regions; its default invocation is unchanged.
   Adapt into existing `fields/fieldTypes.ts` / `detectFormFields.ts` interfaces rather than fork detection.
3. **Local beta panel:** change `AiPdfFillerPanel.tsx` from Fill-with-AI/facts to Analyze-once and
   local field inputs, grouped lightly by section. Adapt `proposals.ts` into map+local-value placement;
   keep `measureProposalText.ts` fitting. No extensive field-map management screen.
4. **Small proof:** after implementation and review, one explicitly authorized metadata-only call
   and real local reuse/reload/fill/sign/export. Then the four-form AI-04 trial uses detection and
   semantic-label association metrics separately from local answer placement/correction effort.

First integrate one selected page and existing local cache before extending to batch pages.
Contract/runner, session/cache and local panel can be delegated on disjoint files after root approves
these interfaces; independent review and one verifier own the integrated browser/export proof.

## Success and release scope

Success is one reusable page map: no facts in the provider request, stable duplicate-field identity,
precise local geometry where present, cached reopen and changed local answers with zero repeated
inference, correctable/signable real PDF export. Record time and call counts; do not assume savings.

AI-04 starts a new baseline for field recall/precision (one-to-one same-page compatible kind,
IoU ≥0.5), semantics/section association, comb geometry, answer placement and correction effort.
Signature detection is measured as metadata; signature creation remains human controlled.
Four forms are learning evidence, not universal accuracy. Hosted release, distribution permissions,
provider availability and cloud disclosures remain AI-05. No paid fallback, account memory access,
background retries, comprehensive profiles, bulk inference or automatic declarations/submission.

[Canonical tasks](../BACKLOG.md) · [Integration and historical trial evidence](../docs/ai-pdf-filler-integration-spike.md)
