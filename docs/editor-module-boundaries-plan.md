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

## The target boundaries

| Boundary | Owns | Should not depend on |
| --- | --- | --- |
| `editor/model` | Elements, commands, history, IDs, schema versions | Preact, CSS, PDF libraries |
| `editor/geometry` | Explicit viewport/percentage/PDF transformations | Component DOM structure |
| `editor/text` | Direction, segmentation, normalization and font policy | UI messages |
| `editor/adapters/pdf` | Loading, serialization, fontkit/private-library integration | Preact components |
| `editor/workspace` | Document session, persistence and export coordination | Product copy |
| `components/SignTool` | Views and event adapters | Direct storage writes |
| `i18n` | Locale resolution, messages and formatters | Document mutation |

Each row names what a module is *for* and the one thing that would mean it had absorbed someone
else's job. The "should not depend on" column is the part worth re-checking on every future PR that
touches these directories — it's a smell test, not an enforced import-graph lint (nothing here adds a
new CI guard; that's a possible ARCH-08 if drift becomes a repeat problem, not something this plan
asks for up front).

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
