# Editor module boundaries plan

Opened **2026-08-29**. Execution state lives only in the canonical
[task files](../backlog/tasks/) (ARCH-01 through ARCH-07), summarized in the generated
[backlog board](../BACKLOG.md); this record is the rationale and the evidence behind them, kept
separate so a task's one-line acceptance condition doesn't have to carry the full "why." It refines
CLAUDE.md Part II §3.2's "editor core" and "element registry" rows into finer boundaries; it does not
replace them.

**The instruction this plan works under: evolve the existing folders incrementally, one boundary at a
time. This is explicitly not a mandate to reorganize `src/lib/` or `src/editor/` in one pass.** Each
task below is scoped to one file move or one dependency fix, independently landable and reviewable.
Do not batch several ARCH tasks into one PR just because they're related — the whole point of writing
them this way is that any one of them can be picked up, verified, and merged on its own.

## Enforced editor dependency matrix

ARCH-11 makes the editor boundary executable. `npm run test:editor-dependency-directions` resolves
every production relative static import (including `.js` specifiers that resolve to TypeScript) and is
a CI gate. It intentionally does not attempt a repository-wide reorganization: the matrix records the
current serialization and rendering seams so a future import can be judged against a specific rule.

| Layer | Owns | May statically depend on | Must not depend on |
| --- | --- | --- | --- |
| `editor/model` | Elements, commands, history, IDs, schema versions | Other model files | Preact, CSS, browser storage, PDF libraries, or any outer editor layer |
| `editor/geometry` | Explicit viewport/percentage/PDF transformations | Geometry and model helpers | Preact, CSS, PDF libraries, registry, workspace, adapters, or components |
| `editor/text` | Direction, segmentation, normalization and font policy | Text/model helpers and font-policy dependencies | Preact, CSS, workspace, adapters, or product messages. `textCoverage → registry/text` is a documented temporary compatibility bridge. |
| `editor/registry` | Per-element schema, creation, resize, serialize behavior | Model, geometry, text, constants, and PDF serialization libraries | Workspace or PDF-adapter modules. Preact/component/CSS imports are limited to the named renderer seams below. |
| `editor/adapters/pdf` | Loading and document serialization integration | Model, geometry, text, registry, and PDF libraries | UI components, Preact, or CSS (the dependency is one-way from the shell into an adapter). |
| `editor/workspace` | Document session, persistence, draft restore, and export coordination | Model, registry, adapters, and workspace helpers | Product UI. The one `useEditorDraftPersistence → useDraftPersistence` bridge is explicitly temporary. |
| Preact component shell (`components/SignTool`, `PdfSignTool`, `PdfRedactTool`) | Views, event adapters, and user-triggered orchestration | Editor public layers, including workspace persistence and PDF adapters | Direct `localStorage`, `sessionStorage`, or `indexedDB` access in the editor shell; persistence must enter through `editor/workspace`. |

### Deliberate seams

The guard permits only these exceptions. They are listed in the checker as path-specific rules, not as
general layer exemptions:

- `editor/registry/renderers.ts` imports Preact and SignTool node components; it is the registry's
  dedicated view-render adapter.
- `editor/registry/redactionSurface.ts` imports Preact for the same view-adapter purpose.
- `editor/registry/text.ts` imports the SignTool CSS Module only to perform the existing resize-time DOM
  paint against its stable class names.
- `editor/workspace/useEditorDraftPersistence.ts` imports Preact's hook and the legacy
  `components/SignTool/useDraftPersistence.js` effect implementation. Workspace owns the lifecycle
  contract already; moving the implementation is a separate mechanical slice.
- `editor/text/textCoverage.js` re-exports a registry text helper to preserve its public API while that
  helper remains colocated with text serialization.

The registry's serialization imports of PDF library types/functions are intentional: an element
definition owns its own bake behavior. That is different from importing `editor/adapters/pdf`, which
would reverse the adapter direction and is rejected. Likewise, keeping the renderer adapter in
`registry/` is deliberate for now; moving it only to satisfy a directory-name rule would recreate the
component/registry cycle this layout avoided.

The guard has positive and negative fixtures in
[`scripts/fixtures/editor-dependency-directions/`](../scripts/fixtures/editor-dependency-directions/).
The negative fixtures prove that model-layer Preact and browser-storage use, text-to-workspace imports,
and unapproved workspace Preact hooks fail. Run the command locally before changing any of these seams;
add a new exception only alongside a written architectural decision and a separate mechanical move
plan.

## Why now, and why these seven tasks specifically

This plan did not invent the boundary and then go looking for violations to justify it — the table
above was given as a target, and every task below was checked against the current tree before being
written. Three real violations turned up, not zero and not a dozen:

1. `src/lib/actionHistory.js` (a command/history module — `editor/model` territory) imports `uniqueId`
   from `src/lib/sign.js`, which is fontkit/pdf-lib export code (`editor/adapters/pdf` territory), for
   no reason but ID generation. That's exactly "`editor/model` depending on PDF libraries."
2. `src/editor/workspace/loadPdf.ts` imports `getPdfjs` from the same `sign.js`, for the same shape of
   reason — session/loading coordination reaching into export-adapter code instead of the other way
   around.
3. `src/lib/textCoverage.js:115` returns the literal, hardcoded, English sentence shown to the user
   when a font substitution happens (`` `${requested} has no match for: ${list}, so this text box is
   using ${family} instead...` ``) — text-policy code composing UI copy, not just reporting facts.
   This is also the one violation with a second payoff: today's hardcoded string is exactly what a
   future `i18n` module will need extracted into a message catalog, so fixing the boundary now removes
   a future blocker for ARCH-07 instead of just tidying imports.
4. `src/components/PdfSignTool.tsx` and `src/components/PdfRedactTool.tsx` (the `components/SignTool`
   boundary, loosely — `PdfSignTool.tsx`/`PdfRedactTool.tsx` are the top-level tool components that sit
   just above the `SignTool/` folder) call `localStorage.getItem`/`setItem` directly in roughly 15
   places. That's "direct storage writes" from a view/event-adapter layer that's supposed to hand
   persistence off to something else.

The other three tasks (`editor/geometry`, moving draft persistence into `editor/workspace`, standing
up `i18n`) aren't violations of code that exists today — they're "this doesn't have a home yet, and
when it does, this is where it goes," written down now so later work lands in the right place the
first time instead of needing a second move.

## The seven tasks

Full acceptance conditions live in the corresponding task files; this is the reasoning behind each one's shape.

- **ARCH-01 — `editor/model` out of `lib/`.** `editorModel.ts` has zero imports today, so it's a pure
  relocation. `actionHistory.js` needs its `uniqueId` import redirected to `editor/model/ids.ts` (which
  already exists) rather than `sign.js`, breaking the model→adapter dependency described above.
- **ARCH-02 — the shared transform into `editor/geometry`.** Deliberately sequenced *after* SIGN-05,
  not before: SIGN-05 is about fixing `coords.ts`'s behavior (one forward/inverse transform, crop boxes
  and rotations modeled explicitly), and moving the file first would just mean moving it again once the
  fix lands. Per-type resize math (`editor/registry/boxResize.ts`, `centeredResize.ts`) stays where it
  is — CLAUDE.md's "one owner per element type" for resize is a correct, separate rule from "one shared
  viewport/percentage/PDF transform," and conflating them by moving resize math into `geometry` would
  undo that.
- **ARCH-03 — `editor/text`, and the hardcoded-sentence fix.** The module move (`bidiRuns.js`,
  `hebrewComposition.js`, `hebrewCombiningCorpus.js`, `comb.js`, `textFontSupport.js`,
  `textTransforms.js`, the policy parts of `fonts.js`/`textCoverage.js`) is mechanical. The sentence
  fix is not: `signPdf`'s save-time refusal and the editor's while-typing notice both currently call
  the same function and must keep showing **identical wording** after the split — the acceptance
  condition is "no copy change," only "the copy moves up one layer."
- **ARCH-04 — `editor/adapters/pdf`.** The largest task here, so it's written to land in slices: the
  pdfjs loader first (fixes the `workspace/loadPdf.ts` → `sign.js` dependency directly), then
  `sign.js`/`redact.js`'s serialization logic, then the smaller supporting files
  (`pdfObjects.js`, `contentStream.js`, `deleteObjects.js`, `applyPageEdits.js`). Deliberately scoped to
  Sign/Redact's own PDF plumbing — Merge, Compress, Split, Edit Pages, and Image-to-PDF are standalone
  tools that happen to also use `pdf-lib`, but they sit outside the editor core entirely (no gesture
  controller, no registry, no draft persistence) and moving their `lib/*.js` files here would conflate
  "the editor's PDF adapter" with "every tool's PDF glue."
- **ARCH-05 — draft persistence into `workspace/`.** Sequenced ahead of SIGN-11 (which is about
  `draftStore`'s *behavior* — versioning, validation, migration) on purpose: reviewing a behavior change
  against a settled file layout is easier than reviewing a move and a behavior change in the same diff.
- **ARCH-06 — preference storage out of raw `localStorage`.** The ~15 call sites in `PdfSignTool.tsx`
  and `PdfRedactTool.tsx` (last color, font, font size, symbol width/mark, signature width, text
  direction, saved signatures) are simple key/value reads and writes wrapped in identical try/catch
  boilerplate — consolidating them into one typed helper also fixes the
  `'pdf-toolkit:lastWhiteoutColor'` logic that's duplicated verbatim between the two components today,
  which is a real bug-risk (the two copies can drift) independent of the boundary question.
- **ARCH-07 — `i18n` scaffold.** This is the one task justified by future work rather than a present
  violation: [app-documentation-localization-plan.md](./app-documentation-localization-plan.md)
  (2026-08-28) recommends a documentation-language selector and translated routes
  (`/he/how-to-sign-a-pdf-on-android/`, etc.), and none of the locale-resolution or message-catalog code
  it will need exists yet. Standing up `src/i18n/` now — before that build starts — means it lands
  there directly instead of getting retrofitted out of `contentPages.js`/`[contentPage].astro` after
  the fact. Explicitly *not* asking for the localization plan's execution here, only the module's
  address. Per the boundary table, `i18n` must never touch document mutation — it's routing and copy
  for the static SEO shell (CLAUDE.md §1.1's "sacred" invariant), never the PDF editor's own state, so
  it should not import from `editor/model` or `editor/workspace` in either direction.

## Relationship to existing open work

- **SIGN-05** (one page-coordinate transform) is a prerequisite for ARCH-02, not a duplicate of it.
- **SIGN-11** (versioned/validated shared persistence) is `draftStore`'s behavior; ARCH-05 is only its
  location. Do ARCH-05 first.
- **SIGN-14** (separate editor core, UI, and export adapters incrementally; break the `actionHistory` →
  `sign` dependency) is the general mandate this whole plan is one concrete breakdown of. ARCH-01
  directly closes the specific dependency SIGN-14 names. Closing all seven ARCH tasks does not
  automatically close SIGN-14 — SIGN-14 also covers import cycles and contract typing this plan doesn't
  touch — but it removes a meaningful chunk of it.
- **CLAUDE.md Part II §3.2** ("The editor core") describes the target at a coarser grain (editor core /
  element registry / Preact shell). If all seven tasks land and hold up in review, promoting this
  table into CLAUDE.md itself (replacing or extending §3.2) is a reasonable follow-up — not done as
  part of this plan, since CLAUDE.md documents settled architecture and this is still an open
  migration.

## Sequencing note for whoever picks these up

ARCH-01, ARCH-03's mechanical half, ARCH-06, and ARCH-07 have no dependencies on each other or on
other open work — any one is a reasonable first pick. ARCH-02 waits on SIGN-05. ARCH-05 should land
before SIGN-11 is attempted. ARCH-04 is the biggest and should be sliced rather than done whole; take
the pdfjs-loader slice first since it's what directly fixes the `loadPdf.ts` → `sign.js` violation this
plan opened with.
