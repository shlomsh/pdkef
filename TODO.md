# TODO

**The single backlog.** What is open, what shipped, and why things were built the way they were. There
is deliberately no second list: this file replaced the `scrum-board.data.js` / `scrum-board.html` board
and the `scrum.md` narrative, which had drifted apart from each other and from the code.

Guidance for working in the repo (commands, invariants, the design standard, brand voice) is in
[CLAUDE.md](./CLAUDE.md). [README.md](./README.md) is the human-facing project landing page.

**The hard constraint on every task, unchanged: no file bytes ever leave the device.** No `fetch`/`XHR`
of PDF contents, no third-party processing API, no PDF processing server. Anonymous maintenance
telemetry is permitted only within the documented privacy constraints. `PdfMergeTool.tsx` + `src/lib/merge.js` remain the
reference implementation of a finished tool.

---

## Open work

The earlier migration is complete; this does not mean architectural debt is closed. Current work
includes the prioritized Sign review below, Redact's live delete preview, the WYSIWYG text epic,
and the PDF-language backlog. Older sections retain supporting evidence and implementation history.

### Sign Tool architecture review (2026-08-28)

Product answers are persisted in [the decision record](./docs/sign-tool-product-decisions.md).
Here “language support” means PDF content, not translated UI. One language per text element plus
digits, content-derived direction with English/LTR default, Chrome, offline tools, shared storage
within the current user scope, and anonymous maintenance telemetry are the agreed constraints.

**Priority:** P1 = document fidelity, recovery, or an explicit product requirement; P2 = reliability
and maintainability; P3 = optional expansion. Order within a phase follows the table. Owners below
are module boundaries, not assignments to people. Quick wins are deliberately small subsets of
the larger findings; completing them does not close those larger tasks.

| ID | Priority / phase | State | Task, owner, and acceptance condition |
| --- | --- | --- | --- |
| SIGN-01 | P1 / quick win | Done 2026-08-28 | **Recover after export failure.** `PdfSignTool.tsx`, `SignTool/PdfWorkspace.tsx`: pages and edits remain mounted, export errors include recovery guidance, and correction/retry works through both share preparation and download. Errors clear on retry or replacement; load failures retain their separate status. Component regressions exercise failed export, edit, and successful retry without reloading. |
| SIGN-02 | P2 / quick win | Done 2026-08-28 | **Repair selection/editing invariants.** `SignToolContext.tsx`: delete/undo clear references to removed elements; replacing a document clears selection and editing; operations on other elements preserve the current edit session. Reducer tests cover each path. This does not expand undo scope. |
| SIGN-03 | P2 / quick win | Done 2026-08-28 | **Retry failed live font loads.** `liveFontCoverage.js`: rejected promises are evicted while pending/successful loads stay deduplicated. A subsequent coverage check recovers after connectivity returns. Tests use real font bytes, concurrent requests, and an outage/recovery sequence. Full offline provisioning remains SIGN-07. |
| SIGN-04 | P1 / near term | In progress | **Preserve Unicode content and whitespace.** `editor/registry/text.ts`, text normalization/export: replace blanket control/format stripping with a documented policy that preserves shaping joiners; remove destructive layout trimming. Prove Persian ZWNJ, combining marks, leading spaces, and blank lines through export and text extraction. Do not rasterize real text. |
| SIGN-05 | P1 / near term | Open | **One page-coordinate transform.** `coords.js`, `PdfPageCanvas`, registry serializers: model crop boxes and rotations explicitly; use the same forward/inverse transform for placement, preview, export, and hit testing. Verify all element types on 0/90/180/270-degree and cropped fixtures. |
| SIGN-06 | P1 / near term | Done 2026-08-29 | **Report actual draft-save state.** `useDraftPersistence.js` already replaced a naive `draftSaved={status === 'editing'}` with a revision-tracked `idle/pending/saved/error` state (`draftSaveState`, tied to `draftSaveRevision` so a stale write can't paint a newer edit as saved); `persist()` reads `saveDraft`'s boolean result and reports `error` on both a `false` return and a rejection, and the visibility/pagehide flush uses the same path. `ToolShell.tsx` renders `error` as "Draft not saved" with `role="alert"`. This entry was still marked "In progress" with stale references to a `useAutoSave` hook that no longer exists; the implementation was already complete but untested for the failure path, so `useDraftPersistence.test.jsx` was added to prove saveDraft returning `false` or rejecting reports `error` (never `saved`), and that saving stays off outside `editing` status. |
| SIGN-07 | P1 / near term | Open | **Make the offline requirement testable.** Service worker, precache generator, fonts/PDF worker loaders: define asset provisioning and offline-ready status for every advertised workflow/language; version caches by asset content, including unchanged font URLs. Chrome tests must disconnect the network and open/edit/export using provisioned assets, then test upgrades without losing drafts. Current Arimo-only font precache is not full language support. |
| SIGN-08 | P1 / near term | Open | **Share the effective typography descriptor.** `fonts.js`, text renderer/serializer, font picker, `SignatureDialog`: resolve face, available weight/style, size, and direction once for preview and export. Unsupported styles must not silently export differently. Typed signatures must await fonts and fit their canvas without clipping. Extend the existing WYSIWYG epic rather than introducing a second engine. |
| SIGN-09 | P1 / near term | In progress (direction defaults only) | **Direction defaults and grapheme-safe input.** `textDirection`, text creation, comb input/layout: infer direction from typed content; empty or digit-only new fields default LTR instead of inheriting the previous field. Preserve digit order. Replace base-plus-mark splitting with grapheme-aware handling; verify Indic conjuncts, RTL punctuation, and Chrome IME input. Single-language elements do not require arbitrary mixed-language runs. |
| SIGN-10 | P2 / near term | Open | **A language/font source of truth and acceptance matrix.** Consolidate duplicated catalogue, CSS, coverage, licensing and precache metadata into one font manifest, continuing the existing language catalogue work. Name popular languages and regional variants in rollout order; test real font coverage, shaping, visual output, and searchable text in Chrome for supported styles. Reconcile in-flight font migrations and stale fixtures without widening visual tolerances to hide failures. |
| SIGN-11 | P2 / near term | Open | **Versioned, validated shared persistence.** `draftStore`, saved signatures/preferences: choose the local user boundary, validate records on read, migrate schema versions, and coordinate same-user tabs with revisions and explicit conflict handling. Store source PDF bytes once per document, not on every edit. Test corrupt/older records, concurrent tabs, deletion, and unavailable storage. No account/backend requirement is implied. |
| SIGN-12 | P2 / near term | Open | **Make required undo dependable.** Reducer/action history: represent add/delete with atomic commands including original stacking positions; define clear-page and selective-history semantics. Test add-delete-undo chains and restored z-order. Undo for typing, moving, and styling is optional P3 work until approved. |
| SIGN-13 | P2 / near term | Open | **Anonymous usage and error maintenance signals.** Define a reviewed event allowlist, sanitized error taxonomy, coarse timing buckets, retention, and disclosure. Add privacy tests proving no PDF/text/signature/filename/user or document IDs enter payloads and offline failure has no effect. Prefer stable error codes over raw exception messages. Existing page-view analytics is not sufficient error monitoring. |
| SIGN-14 | P2 / longer term | Open | **Separate editor core, UI, and export adapters incrementally.** Break registry/UI import cycles and the `actionHistory` to `sign` dependency; type commands and serializer contracts at runtime boundaries. Isolate export state with revision/race protection and lazy-load PDF serialization dependencies. Keep existing DOM gesture commits and reuse current registry tests. |
| SIGN-15 | P2 / longer term | Open | **Bound document/render/gesture lifecycles.** Own and cancel PDF loading/render tasks, handle interrupted gestures, and add page virtualization/indexed element lookup only after measuring large Chrome documents. Verify replacement/unmount does not leave tasks or stale writes alive. |
| SIGN-16 | P2 / near term | Open | **Trustworthy delivery checks and docs.** Count transitive static imports in the page-weight gate, remove duplicated CI builds where safe, and align README commands/Node requirements/privacy with reality. Document layer ownership, persistence/export contracts, language fixtures, and baseline generation. Keep Chromium output tests and production CSP checks as release gates; platform baseline differences require investigation, not blanket tolerance increases. |

**Deferred unless scope changes (P3):** translated interface/locale switching, arbitrary multilingual
rich-text runs within one element, non-Chrome release gates, and full edit/move/style undo. Decisions
still needed for language rollout, regional Han selection, offline provisioning, local user scope,
and telemetry governance are listed in the decision record. Existing detailed epics below remain
the implementation evidence; this table supplies their priority under the confirmed product scope.

**Quick-win verification (2026-08-28):** the new regressions reproduced six failing cases before
the fixes. Afterwards, all **54 focused tests** passed across `PdfSignTool.test.tsx`,
`SignToolContext.test.tsx`, and `liveFontCoverage.test.js`. The full suite finished with
**1,675 passing / 3 failing** tests: the pre-existing failures are two `fontCoverage.test.js`
cases opening the removed `Almarai-Regular.ttf` and one `fontCoverageTable.test.js` case looking
up that removed font. These remain part of SIGN-10; no font migration or baseline was changed by
the quick wins. Type check passed (0 errors, 23 hints), production build passed, and CSP, CSS,
gesture and font-alignment guards passed. The focused production Chromium run passed **5/5**:
`e2e/sign/sign-editor.spec.js` and `e2e/csp-smoke.spec.js`. The full visual-language E2E matrix was
not rerun for these changes. The export-retry regressions stub the exporter to control failure;
existing real-PDF export/extraction tests also ran in the focused component suite.

### Launch / SEO

**Effectively shipped, one page short.** Both items below were open when this section was last
written; checking the actual state (2026-08-26) found seven of the eight `src/content/content-pages/`
entries already live, registered in `src/data/contentPages.js` with a hub, sitemap priority and
changefreq, and cross-linked - not still-open work.

- **Long-tail landing pages.** `/sign-pdf-no-signup/`, `/open-source-pdf-editor/` (the two named here
  originally), plus `/install-pdf-app/` and `/permanently-delete-text-from-pdf/` (added later, same
  registry) are all live. **`/offline-pdf-form-filler` was never built** - zero references anywhere in
  `src/` or `public/` - and is the one real remaining item here.
- **OS-specific how-to guides**, internally linking into the tools, no outbound promo links: done. All
  four (`how-to-sign-a-pdf-on-{mac,windows,android,iphone}`) exist and are registered.

### Editor / UX

- **Live in-place preview for Redact's Delete tool** (stop rendering, don't decorate over). *The largest
  open item.* A marked object currently gets a CSS overlay on top of the untouched pdf.js canvas
  underneath, which is decoration, not removal. The object should genuinely not render while marked,
  matching what Download actually produces. Design (discussed 2026-08-14, not started): on every
  mark/unmark, regenerate just the affected page's bytes with `deleteObjectsFromPdf()`
  (`src/lib/deleteObjects.js`) against the source, then re-render that page from the regenerated bytes;
  every other page keeps rendering from the untouched document. This reuses the export code path, so
  preview and download cannot drift apart the way a separate preview renderer would. Needs: (1) an async
  request-generation guard so a stale regeneration from rapid mark/unmark cannot clobber a newer one
  (the same `loadIdRef` pattern `PdfRedactTool.jsx` already uses for load races); (2) `PdfPageCanvas`
  accepting a per-page document override instead of rendering every page from one shared
  `pdfDocument`, so only the affected canvas swaps; (3) scope to `type:'delete'` only, since
  blackout/blur/whiteout already preview accurately and cheaply via their overlay div. Delete is the one
  mode where looking right requires the object to actually be absent rather than covered.

### Hebrew text export: the three missing pipeline layers ~~(all five layers now exist)~~

**Closed 2026-08-27.** All five stages are implemented and verified from code. This section stays for the
reasoning trail; the current-state map, and what is still open above the pipeline, moved to the WYSIWYG
epic below.

**Reframed 2026-08-22, and the reframing is the point.** Three defects were found in the Hebrew export
(vowel points in the wrong place, letters in the wrong order, text disappearing entirely). They look
unrelated. They are not. **The export did not have a text pipeline; it had a shaper and a painter.**
Drawing text correctly is five stages, and the export had stages 4 and 5:

| # | stage | have it? | defect when missing |
|---|---|---|---|
| 1 | Normalization | yes, as of H7 (below) | nikud lands outside its letter |
| 2 | Bidi (UAX#9) | yes, as of H6 (`f10af8e`, 2026-08-23) | `1,250` exports as `052,1` |
| 3 | Itemization (script/direction/**font** runs) | element-level, plus a refusal (H5) | Arabic exports as nothing at all |
| 4 | Shaping | yes (fontkit) | - |
| 5 | Positioning | yes, as of the layer-5 fix below | marks placed by `/W` advance |

**Not one of these is a bug inside fontkit, and swapping the shaper fixes exactly one of the three.**
Read **[docs/hebrew-text-shaping-export.md](./docs/hebrew-text-shaping-export.md)** before starting: it
carries the measurements behind every claim here, the per-font tables, the mechanism, and three
superseded "why not" sections that are kept deliberately so the reasoning is not re-derived. If
something in it turns out to be wrong, say so rather than redesigning around it silently.

The framing earns its keep by predicting: **layer 3 was found by asking what a missing itemization
stage would look like, then looking.** It took one command. Arabic is lost in all seven fonts.

Do the work on `main`. Layer 5 landed 2026-08-21 (see "Known small defects"); H7, H8 and H9 landed
2026-08-26. Ordered below by what the failure does to the document rather than by how visible it is.

**Definition of done for the epic** (one sentence, and it is provable rather than hopeful):

> **Every text the editor can display either exports faithfully, or is refused with a clear message.
> There is no third outcome.**

1. Every character the editor renders either appears in the download or is refused before download,
   never silently dropped (H5).
2. A line mixing Hebrew with Latin or with digits exports in the same visual order the editor shows,
   verified on a real download from `npm run build && npm run preview`, not in Node. **Done (H6).**
3. Pointed Hebrew renders in the download as the editor renders it, in all seven
   `HEBREW_CAPABLE_FONTS`. **Done (H7)** - Arimo and Tinos were the two that failed, at 0% and 33% mark
   containment; a narrow, named, eight-combination exception remains (see H8) rather than full parity.
4. Every guard can fail: break the layer it guards and watch it go red. A guard that cannot fail is the
   specific failure mode this epic already hit twice (H8).
5. Standard gates green: `npm test`, `npm run typecheck`, `npm run test:css`, `npm run test:e2e`, plus
   the CSP/SEO/page-weight guards.

- ~~**H5. Layer 3: refuse characters no resolved font can draw.**~~ **Done - found already live and
  verified 2026-08-24, TODO.md just never struck it through.** `unrepresentableCharacters` in
  `src/editor/registry/text.ts` is wired into both `signPdf` (`src/lib/sign.js`, refuses at save) and
  `liveFontCoverage.js` (checks while typing, before save). Confirmed with a real repro, not just reading
  the code: loaded a genuine Hindi government PDF into the live Sign tool, typed Devanagari text with a
  bundled font selected (Mali, which has zero Devanagari glyphs), clicked Download, and got **"Signing
  stopped. The font you picked has no match for: न, म, स, ्, त, े, भ, ा, र. Change the font for that text
  on page 1, or remove those characters, then save again."** - a refusal, not a silently corrupted export,
  and the copy matches CLAUDE.md's voice exactly as this item asked for. This generalizes to any script no
  bundled font covers, not just Devanagari or Arabic - it's why the Devanagari section below no longer
  says this infrastructure doesn't exist.
- ~~**H6. Layer 2: bidi.**~~ **Done 2026-08-23 in `f10af8e`, "Give the Hebrew export the pipeline layers
  it never had" - this entry and the stage table above both stayed open for four days after it shipped,
  which is how the design record and `CLAUDE.md` came to carry the same stale claim.** `src/lib/bidiRuns.js`
  wraps `bidi-js`'s certified UAX#9 embedding-level computation and rule-L2 reordering, deriving run
  *order* from its character-level output while leaving each run's own text in logical order (fontkit
  reverses an RTL run internally, and pre-reversing it would corrupt mark attachment). Wired into
  `serialize` at `src/editor/registry/text.ts`, once per run instead of once per line, with the paragraph
  direction taken from `getEffectiveTextDirection` and never auto-detected. Comb fields deliberately skip
  it (each cell is one grapheme cluster placed by cell index, so there is no run order to resolve).
  Verified 2026-08-27 against a real download: 9 of 10 measured strings match a Chromium reference render,
  and the tenth is Almarai collapsing `ريال` into one word-level ligature, which renders correctly and is
  a paint-order reconstruction artifact rather than a bidi defect. The original writeup follows.
  Highest-damage defect in the epic: it changes what the document *says*, and it
  needs no Latin character to trigger. Measured, typed then exported: `תאריך 21/08/2026` becomes
  `6202/80/12`, `טלפון 054-1234567` becomes `7654321-450`, `סכום 1,250 שח` becomes `052,1`,
  `רחוב 17` becomes `71`. **Use a real UAX#9 implementation, do not hand-roll run splitting** - it fails
  exactly on these weak-directional digit cases. `bidi-js` (MIT, 12KB minified) is already in the tree
  transitively via jsdom, so its licence and audit story are known. **Approved as a direct runtime
  dependency 2026-08-22**, subject to the usual `npm audit` pass against the Astro pin and a
  `npm run test:weight` check. **Resolve with the paragraph direction `getEffectiveTextDirection`
  returns, never with the library's auto-detection** - the editor's textarea carries an explicit `dir`,
  so auto-detection agrees on the easy strings and diverges on exactly the ambiguous ones; see the
  design record's "The paragraph direction is not ours to auto-detect". Split each line into runs, call the
  existing `shapedWidth`/`drawShapedRun` **once per run** instead of once per line, and place runs by
  resolved visual order (UAX#9 rule L2), not logical order. Pass `direction` explicitly to `layout()` so
  fontkit stops guessing per run; whether that alone suppresses the digit reversal is **worth measuring
  first** (`script` and `language` alone were measured and change nothing). Confirm whether comb fields
  need this at all before assuming they do.
- ~~**H7. Layer 1: composition before shaping.**~~ **Done 2026-08-26.** The browser composes a base and
  its point into a precomposed glyph; fontkit ran no composition step, so the point painted at the
  cluster origin. Measured: in Arimo the dagesh of `בְּ` landed with **0%** of its ink inside the letter,
  in Tinos **33%**. Fixed per the design record: `composeHebrewClusters` in `src/lib/hebrewComposition.js`
  runs NFC (undoing any precomposed paste and canonically reordering marks - the step that makes typed,
  reordered and precomposed input all collapse to one string before composition ever runs) and then
  recomposes the 34 Hebrew presentation forms (U+FB1D-FB4E) NFC's own Composition Exclusion Table
  deliberately leaves decomposed, gated on the font actually having a glyph for the composed character
  (the same gate HarfBuzz's own Hebrew composer uses). **The table is derived from the platform's own
  NFD/NFKD decomposition data at module load, not hand-transcribed** - a codepoint qualifies only when
  its NFD equals its NFKD, which is exactly "true canonical decomposition, not the `<font>` alternate-glyph
  compatibility mappings at FB20-FB29 or the FB4F ligature". A composable mark is not always adjacent to
  its base (`בְּ`'s sheva, ccc 10, sits between the base and dagesh, ccc 21), so the algorithm replicates
  the "blocked" rule from the Unicode canonical composition algorithm (UAX #15 D117) rather than matching
  adjacent pairs only, extending a composed form past any earlier mark whose combining class is lower.
  Wired into both `shapedWidth` and `drawShapedRun` in `src/editor/registry/text.ts`, ahead of
  `fk.layout()`, so both the per-line and per-comb-cell callers get it without `serialize` having to know.
  `harfbuzzjs` was considered as a devDependency oracle but turned out unnecessary: fontkit's own
  behaviour under composition was directly measurable and verifiable against the guards below.
- ~~**H8. Guards that can fail.**~~ **Done 2026-08-26**, all three tiers from the design record's "A guard
  that can see a misplaced mark": **Tier 1** (order-insensitivity, no browser) and **Tier 2** (mark
  containment, pure arithmetic) live in `src/editor/registry/hebrewMarkPlacement.test.js`, calling the
  real `drawShapedRun` (not a bypassed `layout()` call, the exact mistake Guard A made once already) for
  every entry in the enumerated corpus (`src/lib/hebrewCombiningCorpus.js`, generated from the same
  presentation-form table H7 uses) across all seven `HEBREW_CAPABLE_FONTS`. **Tier 3** (small browser
  reference anchor) is `e2e/sign/hebrew-composition-guard.spec.js`: a handful of clusters per font,
  asserting Chromium itself renders every canonical ordering pixel-identically - it checks the browser
  against itself, not against the export, which is what makes it the guard that fails if a browser
  update moves the reference out from under this fix.
  **Proven capable of failing, twice.** Before H7 landed, Tier 1/2 failed 310 of 483 cases through the
  real, unfixed `drawShapedRun` - not a contrived setup. After the fix, a deliberate no-op sabotage of
  `composeHebrewClusters` reproduced 240 failures; Tier 3 was sabotaged the same way (one variant
  substituted with an unrelated string) and failed in every font before being reverted.
  **One narrow, real, measured exception found while building Tier 2, not swept under a loose tolerance.**
  Composing a presentation form from a narrow base letter (yod, vav, zayin, final kaf) plus dagesh, or
  vav plus holam, can change that glyph's own metrics enough that SHEVA's existing GPOS anchor - tuned
  for the plain, uncomposed base - lands partly or wholly outside the composed glyph in a specific
  (font, letter) pair: Arimo (yod+hiriq, yod+dagesh), Tinos (final kaf+dagesh), Cousine (vav+dagesh,
  zayin+dagesh, yod+dagesh, nun+dagesh), Alef (vav+holam) - eight of 238 font×entry combinations. This is
  a font-authored anchor/ligature-attachment gap for a glyph real documents essentially never asked these
  fonts to host a second mark on before this fix started reaching it, not a regression in the composition
  algorithm itself: SHEVA is never the mark H7 actually composes in any of these cases (Tier 1 already
  proves the mark H7 targets - dagesh/holam - lands correctly and order-insensitively in every font), and
  OpenType mark attachment is declarative font data read identically by any conformant shaper, so a
  browser reads the exact same anchor. Named and pinned in `hebrewMarkPlacement.test.js`'s
  `KNOWN_SHEVA_DIVERGENCE` (mirroring `RETIRED_FONTS`/`KNOWN_DIVERGENCE_PX`'s precedent) at today's exact
  measured value, so any further regression still fails. **Not investigated further, and worth a look**:
  whether this is a genuine font GPOS gap or a fontkit mark-to-ligature-attachment limitation relative to
  HarfBuzz's fuller cluster-tracking (a plausible, narrower version of "Why no engine swap fixes this" -
  worth checking with a real browser render of these eight specific clusters before assuming either way).
- ~~**H9. Layer 4: shape per whitespace segment, not per line.**~~ **Done - landed before this entry was
  updated, TODO.md just never struck it through.** Verified 2026-08-26: `toShapingSegments` is wired into
  `serialize`'s per-line run processing in `src/editor/registry/text.ts`, and the `test.fixme` H8's entry above once referenced
  is gone from `hebrew-font-parity.spec.js`. Found 2026-08-22 while checking whether any font should be
  dropped: Blink shapes and caches text **word by word** (its ShapeCache), so any font feature whose
  context crosses a space never fires in the browser, while fontkit shapes the whole line and fires it.
  Measured over 25 realistic form strings: Arimo and Tinos each disagreed with the browser on 2 of 25
  whole-line (`Tel Aviv` was off by 113 font units from a kern pair spanning the space), and shaping per
  whitespace segment took six of the seven fonts to exact agreement. Two honest bounds this fix does not
  claim past: parity here is parity with *Chrome specifically*, since word-by-word shaping is Blink's
  caching strategy rather than a spec; and advance parity is necessary but not sufficient, because two
  fonts can agree on width while choosing different glyphs.

- ~~**H10. Drop or demote Playpen Sans Hebrew.**~~ **Done 2026-08-23: dropped.** It was a handwriting
  face carrying `calt`, which fontkit and HarfBuzz resolve differently, so the export drew different
  letterforms than the editor showed - 22 of 25 realistic strings disagreed, and 2.304px on two words
  once the parity guard measured unhinted. A divergence inside the shaper, so no pipeline stage fixed
  it, and the alternative was bundling a second shaper for one decorative font. **The part that would
  have been a bug is deleting the name**: drafts persist 14 days and keep arriving with the family the
  user picked, so `RETIRED_FONTS` in `src/lib/fonts.js` maps it to Gveret Levin and `resolveFontFamily`
  applies that first, keeping both sides on the same face. Also removed: the `@font-face`, the TTF, the
  licence entries, and the parity guard's per-font exemption - **the guard now has no exemptions, and a
  font needing one again is the signal to ask whether we should ship it.** Gveret Levin carries `calt`
  too and agrees on advances, but advance parity is not glyph parity: it still wants the Tier 3 pixel
  check under H8 before it is fully trusted.

### WYSIWYG text: what the two engines actually guarantee

**Opened 2026-08-27**, from an architecture spike. The Hebrew epic above closed the five pipeline stages.
This one is about the thing that was never a stage: **two rendering engines draw the same text and nothing
structurally guarantees they agree.** The editor paints HTML through Chrome (its shaper, its bidi, its
per-character fallback to *system* fonts); the exporter draws with fontkit, one embedded font per element,
no fallback. Everything in `SCRIPT_FALLBACKS` is mitigation for that gap, not a fix for it, which is why
every new script has needed its own bespoke correctness guard.

Read **[docs/wysiwyg-text-architecture.md](./docs/wysiwyg-text-architecture.md)** before starting
anything below. It carries the current-state map (verified from code, with file:line), the five options
and their real costs, and the measurements behind every claim here. Three product constraints are fixed
and are not up for relitigation: **one font face per text element** (family, weight, style, size, colour
uniform - the element is the atomic unit), **coverage-based rather than script-based selection**, and
**error as early as possible** while typing, with the save-time refusal kept as the backstop. Those
foreclose per-run itemization, which is the approach every server-side competitor uses.

**The one finding that should change how this backlog is read.** Under the constraints, a
`(family, script)` pair is drawable if and only if that file covers that script. Measured against the real
asset bytes, and cross-referenced against what actually proves each pair agrees with the browser:

| script | families that can draw it | agreement proof today |
|---|---|---|
| **Latin** | all 16 | Pacifico/Great Vibes/Dancing Script self-calibrating guard; **Caveat still red** (`test.fixme`) |
| Hebrew | Arimo, Tinos, Cousine, Assistant, Heebo, Alef, Gveret Levin | Guard A, Tier 1/2/3 |
| Arabic + Perso-Arabic | Scheherazade New | 151-case pixel guard + 22-case Pashto guard |
| Devanagari | Kalam | 185-case pixel guard |
| Bengali | Noto Sans Bengali | 259-case pixel guard (3 named divergences excluded) |
| Gurmukhi | Mukta Mahee | 140-case self-calibrating pixel guard |
| Telugu | Anek Telugu | 486-case self-calibrating pixel guard |
| Tamil | Noto Sans Tamil | 265-case self-calibrating pixel guard |
| CJK | Noto Sans JP/SC/TC/KR | advance-parity guard |
| **Thai** | Mali | **none** |
| **Cyrillic** | Arimo, Tinos, Cousine, PT Sans | **none** |
| **Greek** | Arimo, Tinos, Cousine | **none** |

*(Table refreshed 2026-08-28. The rows without proof are now Thai, Cyrillic and Greek - three, not
five, and all three are non-reordering, non-joining scripts, which is the category the Hebrew design
doc's argument for skipping a second shaper was explicitly scoped to. That is a reason to rank them
below a new script, not a reason to call them proven.)*

`hebrew-font-parity.spec.js` iterates `HEBREW_CAPABLE_FONTS`, so Guard A has never run on Caveat, Dancing
Script, Great Vibes, Kalam, Mali, Pacifico, PT Sans, Sacramento or Scheherazade New at all. And Latin is not the
safe script it looks like: **Pacifico, Caveat, Great Vibes and Dancing Script apply contextual
substitution (`calt`) to ordinary names** - Pacifico on every sample tested, including `Sarah Levi` and
`David Cohen`. `calt` walked differently by fontkit and HarfBuzz is the exact and sole reason Playpen Sans
Hebrew was dropped. These are the signature faces, drawing the one string a signing tool exists to draw,
and nobody has ever run that test on them.

So the per-font-empirical-proof model is not failing through negligence. It is failing because the cost
per pair is high enough that it only gets paid for a script that visibly broke. **Three of eleven
shipped scripts still have no proof** (down from five of seven when this was written - every script
added since has landed with its guard, which is the pattern to keep).

**Definition of done for the epic**, and it is the same shape as the Hebrew epic's, one clause wider:

> **Every text the editor can display either exports faithfully, or is refused with a clear message,
> and "faithfully" is something the repo can prove rather than something nobody has reported.**

Ordered below so every task leaves the repo better than it found it and can be the last one. Nothing
before W9 depends on W9, and W4 through W8 are independent of each other.

- ~~**W1. Render the produced PDF and look at the ink.**~~ **Done 2026-08-27.** New guard under
  `e2e/sign/`: `export-render-guard.spec.js`, `fixtures/exportRenderHarness.js`,
  `fixtures/exportRenderCorpus.js`, `fixtures/exportRenderBaseline.json`. Bundles the real `signPdf`
  (plus pdf-lib and pdf.js) with esbuild into the built `dist/`, loads it via a same-origin
  `<script src>` under the app's CSP (the same trick, and the same reason, as `shapingGuardHarness.js`),
  builds a blank 420x260pt page per case, runs `signPdf`, rasterises page 1 with pdf.js in the same
  browser at 3x, and reduces the page to a 48x24 grid of per-cell mean ink quantised to one byte, stored
  base64 as a committed baseline. 21 cases. Distance metric is a symmetric difference normalised by ink
  present, the same shape as `shapingGuardHarness.js`'s `pixelDiffPct`, one level coarser. Determinism
  measured in-session (every case exported and rasterised twice): noise floor 0.00%. `MIN_TOLERANCE_PCT`
  is 12.5, calibrated rather than declared: with no Linux or Docker available locally, re-rendering the
  whole corpus at 1.01x scale (max 5.43%, worst case `hebrew-heebo`) and translating the render by 0.5
  and 1 device pixel (max 4.17% and 8.18%, worst case `comb-ltr` both times) stood in for cross-rasteriser
  difference. Worst overall 8.18%, times a 1.5x multiplier, rounded to 12.5. **Worth recording:** the
  originally declared floor of 8 did not clear the measured proxy (8.18 > 8) - an unmeasured floor had
  been sitting just under the noise it was meant to absorb, green locally and red in CI. `NON_VACUITY_MARGIN
  = 2` is derived, not chosen: by the triangle inequality, distinct cases stay strictly closer to their
  own baseline than to any other case's only when distinct cases sit more than 2x tolerance apart; the
  spec asserts that property directly, not only through the closest-pair proxy. Final run: closest
  distinct pair `hebrew-arimo`/`mixed-rtl-paragraph` at 31.65% (2.5x tolerance). The non-vacuity
  assertion caught a real defect on its very first capture, and it was in the corpus rather than the
  product: for an RTL element `element.left` is the box's right anchor edge, so every Hebrew and Arabic
  case had been anchored at 8% of the page and drawn growing leftward off the sheet, leaving only a
  clipped tail - two different RTL strings reduced to the same fragment and read as 0.00% apart. An "is
  there ink?" pass condition would have called that green. **Update 2026-08-27, the Linux gap closed:**
  this guard's baseline was captured on macOS and had never actually run in CI - masked for a month by an
  unrelated flaky unit test that failed before the job reached the e2e step. Once that test was fixed,
  CI's real Linux/Chromium run drifted two cursive cases past the proxy-calibrated floor (`latin-caveat`
  13.68%, `latin-great-vibes` 17.61%), while the rest of the 21-case corpus and the closest-distinct-pair
  number (31.60%, matching the 31.65% recorded above) held steady - the signature of real cross-platform
  antialiasing noise on thin strokes, not a regression, and exactly the scenario this section's tolerance
  discussion anticipated but could not measure for real. Raising `MIN_TOLERANCE_PCT` to cover it was not
  an option: at 2x the two closest-pair cases sit only 31.60% apart, capping tolerance below what the
  real Linux delta needed. Recaptured the baseline for real on CI (Linux, matching Chromium) instead of
  guessing at a bigger proxy-derived number. Also fixed a second, unrelated guard the same masked run
  exposed: `cjk-advance-parity-guard.spec.js`'s "did the FontFace really apply" sanity check compared
  against generic `sans-serif` measuring Japanese text, which on a CI box with a Noto CJK package
  installed (a `playwright install --with-deps` side effect) measures the same as the bundled font and
  false-flags a correctly-applied font as never having loaded. Switched the control to a Latin string
  against the bundled Arimo face, which sidesteps CJK fallback entirely.
  **Stated limitation:** at a 12.5% relative
  tolerance a defect smaller than roughly an eighth of a case's ink passes - a combining mark a point off
  its base, a fractional baseline shift, a moved kern pair, none of these are reported. That is a
  division of labour with the per-script shaping guards, which resolve far finer differences because
  they calibrate in-session and never leave the browser, but which compare fontkit against Chrome before
  a PDF exists and never look at the file. A green run here is not evidence of shaping fidelity, and no
  per-script guard should be retired because this exists.
- ~~**W2. Close the NFC coverage seam.**~~ **Done 2026-08-27.** `unrepresentableCharacters` in
  `src/editor/registry/text.ts` now judges coverage against the string that reaches fontkit's `layout()`:
  split on `/\r?\n/` first, then per line `composeHebrewClusters(stripInvisibleFormatting(line),
  thisFontsHasGlyph)`. `resolveBidiRuns` is deliberately not pulled in - bidi reorders and splits but
  changes no characters, so it cannot affect a character-set question. Measured before/after on the real
  bundled TTFs: `'שלום ' + U+03B1 U+0301` (decomposed Greek alpha plus combining acute) in Heebo was
  `[]`, now reports U+03AC (Heebo has U+03B1 and U+0301 but not U+03AC). `String.fromCodePoint(0xFB1D)`
  pasted, in Alef, was refused, now `[]` (Alef lacks U+FB1D but has U+05D9 and U+05B4, and the
  composition gate correctly leaves it decomposed). Tests added in two places deliberately:
  `src/editor/registry/textShaping.test.js` gets a "the normalization seam" describe block for the
  low-level function, `src/lib/textCoverage.test.js` gets "the normalization seam, at policy level" for
  `findUnrepresentableCharacters`, the shared rule both `signPdf`'s refusal and the editor's
  while-typing notice run through. Both directions in both places, each test asserting its own premise
  against the real font bytes. **W2 turns a silent loss into a refusal, not into a working export** -
  `שלום ά` in Heebo now stops the download. That is the fail-safe property the design record argues for;
  W3's coverage-first rule is what later turns it into a correct substitution to Arimo, which covers
  both. The policy-level test carries a comment saying its assertion is meant to change under W3. One
  correction for whoever writes W3's tests: the literal character 'יִ' is already decomposed (U+05D9
  U+05B4) and does not reproduce the false-refusal case - `String.fromCodePoint(0xfb1d)` is required. A
  newline-boundary regression test was deliberately not added: no bundled font has a Hebrew
  presentation-form glyph while lacking the corresponding isolated combining mark, so no real case can
  distinguish per-line from glued-line composition; the per-line split is implemented anyway because it
  matches `serialize`'s own per-line contract. The comb path in `src/lib/textCoverage.js` was checked and
  deliberately not changed: `combCharacters()` splits on grapheme clusters, so a cell boundary can never
  fall inside a base-plus-marks run, and joining cells with '' reconstructs exactly what per-cell
  composition would produce.
- ~~**W3. The coverage-first selection rule.**~~ **Done 2026-08-27** (`4cb9255`, "Judge font coverage by
  the bytes, not by a script-pattern table (W2-W5)"). `resolveFontSubstitution` in `src/lib/fonts.js` now
  filters the catalogue by real coverage (via the range-encoded `fontCoverageTable.js`) rather than a
  hand-ordered `SCRIPT_FALLBACKS` regex table, ranks candidates by style tag then handwriting-class then
  catalogue order, and computes the post-normalization lookup per candidate. `שלום Привіт` in Heebo now
  draws (substituted to Arimo, explained) instead of being refused; a genuinely uncoverable mix like
  Hebrew+Arabic still refuses, but for the honest reason. `fontCoverage.test.js` was reworked to check the
  resolver's answer against the real bytes rather than a static capability list.
- ~~**W4. Source the bold and italic faces the catalogue is missing.**~~ **Done 2026-08-27** (`4cb9255`,
  same commit as W3/W5). Checked upstream first as instructed: added six real faces bundled from each
  font's own project repo (not the variable binaries google/fonts ships) - Caveat-Bold, DancingScript-Bold,
  Kalam-Bold, and Mali's Bold/Italic/BoldItalic (verified as true -10° italics, not synthesized obliques),
  all OFL 1.1. Confirmed Alef/Almarai/Assistant/Heebo correctly have no italic (Hebrew/Arabic typography,
  not a gap). Pacifico, Great Vibes, Sacramento and Gveret Levin stayed single-weight display faces and
  were left disabled rather than chasing a replacement face - the "either disable" branch of bucket 3.
- ~~**W5. Honest weight and style.**~~ **Done 2026-08-27** (`4cb9255`, same commit). `covers()` now takes
  `(family, weight, style, text)`; a new `hasRealFace(family, weight, style)`, driven by the generated
  `FONT_COVERAGE_FILES` table, drives `ElementToolbar.tsx`'s Bold/Italic controls so a missing file
  disables the control (reachable by screen reader) instead of silently synthesizing on screen while
  404-falling-back to Regular in the export. Deliberately does not substitute family for a missing weight.
  Guarded by `fontCoverage.test.js`: every `(family, weight, style)` the picker can offer has a real file.
- ~~**W6. `/ActualText` per shaped run.**~~ **Done 2026-08-27** (`bb6f2f4`, "Tell a reader what was typed,
  not what was drawn"). Each shaped run in `src/editor/registry/text.ts` now draws inside a
  `/Span <</ActualText …>> BDC … EMC` sequence, package-root pdf-lib exports only, no fork. Order is
  visual (free - fontkit's own glyph emission order), chosen against poppler's own bidi pass rather than
  the spec's logical order. Measured impact honestly: fixes `pdftotext` extraction (poppler honours the
  field), a no-op for pdf.js and macOS PDFKit/Preview (both ignore `/ActualText`), Acrobat unmeasured (none
  installed). The e2e guard uses both extractors since only the Hebrew case discriminates the feature.
- ~~**W7. The catalogue coverage report.**~~ **Done 2026-08-27** (`5b20b85`, "Make 'should we add a font'
  a query instead of a session"). `scripts/generate-font-coverage-report.mjs` generates
  `src/lib/fontCoverageReport.js` from the real range-encoded coverage table - which families draw each of
  16 languages and each of seven script combinations, judged against real alphabets rather than probe
  codepoints. Confirmed the standing answer: Hebrew+Arabic is the one combination with zero covering
  families (still open - see the DejaVu Sans / licence-first note below, unchanged). Never imported by a
  bundle (Node/build-time only, zero page weight); the Sign page's Languages copy stays curated prose kept
  honest against the report by `languageCoverage.test.js`.
- ~~**W8. Latin parity for the four `calt` faces.**~~ **Done 2026-08-27** (`89c5fcf`, "Run the shaping
  guard on the four signature faces at last"). `e2e/sign/latin-shaping-guard.spec.js` runs
  `shapingGuardHarness` on Pacifico, Caveat, Great Vibes and Dancing Script over a Latin name corpus, with
  calibration derived from the corpus's own non-substituting strings (the first version's single-character
  calibration was proven vacuous - antialiasing-dominated on thin strokes, unable to fail). Pacifico, Great
  Vibes and Dancing Script pass clean. **Caveat is `test.fixme`**, not because of a confirmed letterform
  disagreement - the one flagged case ("Alexandra Whitfield") was re-measured via advance-width
  discrimination and Chrome's `fi`/`O'Brien` measurements match fontkit's shaped widths to floating-point
  precision, so both engines apply the same ligature - but because the pixel metric sits near-saturated on
  this face (a zero-substitution control alone measures 41.12%), so the guard cannot currently discriminate
  a real divergence from noise in the 40-65% band. Recorded as fact, catalogue decision left open. Gveret
  Levin's `calt` was confirmed to fire on neither Hebrew nor Latin, closing the design record's open note.
- ~~**W9. The open architecture decision, deliberately not pre-empted.**~~ **Decided 2026-08-27: Option A
  - keep two engines, harden the guards.** Coverage is necessary, not sufficient: constraint 1 guarantees
  the same font *file* on both sides, never the same output from it. Two live options were written up in
  full in the design record with costs, and Shlomi picked between them rather than have one pre-empted:
  - **Chosen - keep two engines, harden the guards.** His reasoning, in his own words: "this is a form
    filling and signing app, not a freeform paint tool." A form field and a signature line are short,
    known strings, mostly the user's own name and a consent form's words, not arbitrary prose in an
    arbitrary font - the general-editor argument for making agreement structural weighs less here than it
    would in a freeform tool. On what counts as good enough: "if the overall diffs are small it is good
    enough." **The acceptance criterion for a `(font, script)` pair changes accordingly**: no longer pixel
    parity with the browser, but **no wrong letterforms and no missing text**. A small measured
    divergence in placement is acceptable; a glyph-level difference is not - exactly the line the Playpen
    Sans Hebrew removal already drew (dropped because fontkit and HarfBuzz chose different letterforms
    from its `calt`, not because it was a couple of pixels off). **Scope of the hardening: a few simple
    tests**, deliberately proportionate - not a new dependency, not an architectural change. Concretely:
    extend the existing `shapingGuardHarness` (already does per-script pixel parity in a browser, at zero
    new dependency cost) to the map's unproven pairs - Latin (the four `calt` faces, W8 above), Thai,
    Cyrillic and Greek. The `harfbuzzjs` **devDependency oracle** from the write-up below was considered
    and **not** adopted: it ships nothing and costs zero page weight, but the existing harness
    already answers the parity question it would answer, which is why "a few simple tests" was sufficient
    scope. §1.3's guard map in the design record stays a correctness obligation, not a quality dashboard
    - that demotion was the other option's consequence, and it was not taken.
  - **Not chosen, kept as backlog - paint the editor from the exporter's own shaper.** Not rejected on its
    merits; recorded below as a separate backlog item so it is a real tracked item rather than a sentence
    buried in this strikethrough. See that entry and design-record §5 Option 2 / §6.2 for the full
    write-up, costs, and what would justify reopening it.

  **Ruled out, so it is not reopened.** *Browser authoritative* is not an option at all: no browser API
  yields glyph IDs (`measureText` gives advances; SVG's `getStartPositionOfChar` gives per-*character*
  geometry, so the browser can say **where** and never **what**), which means the only way to make the
  browser's rendering authoritative inside the PDF is to ship its pixels - rasterisation, already
  permanently ruled out. **"Browser authoritative" and "rasterise the text" are the same option, and the
  decision was already taken**; typed signatures are that option, taken deliberately, in the one place
  losing selectability is acceptable. *Shipping HarfBuzz to users* is also not "one shaper on both
  sides": fontkit cannot be removed (`@cantoo/pdf-lib`'s embedder is built on it), so the cost is
  additive, and Blink's own segmentation and normalization still sit above Chrome's HarfBuzz. It fixes
  one stage of five. Note also that `check-page-weight.js` would not see it - it counts `/_astro/*.js`
  referenced from the HTML, and a WASM shaper would be a runtime `import()` like pdfjs and fontkit
  already are - so "it fits the 48,000 budget" would be true and misleading. The real number is bytes to
  a user on top of the ~614KB brotli the editor already lazy-loads.
- **W10. Backlog (deferred by W9, not rejected): paint the editor from the exporter's own shaper.** The
  structural alternative to W9's chosen hardening - `fk.layout()` plus `glyph.path.toSVG()` into a
  `Path2D` layer over a transparent, `caretColor`-preserving textarea, making agreement between editor and
  export structural rather than proven per font per script. Full write-up, costs (caret/selection drift,
  an IME fallback, moving intrinsic sizing off the browser onto `shapedWidth`) and what it does and does
  not fix: design record §5 Option 2, §6.2, §6.3, §6.4. Worth doing if a bundled face is found to draw
  genuinely different letterforms between fontkit and HarfBuzz (a real Playpen repeat) that the catalogue
  wants to keep rather than drop - at that point the disagreement has to be resolved structurally instead
  of by curation, and the argument that decided W9 no longer holds.

### Known small defects

- **The CSS-duplication and page-weight budgets are down to single-digit-percent headroom, and a
  Sign-page change can now tip them on its own.** Measured 2026-08-28 while adding the Languages
  card's per-language accordion (`ToolLanguagesCard.astro`, native `<details>`/`<summary>`, no JS):
  that change alone passes both guards with real margin (`test:css` 28,846/29,000 bytes on
  `/licenses/`; `test:weight` 47,991/48,000 bytes on `/sign/`), reusing existing utility classes
  wherever one already matched and a plain CSS-drawn chevron instead of a per-row SVG icon
  specifically to protect the ratchet. But `main` at the time (`6365486`) already sat at
  47,776/48,000 on `/sign/` before that change - only 224 bytes of headroom - and the Sign editor's
  own concurrent WIP (new bundled fonts, new shaping-guard fixtures) pushed `/sign/`'s eager JS up on
  its own. The two independently-fine changes combined push both guards red: `test:css` 29,021/29,000
  (21 over) and `test:weight` 48,141/48,000 (141 over). Neither side regressed by itself; the budgets
  are just no longer wide enough to absorb two small, legitimate additions landing close together.
  **Not fixed here** - fixing it means either trimming real bytes from what's already shipping (the
  38 `@font-face` rules noted as a known follow-up under commit `4cb9255`, or the CJK coverage-table
  encoding, are the two largest known levers) or deliberately raising the limits in
  `check-css-duplication.js`/`check-page-weight.js` and saying what justified it - not something to
  do reflexively the next time a guard goes red on an unrelated change.

- **The export render guard is red on macOS and green on Linux, deterministically.** Its baseline was
  recaptured on Linux CI (79eb235) because it had never actually run there; on macOS it now fails on
  exactly two cases, every time: `latin-caveat` at 13.68% and `latin-great-vibes` at 17.61% against a
  12.50% tolerance. Those are the same two numbers the recapture commit measured going the other way,
  so this is one gap seen from both ends: cross-platform antialiasing on thin cursive strokes, on the
  only two faces in the corpus thin enough to feel it. Every other case, including the two just added
  for Japanese and Bengali, matches on both platforms.
  **Correction to an earlier version of this entry, which called it intermittent.** It is not. The runs
  that read 0 drifted were taken while the baseline file was being edited by a concurrent session; with
  a settled tree it reproduces on every run. An "intermittent" label would have sent the next person
  hunting for a race that does not exist.
  **The fix to reach for is per-platform, not a wider tolerance.** 12.5% was derived from a
  1px-translation proxy, and widening it globally costs the guard the power to see a single substituted
  glyph, which is the thing it exists for. Either record which platform a baseline was captured on and
  carry a documented per-platform allowance for it, or keep two baselines. Until then the guard is
  authoritative in CI and a known false red locally, which is a bad state to leave for long: a guard
  developers learn to ignore has already stopped working.

- ~~**The font coverage table ships CJK to everyone, and 92% of it is CJK.**~~ **Fixed 2026-08-28**
  (`24b6da0`). `src/lib/fontCoverageTable.js` was range-encoded from the real font bytes and is imported
  by `fonts.js`, so it reaches the browser in the editor's lazy chunk. It was 3,230 brotli bytes with 16
  files; Japanese took it to 8,916, and Simplified, Traditional and Korean to **25,667** (the entry
  originally recorded 25,519, measured before Bengali landed), of which the four CJK families were about
  21KB. Everything else in the catalogue put together is about 2KB. So someone signing a form in English
  downloaded roughly 23KB of coverage data for four fonts they will never open.
  **Fixed as measured, by encoding a block as a bitmap when a bitmap is smaller: 25,667 -> 11,941
  brotli** (SC 7,732 -> 2,905, TC 8,085 -> 2,570, JP 5,077 -> 1,708; those are marginal per-family
  figures, so they do not sum to the total). Ranges are optimal for the contiguous case almost every
  script is and pathological for Han - Noto Sans TC covers 11,147 codepoints of U+3400-U+9FFF in 4,210
  separate ranges, so nearly every "range" is one character paying for two numbers and three bytes of
  punctuation. Korean needed nothing and got nothing: Hangul is one contiguous run outside the block, so
  its share is empty and `[]` beats 4,608 zero bits.
  **Three things it deliberately is not**, each of which was the tempting wrong turn. It is not a
  replacement for ranges: `chooseEncoding()` in the generator encodes each candidate block both ways and
  keeps the shorter source text, so no font is ever hand-classified as "a CJK font" and a future
  scattered block qualifies on its own measurement rather than on someone remembering to add it. It is
  not laziness: `covers()` stays synchronous and pure, a bit test instead of a binary search, because
  `resolveFontFamily` sits in `TextNode`'s render path and W3 already measured and rejected making it
  async - revisit that only if a fifth CJK family ever lands. And it is not a re-derivation: it is a
  lossless re-encoding of the same answers, which was checked rather than asserted (below).
  **The equivalence proof is the part worth keeping.** Every answer of the old table was captured across
  the full Unicode range for all 48 files and replayed against the new one: **53,477,376 comparisons, 0
  differing answers**, 118,426 true answers on both sides. Sampling would not have been enough - a single
  flipped bit is one character that silently starts rendering as `.notdef`, or starts being wrongly
  refused while typing, and nothing else in the app would say why. `fontCoverageTable.test.js` now
  re-derives the hybrid encoding independently instead of importing the generator's encoder (a guard that
  reuses the code it guards cannot notice the encoder and the reader disagreeing) and checks every
  codepoint of every bitmap block against fontkit in both directions; it was proven capable of failing by
  flipping one bit in the committed table.

- **The Han bitmap block is a candidate list of one, and the next scattered script should be measured,
  not assumed.** `BITMAP_CANDIDATE_BLOCKS` in `scripts/generate-font-coverage.mjs` currently holds
  `[0x3400, 0x9fff]` only. The bitmap's cost is fixed at 4,608 source characters per block per file
  regardless of how much of it a font covers, which is exactly why it is a candidate list rather than a
  rule applied everywhere: for a font with no Han the bitmap would be 4,608 characters of zeros where
  the range list is `[]`. The crossover is around 330 ranges in a block. So when a script lands whose
  coverage is scattered rather than contiguous - CJK Compatibility Ideographs, Extension B, or a font
  that subsets a large block sparsely - add the block to that list and let the generator decide per file.
  Nothing needs deciding today: the six Brahmic scripts in the internationalization backlog are small and
  contiguous, and range encoding is the right answer for all of them.

- ~~**Hebrew text shaping in the export.**~~ **Fixed 2026-08-21.** Pointed Hebrew exported wrong in
  every bundled font because `page.drawText()` ran the shaper and then discarded the glyph positions it
  computed, so marks landed by raw advance width; comb fields had a second, independent bug where
  `combCharacters()` split on code points and stranded every nikud mark in a cell of its own. Fixed per
  the design record: `shapedWidth`/`drawShapedRun` in `src/editor/registry/text.ts` emit each glyph at
  its shaped position (falling back to `page.drawText()` for a font with no reachable fontkit instance),
  and `combCharacters()` in `src/lib/comb.js` now splits on grapheme clusters. Both guards landed and
  were proven capable of failing: `src/editor/registry/textShaping.test.js` (Guard B, unit) and
  `e2e/sign/hebrew-font-parity.spec.js` (Guard A, Playwright). Verified in a real `npm run build && npm
  run preview` download across all seven `HEBREW_CAPABLE_FONTS`. Full design and the numbers behind each
  choice stay in [docs/hebrew-text-shaping-export.md](./docs/hebrew-text-shaping-export.md).
  **Correction 2026-08-22: "export matches the editor preview exactly" was too strong a claim, and this
  entry said it.** That verification was done by eye, and it missed that Arimo and Tinos still place the
  dagesh outside its letter - a separate defect one layer up (H7 above), not a failure of this fix. The
  fix itself stands and is a strict improvement. The lesson is the reason H8 exists: the guards that
  shipped with this entry could not have caught what the eye missed either.
  **This is layer 5 of five**; see "Hebrew text export: the three missing pipeline layers" above.

- ~~`.list-hint` is dead CSS still in `global.css`~~ **Fixed.** Deleted the 5 dead lines, and the stale
  "left alone" comment in `FileList.module.css` that referenced it.
- ~~`useEditorDraftPersistence.js`~~ **Fixed.** Converted to `.ts`; `src/editor` is now 28 TypeScript
  files to 0 JavaScript.
- ~~Type the interactive shell (`.jsx` → `.tsx`)~~ **Fixed.** All 50 `src/components` files (plus their
  27 test files) are now `.tsx`, with light types rather than a deep interface pass per file (props as
  inline object types, `any` for still-undocumented domain shapes like editor elements and action-history
  entries, typed `useRef`/`useState` generics). `npm run typecheck` (`astro check`) went from the
  878-error baseline this produced to 0; every other guard (tests, build, CSP, SEO, CSS, gesture golden
  rule, page weight, e2e) stayed green throughout. `src/lib` (34 `.js` to 2 `.ts`) is intentionally out of
  scope for this pass - a separate, smaller gap.
- **`ElementToolbar.jsx` still has 5 `element.type ===` branches** deciding which controls to show.
  Investigated: not a good fit for the registry after all. Four of the five (text/symbol/signature/
  whiteout) are genuinely per-type and could move into registry modules, but the shape branch
  (`isDrawnShape || isLine`) renders a switcher *between* ellipse/rectangle/line - clicking "Line"
  while a rectangle is selected converts its geometry and reassigns `element.type`. That control
  inherently needs to know about sibling types, which is the opposite of what the registry buys
  (files that don't know about each other). Forcing it in means duplicating the switcher three times
  or inventing a "type family" concept that exists nowhere else. Left as-is; not worth the complexity
  it would add.

### Internationalization: fonts for scripts beyond Hebrew/Latin

- **Pashto (پښتو): eleven letters, and the cheapest language gap on the board.** Afghanistan is a real
  traffic source and Pashto is one of its two official languages; Dari already works, through Almarai,
  and Pashto fails on exactly eleven characters, each verified absent from **every one of the 46 bundled
  files**: ټ U+067C, ځ U+0681, څ U+0685, ډ U+0689, ړ U+0693, ږ U+0696, ښ U+069A, ګ U+06AB, ڼ U+06BC,
  ې U+06D0, ۍ U+06CD. Everything else in the Pashto alphabet is already there (Almarai scores 34/45).
  This is the only unsupported language in the top-traffic countries where the fix is plausibly a
  **different Arabic face rather than a new script**, so it should be screened before committing to
  another Brahmic font. The question to answer first: is there one OFL or Apache-2.0 Arabic face that
  carries Arabic **plus** Farsi/Dari **plus** Pashto **plus** Urdu, so it replaces Almarai rather than
  joining it? Noto Naskh Arabic and Noto Sans Arabic are the obvious candidates and both are OFL.
  Replacing Almarai is not free: it is the only Arabic face in the catalogue, so a swap needs the
  151-case Arabic pixel guard re-run against the new face, and `RETIRED_FONTS` in `src/lib/fonts.js`
  exists for exactly this kind of rename. Adding a second Arabic face instead is cheaper to land and
  leaves two faces where one would do.
  **Screened 2026-08-28, and the answer is Scheherazade New.** Five OFL candidates were measured from
  real cmap bytes and run through the 151-case Arabic pixel guard plus a new 22-case Pashto corpus
  covering all eleven letters isolated and joined. Coverage was never the differentiator - all five
  draw every Arabic, Farsi/Dari, Urdu and Pashto codepoint. Shaping was.
  - **Scheherazade New** (SIL, OFL 1.1): 151/151 and 22/22. The recommendation. 324KB Regular, 580KB
    Bold, real named instances. `loca` unaligned (1,049 and 815 odd offsets), so it needs the same
    `glyf` padding = 4 fix Kalam got, verified outline-identical before landing.
  - **Amiri** (OFL 1.1): also 151/151 and 22/22, but reads as calligraphic and formal, which is wrong
    for a form-filling tool. Keep as the fallback if Scheherazade New disappoints in use.
  - **Noto Naskh Arabic** and **Noto Sans Arabic**: both 150/151, failing the *same* case - `بَّ`, beh
    with shadda and fatha stacked. Naskh misses narrowly (23.01% against 22.35%), Sans by a wider
    margin (29.47% against 17.30%). One specific disagreement about stacked diacritics, not flakiness.
    Noto Sans Arabic is the only candidate whose `loca` is already aligned.
  **Cost of the swap, which is not just a bug fix:** Scheherazade New is a heavier, more traditional
  Naskh than Almarai's geometric modern face, so **every existing Arabic, Dari and Farsi user's output
  changes visibly**. Budget the `RETIRED_FONTS` rename, a re-run of the Arabic guard against the new
  bundled file, and 580KB for Bold against Almarai's 149KB.

  **Landed 2026-08-28 - Almarai retired, Scheherazade New takes its place.** `RETIRED_FONTS.Almarai`
  maps to it in `src/lib/fonts.js`, so a draft saved under the old name still renders and exports
  identically. The `glyf` padding fix was applied and verified outline-identical across all 1,822/1,805
  glyphs in Regular/Bold before bundling (`npm run test:fonts` passes on both files). The 151-case
  Arabic/Farsi/Urdu guard now runs against Scheherazade New instead of Almarai, and a new 22-case Pashto
  corpus (`PASHTO_CORPUS` in `e2e/sign/fixtures/arabicCorpus.js`) runs as its own guard in the same spec
  file, both against the bundled file rather than a scratch candidate. `scripts/font-languages.mjs` gained
  a `pashto` language definition (base Arabic + Farsi's four extras + the eleven Pashto letters), and the
  generated coverage report shows it at full coverage. The Sign page's languages card and FAQ (
  `src/data/tools.js`) got Pashto's own line and its own FAQ entry, and every Arabic/Dari/Urdu mention was
  renamed from Almarai to Scheherazade New; `licenses.astro` swapped the OFL attribution accordingly. Not
  yet re-verified: the export-render-guard's `arabic-almarai` baseline case (renamed
  `arabic-scheherazade-new`) needs a fresh capture, since the letterforms genuinely changed - see the W1
  guard's own instructions for `UPDATE_EXPORT_RENDER_BASELINE=1`.

  **Urdu in Nastaliq is now a separate, blocked project - do not bundle it with Pashto.** Noto Nastaliq
  Urdu does not merely fail the pixel guard: **fontkit crashes shaping it**, an uncaught
  `Cannot read properties of null (reading 'xCoordinate')` inside `GPOSProcessor.getAnchor`. That is an
  engine limit, not a tolerance question, and it puts Nastaliq in HarfBuzz-WASM territory - the option
  docs/hebrew-text-shaping-export.md argues against for Hebrew. Until then Urdu stays correctly joined
  and fully covered in Naskh, which is what the Sign page now says.


- **Malayalam (മലയാളം): zero coverage, and it is a UAE and India language, not only an India one.**
  Measured 0/49 characters across every bundled font. Noto Sans Malayalam is OFL. It is a Brahmic script
  with conjuncts and vowel reordering, so it needs the **pixel** guard (`shapingGuardHarness.js`, the
  Devanagari/Kalam model at 185 cases), never the CJK advance-parity guard - the two shapers can pick a
  different glyph and only pixels catch that. Note that Malayalam has both traditional and reformed
  orthographies, which differ in how conjuncts are written; pick one deliberately and say which.

- **India's remaining scripts: the largest opportunity by volume, and the most fragmented.** India is
  about 10% of traffic. Hindi and Marathi already work through Kalam, and Urdu through Almarai, but six
  scripts are at **zero coverage** and each one is its own font, its own guard and its own copy:
  **Bengali** (~285M speakers, seventh worldwide), **Punjabi/Gurmukhi** (~113M),
  **Telugu** (~96M), **Tamil** (~87M, and also an official language of Singapore and Malaysia, so it
  serves three countries on the traffic list), **Gujarati** (~62M), **Kannada** (~44M), plus **Odia**.
  Noto covers all of them under OFL.
  Two things to decide once, before the second one is built, rather than per script. **First, whether
  each script gets its own family or whether one face can carry several** - Noto is script-split by
  design, so the honest expectation is one file per script, and at roughly 400KB each that is repo
  weight rather than page weight, since fonts load on demand and are no longer precached. **Second, what
  this does to `src/lib/fontCoverageTable.js`**, which ships to every editor visitor: see the "font
  coverage table ships CJK to everyone" entry under "Known small defects". Brahmic scripts are small and
  contiguous, so each should cost far less than a CJK family, but six of them still add up and the
  bitmap re-encoding has landed, so a contiguous Brahmic script now costs about what Bengali does
  (141 brotli bytes), not what a CJK family used to.
  Do them in speaker order and stop when the return flattens - each one is a font, a pixel guard, a
  `scripts/font-languages.mjs` entry, a `FontPickerMenu` line and honest copy, and none of that is
  reusable between scripts except the pattern.

  **Landed 2026-08-28 - Bengali, Punjabi, Telugu and Tamil are all live, and the headline finding is
  that "Noto covers all of them under OFL" was true about coverage and false about shaping.** Coverage
  was never the constraint for any of the four. Shaping was, and it eliminated two of the four Noto
  faces outright:
  - **Noto Sans Gurmukhi is unusable**, and not marginally: fontkit throws an uncaught
    `Cannot read properties of null (reading 'xCoordinate')` inside `GPOSProcessor.getAnchor` on 203 of
    500 generated cases (every vowel sign except AA/I/II on most consonants) and on most ordinary words,
    including ਸਿੰਘ "Singh" and ਗੁਰੂ "Guru". **This is the same crash that blocks Noto Nastaliq Urdu**
    (see the Pashto entry above), which is the first evidence it is a general fontkit limit rather than
    a Nastaliq-specific one.
  - **Noto Sans Telugu is unusable for a narrower but not obscure reason**: the same crash on
    consonant+virama+RA, 4 of 630 cases - but that cluster is ప్ర, which is in ఆంధ్రప్రదేశ్, the state's
    own name. Noto Serif Telugu fails the identical four, so this is a Noto-family fault, not a Telugu one.
  - Both were **confirmed to reach the real export path**, not just the guard harness: `signPdf` on a
    one-element document rejects with that raw `TypeError` rather than a clean `UnrepresentableTextError`,
    so shipping either would have meant a crashing Download button rather than an honest refusal. Both
    were also confirmed **not** to be an artifact of instancing the variable font to static Regular/Bold -
    the upstream variable files crash identically.
  - **Replacements were screened the way the Arabic candidates were**, against the generated corpus
    rather than by reputation. Four OFL Gurmukhi faces (Mukta Mahee, Anek Gurmukhi, Noto Serif Gurmukhi,
    Baloo Paaji 2) and six OFL Telugu faces all shape their full corpus without crashing, so the fault is
    specific to those two Noto Sans files. **Mukta Mahee** (Ek Type) took Punjabi: real static Regular and
    Bold, full coverage plus Latin, `loca` already aligned. **Anek Telugu** took Telugu: full coverage
    including the ten Telugu digits that ruled out Hind Guntur, and it needed the same Kalam `glyf`
    padding = 4 repad (505 and 550 odd offsets), verified outline-, cmap- and metrics-identical across all
    738 outlined glyphs. **Noto Sans Tamil needed no screening at all** - it shapes all 329 cases cleanly.
  - **Guards, all self-calibrating** (`autoCalibrate`, since the project has no in-house shaping
    reference for these three scripts the way Bengali's GSUB features could be read directly):
    Gurmukhi 140/140 (floor 12.88%), Telugu 486/486 (floor 10.47%), Tamil 265/265 (floor 8.49%). Bengali's
    259/259 still passes unchanged.
  - `scripts/font-languages.mjs` gained `punjabi`, `telugu` and `tamil` definitions and all three report
    full coverage with exactly one family each. The Sign card, its intro sentence and its "More on the
    way" line were updated, and `languageCoverage.test.js` pins each new claim - including that the card
    *explains* why Punjabi and Telugu are not on their Noto faces, rather than quietly shipping a
    different font than a reader would expect.
  **Still open from the original six: Gujarati (~62M), Kannada (~44M), Odia**, plus Malayalam (its own
  entry above). **Screen the Noto face against a generated corpus before assuming it works** - that is
  the cheap step that would have caught both failures above before any wiring was done.

**Opened 2026-08-24**, from two asks in the same session: adding more fonts to the existing Hebrew/Latin
catalogue, and separately wanting handwriting support for India and Thailand. Cross-checked against the
top countries in Vercel Analytics (Israel, USA, India, UK, Philippines, Canada, Malaysia, Singapore, UAE,
Afghanistan, China, Ireland, Jordan, Ukraine) to prioritize by real traffic rather than guessing. Every
verdict below is measured, not assumed - each one either ran through the same checks that already gate the
Hebrew catalogue (license, `calt` absence, glyph coverage, fontkit-vs-browser advance parity) or hit a
concrete, reproducible failure.

**Landed:**

- **Script-aware font fallback, so no supported language hits a wall** - 2026-08-25. The gap this closes
  is that **the Sign editor is not truly WYSIWYG for non-Latin text**: it paints through `@font-face`,
  where the browser borrows a *system* font per character for glyphs the chosen file lacks, while the
  PDF embeds one font per element with no fallback. So the editor confidently displayed text the
  exporter could not reproduce, and the user only found out at Download, with the document already
  finished. Everything below follows from that one root cause.
  - `resolveFontFamily` in `src/lib/fonts.js` was already the single function the editor and the
    exporter both call so the two agree, but it only knew about **Hebrew**. It is now driven by
    `SCRIPT_FALLBACKS`, one row per script (pattern, capable fonts, handwriting and text fallback).
    The Hebrew row reproduces the old behavior exactly, so the app's largest non-Latin market is
    unchanged; Devanagari, Thai, Cyrillic and Greek are new rows.
  - **Measured, not assumed**, against the real font bytes: Devanagari is Kalam only; Thai is Mali only;
    Cyrillic is Arimo/Tinos/Cousine/PT Sans; Greek is Arimo/Tinos/Cousine; Arabic is nothing.
  - **This was never only a Hindi problem, and finding that was the point of measuring.** Thai had the
    identical bug: Mali shipped 2026-08-24 and was advertised on the Sign page, but nothing routed Thai
    text to it, so typing Thai in the default font walled exactly like Hindi. Cyrillic walled in any
    handwriting or Hebrew-only font. `fontCoverage.test.js` now verifies every row against the shipped
    TTFs **both ways** - every font listed can really draw the script, and every font left off really
    cannot. That second half is the one that fails when a face is bundled but left unrouted, and it was
    proven to fail by sabotage before being trusted.
  - **A substitution is explained, never silent.** `resolveFontSubstitution` returns which script forced
    the change, and the editor says so: "Arimo has no Devanagari letters, so this text box is using
    Kalam instead. Your download will look exactly like this."
  - **`liveFontCoverage.js` was fully written and unit-tested but had no call site anywhere** - the
    while-typing check existed and had simply never been wired up. It is now, debounced, document-wide,
    via `useFontCoverageNotice.js`. What is left after substitution is only the genuinely undrawable
    (Arabic, CJK, emoji), and that now warns **while typing** instead of at Download.
  - **The save-time refusal stays as the backstop** and cannot drift from the warning: the element walk
    and both message strings moved into `src/lib/textCoverage.js`, which `signPdf` and the editor both
    call, differing only in how they load a font.
  - Verified end to end in the real app on a genuine Hindi government PDF: Devanagari and Thai in the
    untouched default font, and Ukrainian in Caveat, all auto-resolve, show the notice, and **download
    successfully**; the downloaded PDF embeds Kalam, Mali and PT Sans as CID TrueType with ToUnicode,
    and all three strings extract with `pdftotext` as real searchable text. Arabic warns while typing
    and still refuses at save.
- **Alef, PT Sans, Mali** - added 2026-08-24 ("Add Alef, PT Sans, and Mali to the font catalogue"). Alef
  is a third Hebrew font choice; PT Sans is the first font supporting Ukrainian (Cyrillic); Mali is the
  first supporting Thai, as both a text font and a typed-signature handwriting font. Each passed every
  check `fontCoverage.test.js` and Guard A already apply to the catalogue (license, no `calt`, real glyph
  coverage, vertical metrics from the real `hhea` table); Alef additionally passed Guard A itself at
  exact 0.000px agreement across all three samples.
- **Kalam** (Devanagari/Hindi handwriting, SIL OFL 1.1) - added 2026-08-25. See the Devanagari writeup
  below for the full path from "not addable" to landed.

**Verified, no task needed:**

- **French-Canadian and Irish diacritics (Canada, Ireland), Filipino/Tagalog (Philippines), Malay
  (Malaysia).** Checked `characterSet` on all five existing Latin/Hebrew families
  (Arimo/Tinos/Cousine/Assistant/Heebo) against each language's actual accented set - é/è/ê/ë/î/ï/ô/ö/ù/û
  /ü/ç/œ for French, á/é/í/ó/ú for Irish, ñ for Filipino, unmodified Latin for Malay. **Full coverage on
  every family, no gaps.** These four languages need no new font work; closing this out rather than
  leaving a placeholder verification task on the board.

**Verified but not yet approved for implementation:** none currently open - Alef, PT Sans and Mali were
the only entries in this category and all three landed 2026-08-24 (see "Landed" above). Sriracha remains
a documented runner-up to Mali (same-day Thai handwriting look, `calt`-free, not parity-tested) if a more
explicitly cursive style is ever wanted, but nothing currently proposes swapping it in.

**Not addable right now - structural blockers, not curation calls:**

- ~~**Devanagari / Hindi (India).**~~ **Landed 2026-08-25 - Kalam added to the catalogue.** What follows
  is the path from "not addable" to shipped, kept for the reasoning rather than as an open item. A
  follow-up spike on 2026-08-24 first re-confirmed the earlier finding that `@pdf-lib/fontkit`'s
  `layout()` threw `ReferenceError: regeneratorRuntime is not defined` on Devanagari - still crashed,
  unpatched, on a single bare consonant `क` with no marks. Then fixed:

  - **The crash was the cheap kind.** `regeneratorRuntime is not defined` is the standard symptom of
    Babel-transpiled generator code with no `regenerator-runtime` polyfill loaded - `setupSyllables`,
    fontkit's Indic syllable state machine, is written with generators. A single
    `import 'regenerator-runtime/runtime.js'` before the first `layout()` call makes the crash disappear
    completely, verified directly against the pinned `@pdf-lib/fontkit@1.1.1` (the only version published
    to that package - it's a frozen 2020 fork, nothing newer to upgrade to). No patch, no fork, no
    `patch-package`. `regenerator-runtime` is MIT, ~3KB, dependency-free. **Context, not the fix used
    here:** upstream `foliojs/fontkit@2.0.4` (actively maintained through 2024, a different package from
    the pinned fork) does not crash at all, even with no polyfill - it appears to have dropped the
    Babel-generator build that needs one. That package is not a drop-in replacement (`@cantoo/pdf-lib`'s
    embedder reaches into `@pdf-lib/fontkit`-specific internals - see `pdfFont.embedder.font` in the
    design doc), so swapping engines was not pursued; it's recorded because it confirms the crash is a
    build artifact of an abandoned fork, not a real limit on JS shaping Devanagari.
  - **Correctness, tested against a real browser, not assumed.** Once the crash is gone, does fontkit
    shape Devanagari *correctly* - pre-base vowel-sign reordering and conjunct formation, the two axes
    Hebrew never needed (see `docs/hebrew-text-shaping-export.md`, "Why no engine swap fixes this": the
    Hebrew argument for skipping HarfBuzz is explicitly scoped to non-reordering, non-joining scripts and
    named Devanagari as the day it expires). Method mirrored the design doc's Layer-1 browser harness
    (embed the TTF via `@font-face` data URI, force-load with `document.fonts.load`, assert the probe
    discriminates before trusting it) but adapted for what Devanagari actually needs checked, since
    Hebrew's canonical-reordering Tier 1 guard doesn't port - Devanagari's vowel-sign/consonant order in
    Unicode is fixed, not ambiguous, so the question isn't order-insensitivity, it's "does our shaper's
    glyph selection and visual order match the browser's own shaping of the identical string." Built a
    second harness for that: shape each string with fontkit, get back glyph IDs, positions and each
    glyph's SVG outline (`glyph.path.toSVG()`), reconstruct the shaped result on a `<canvas>` with `Path2D`
    at fontkit's reported positions, and pixel-diff that against the *same browser's* native `fillText()`
    of the identical string in the identical font - one rasterizer, Chromium against Chromium, same
    discipline as the design doc's rejected-cross-rasterizer lesson. **Six strings against
    `Kalam-Regular.ttf`** (OFL, the one Google Fonts family that actually supports Devanagari
    handwriting): `कि` (pre-base vowel sign I - visual order must put the vowel sign before the
    consonant), `क्ष` (KA+virama+SSA conjunct ligature), `र्क` (RA+virama+KA - reph, which repositions
    above the *following* consonant, a different rule from the mid-word case), `शर्मा` inside a full
    name+surname string (RA+virama+consonant *not* syllable-initial, correctly *not* repositioned - the
    two RA cases disagree with each other and fontkit got both right), `क्या` (conjunct plus a trailing
    vowel sign) and `दिन` (a plain three-letter word). Every one of the six: **native `measureText` width
    and fontkit's total shaped advance agreed exactly, to the reported precision, on every string** (e.g.
    104.10 vs 104.10, 78.30 vs 78.30), and pixel disagreement between the native render and the
    fontkit-reconstructed render landed at 4.25-6.59%, against a **measured self-consistency noise floor
    of 4.82%** (the same single already-correct glyph, rendered once via `fillText` and once via the
    `Path2D` reconstruction path with zero shaping involved - pure antialiasing/hinting difference between
    the two rendering methods). Every case sits inside that noise band; none of the six show a
    shaping-attributable divergence.
  - **A finding that narrows the risk further: mixed Devanagari+Latin+digit lines do not hit the Hebrew
    bidi bug (Layer 2 in the design doc) at all.** Hebrew is Unicode Bidi_Class R/AL; a mixed
    Hebrew+Latin+digit line gets misjudged as one direction and reverses the other, which is why
    `תאריך 21/08/2026` exports as `6202/80/12 ךיראת`. **Devanagari is Bidi_Class L, the same class as
    Latin.** Tested directly: `राम शर्मा, दिनांक 24/08/2026` and `संख्या 1,250 रुपये` (a name, a date, an
    amount) both come out of `layout()` with every digit and Latin character in untouched logical order -
    there is no whole-string RTL judgment to trigger the reversal, because there is nothing RTL in the
    string. This is a property of the script's bidi class, not of anything this app built, and it does not
    generalize to Arabic (Bidi_Class AL) or to a script mixed with actual RTL content. **Kalam also has
    full ASCII Latin+digit coverage**, so a mixed line stays in one font - it does not hit the
    whole-element-font-swap path `resolveFontFamily` uses for Hebrew-in-a-Latin-only-face.
  - **What this spike was not (historical - the gap this bullet describes is closed, see the follow-up
    session below).** Not a production-grade guard suite, and not equivalent to the bar Alef/PT
    Sans/Mali cleared before being proposed above. Six strings in one font is a spike-level correctness
    check, not an enumerated corpus - Hebrew's Tier 1 covers a few thousand systematically-generated
    base+mark combinations per font precisely because "looked fine on some examples" is what let Playpen
    Sans Hebrew's `calt` divergence through undetected for months. A real Devanagari guard would need its
    own enumerated corpus (common consonant+matra pairs, reph vs. mid-word RA+virama, the more frequent
    conjuncts) and to run in CI via Playwright, not a one-off scratch harness. **Correction, 2026-08-24:
    Layer 3 (refuse characters no bundled font can draw) already exists and is live** -
    `unrepresentableCharacters` (`src/editor/registry/text.ts`), wired into both `signPdf` and
    `liveFontCoverage.js`, confirmed with a real repro against this exact document (see H5 above, now
    struck through). Typing Devanagari today with any bundled font already gets a clean, honest refusal
    naming the missing characters rather than a corrupted export - so this was never actually blocking a
    Devanagari addition, and the guard work still needed (below) is about *correctness*, not *safety*.
    **Only `Kalam-Regular.ttf` was tested.** The catalogue-is-ours-to-curate rule
    applies per font, not per script: a second Devanagari face would need this exact verification run
    again, not inherit Kalam's result. And **India's other major languages (Bengali, Tamil, Telugu,
    Gujarati, Punjabi) are untouched by this spike** - each is its own complex script with its own
    reordering/conjunct/joining rules and its own fontkit behavior to verify; nothing here implies they
    also work. English, India's other official language, is already fully covered.
  - **Recommendation at the time of this spike: worth a real follow-up, not ready to propose as a
    catalogue candidate yet - since resolved, see below.** The
    structural blocker (crash) that stopped this cold last time is resolved and cheaply so, and the safety
    net (Layer 3, confirmed live above) was never actually missing - so nothing here was blocked on
    infrastructure that doesn't exist. **Follow-up session, 2026-08-25 - all four remaining steps done,
    guard passed cleanly, font landed:**
    1. **Enumerated-corpus guard built**, not another spike: `e2e/sign/fixtures/devanagariCorpus.js`
       systematically generates 185 cases across the axes Devanagari actually needs checked - every one of
       the 33 base consonants x the 3 vowel signs with a pre-base visual component (ि, ो, ौ - 99 cases),
       reph (RA+virama+consonant, syllable-initial) for every following consonant (32 cases), subjoined RA
       (consonant+virama+RA, RA *not* syllable-initial - the `शर्मा` rule, the opposite order of reph and a
       different rule) for every preceding consonant (32 cases), and 22 curated common conjuncts
       (क्ष, ज्ञ, स्त, ष्ट, etc.) not already covered by the RA-based groups. `e2e/sign/devanagari-shaping-guard.spec.js`
       runs the same pixel-diff-against-native-Chromium-rendering method as the 6-string spike, scaled up:
       fontkit shapes each string, gets reconstructed via `Path2D` at fontkit's reported positions, and is
       pixel-diffed against the same browser's own `fillText()` of the identical string. Tolerance is
       derived per run from a measured noise floor (one already-correct glyph, `fillText` vs. the identical
       `Path2D` path, zero shaping involved), not a number picked in advance - matching
       `hebrew-font-parity.spec.js`'s discipline. **Result: 185/185 passed, 0 failing**, noise floor 6.79%,
       tolerance 10.18%, worst real case 8.28% (`RA+virama+थ`) - comfortably inside tolerance with real
       margin, not sitting on the edge. Verified the guard can actually fail, not just pass vacuously: sabotaging
       the reconstruction (reversing glyph draw order) made it fail loudly before reverting - the same "a
       guard that cannot fail" discipline H8 exists for.
    2. **`regenerator-runtime` wired for real.** Installed as a real (non-dev) dependency and imported at
       the top of `src/editor/registry/text.ts` - the one file that calls `fk.layout()` in production code
       (`shapedWidth`, `drawShapedRun`). `unrepresentableCharacters` (the Layer 3 coverage check) never
       calls `layout()` at all - it uses `hasGlyphForCodePoint` - so it was never at crash risk; the crash
       only lived on the serialize/export path, which is exactly where the import now sits. Verified
       `npm run build` and `npm run test:weight` are unaffected: worst page (`/sign/`) is 42,308 of a 48,000
       brotli budget, comfortable margin for a ~3KB dependency.
    3. Only after the guard passed cleanly: **Kalam added to the catalogue**, following the exact
       Alef/PT Sans/Mali pattern - `public/fonts/Kalam-Regular.ttf` (Regular only, matching Mali's
       precedent for a handwriting-style addition), one `@font-face` rule in `global.css`, an entry in
       `HANDWRITING_FONTS`/`FONT_VERTICAL_METRICS` in `src/lib/fonts.js` (real ascent/descent 1.063/0.531
       from the `hhea` table), and license entries in `THIRD_PARTY_LICENSES.md` + `/licenses/` (real
       copyright line from Kalam's own `OFL.txt`: "Copyright (c) 2014, Indian Type Foundry"). Classified as
       handwriting (not a `TEXT_FONTS`/`STANDARD_FONTS` entry) after actually rendering it side by side with
       Mali - Kalam is a clearly cursive/slanted face, so it needed no manual `FontPickerMenu.tsx` edit
       (auto-derived via `HANDWRITING_OPTIONS`, the same as Mali; this is the failure mode the first Alef
       pass hit and had to fix after the fact). **Not added to `HEBREW_CAPABLE_FONTS`** - confirmed via
       `hasGlyphForCodePoint` that Kalam carries no Hebrew glyphs at all.
    4. **End-to-end verified in the real running app**, not just the guard: loaded the same real Hindi
       government PDF, typed `नमस्ते भारत शर्मा क्षत्रिय २०२६` (covering नमस्ते's conjunct+vowel-sign, भारत's
       post-base vowel sign, शर्मा's reph, क्षत्रिय's ligature conjunct plus pre-base vowel sign, and
       Devanagari digits) with Kalam selected, and downloaded. The refusal from H5 no longer fires; the
       downloaded PDF (captured via `URL.createObjectURL` interception, decoded, rendered with `pdftoppm`)
       shows real, legible, correctly-shaped vector text - not a rasterized image, not corrupted, not
       refused.
- ~~**Arabic (UAE, Jordan) remains blocked**, unlike Devanagari - a joining script, deeper gap than
  Devanagari's.~~ **Landed 2026-08-25 - Almarai added to the catalogue.** What follows is the path from
  "not addable" to shipped.

  - **The premise in the paragraph this replaces was wrong, and it was wrong in a specific, checkable
    way.** "Itemization/shaping for that doesn't exist in this pipeline" assumed fontkit had no joining
    support at all. It does: `node_modules/@pdf-lib/fontkit/dist/fontkit.umd.js` carries an `ArabicShaper`
    class (`arab`, `mong`, `syrc`, `'nko '`, `phag`, `mand`, `mani`, `phlp` all route to it), explicitly
    ported from HarfBuzz's `hb-ot-shape-complex-arabic.cc` - a real joining state machine driven by
    `ArabicShaping.txt`'s classes (dual-joining, right-joining, transparent), assigning `isol`/`init`/
    `medi`/`fina` GSUB features per glyph before the normal feature-application pass runs. It needs no
    generator polyfill (unlike the Indic shaper Kalam's crash fix was about) and was never gated behind
    anything - the gap was that nobody had tried it, not that it was missing. Verified directly against a
    candidate font before writing a single line of catalogue code: `font.layout('مرحبا')` on a plain
    Naskh/sans face returns `[uniFE8E(alef-fina), uniFE92(beh-medi), uniFEA3(hah-init), uniFEAE(reh-fina),
    uniFEE3(meem-init)]` - the exact positional forms Arabic joining rules predict by hand, letter by
    letter, with no font-specific coaching.
  - **License and font selection, evaluated against real bytes, not marketing copy.** Candidates fetched
    directly from the `google/fonts` OFL repo (real `OFL.txt` in hand for each, not assumed): Noto Naskh
    Arabic, Amiri, Cairo, Almarai, Lateef, Scheherazade New. Two were excluded on sight: Lateef and
    Scheherazade New both carry `calt` (contextual alternates, `cv44`/`cv48`/... stylistic-variant sets) -
    exactly the feature class that got Playpen Sans Hebrew dropped from this catalogue (`docs/hebrew-text-
    shaping-export.md`: "fontkit and HarfBuzz walk that contextual substitution differently"), so both were
    rejected on that precedent alone, without needing to run them through the guard. Noto Naskh Arabic and
    Cairo are variable-font-only in the current google/fonts repo (no static `Regular` file), which would
    have required a font-instancing step with no precedent anywhere in this catalogue. **Almarai
    (`Copyright 2019 The Almarai Project Authors (https://github.com/JuergenWillrodt/Almarai)`, SIL OFL
    1.1)** was chosen: a static Regular file already exists, no `calt`, no `curs` (the GPOS cursive-
    attachment feature Amiri carries but fontkit's shaper plan never requests - would have been silently
    inert in our pipeline but potentially live in the browser's own renderer, a divergence risk not worth
    taking when a cleaner candidate exists), full ASCII Latin + Western digit + harakat + Arabic-Indic
    digit + mandatory-ligature coverage, 579 glyphs, 152KB Regular / 157KB Bold (both shipped - see the
    bold-weight note below) - the smallest, structurally simplest candidate that cleared every check, which
    is also the lowest-risk one for a shaper this codebase has never exercised before. Amiri (431KB, the
    next-cleanest candidate, genuinely excellent classical Naskh) was the closest runner-up and is recorded
    here in case Almarai's plain-geometric-sans character is ever wanted alongside a more traditional
    Naskh face - it would need its own full verification run, not inherit Almarai's.
  - **Bold shipped alongside Regular, unlike Kalam's Regular-only precedent, for a specific reason:**
    `ElementToolbar.tsx` exposes a real bold toggle, and without a bundled `Almarai-Bold.ttf` the browser's
    default `font-synthesis: weight` (never disabled anywhere in this codebase) would synthesize a fake
    bold on screen while `loadCustomFont`'s fallback (`sign.js`) silently downgrades the export to Regular
    - screen and PDF would disagree on the one axis this whole module exists to keep honest. Fetched
    `Almarai-Bold.ttf` from the same google/fonts OFL directory, same license, same real ascent/descent
    (`0.905`/`0.211`, identical to Regular - weights within a family share vertical metrics, matching the
    existing convention).
  - **The correctness guard, and a real calibration bug it surfaced before it surfaced anything about
    Arabic.** Built `e2e/sign/fixtures/arabicCorpus.js` (131 systematically-generated cases: every
    dual-joining letter forced into isolated/initial/medial/final form via a tatweel anchor - verified by
    hand against fontkit's own state-machine output before trusting the corpus, e.g. `بـ`/`ـب`/`ـبـ`
    resolve to BEH's initial/final/medial glyphs exactly as Unicode's joining rules predict; the six
    right-joining-only letters `ا د ذ ر ز و` in their two available forms; all four mandatory lam-alef
    ligatures `لا لأ لإ لآ`; harakat on both a dual-joining and a non-joining base letter; ten curated real
    words/phrases) and `e2e/sign/arabic-shaping-guard.spec.js`, mirroring the Devanagari guard's
    pixel-diff-against-native-Chromium-rendering method. **First run: 100/131 failing**, including
    single-letter isolated-form cases with exactly one glyph and zero shaping decisions involved -
    `isolated:ب` alone failed, which is the "the guard is broken, not the shaper" tell (nothing shapes a
    lone glyph wrong). Diagnosed rather than dismissed: shaped advance widths agreed with the browser's own
    `measureText` to five decimal places on every single case, so the divergence was pixels, not geometry.
    Measured the zero-shaping isolated-form diff across the whole 28-letter alphabet and found it ranges
    **0.63% (ا, one straight stroke) to 11.44% (ز, a thin curve plus a small dot)** - Arabic letterforms in
    this font vary far more in fine detail than Devanagari's or Latin's, so the Devanagari guard's method
    (one calibration glyph) landed on an unrepresentative pick (`م` at 5.45%, below the alphabet's own
    ceiling) and manufactured false failures across half the alphabet. Fixed by calibrating the noise floor
    against the **maximum** zero-shaping diff across the whole alphabet rather than one glyph - the same
    "assert a probe discriminates before trusting it" principle this codebase already applies elsewhere,
    adapted to what Arabic's letterform variance actually needs. **After the fix: 131/131 passing**, noise
    floor 12.91%, tolerance 19.37%. Proved the guard can still fail, not just pass by construction:
    sabotaged the reconstruction (reversed glyph draw order, the same sabotage Kalam's guard used) and got
    75/131 failing before reverting.
  - **Bidi findings on Arabic specifically (Bidi_Class AL, not R), checked because a bidi bug changes what
    a signed document says.** Calibration first caught a second, unrelated harness bug worth recording:
    an early right-anchored native-vs-reconstruction comparison showed 70-85% disagreement on pure single
    words, which turned out to be a stale `FontFace` registered on a page navigated away from since -
    "native" was silently measuring a system fallback font, not Almarai, the exact hazard CLAUDE.md's
    Layer-1-harness section warns about. With the font correctly loaded, mixed-content testing (both
    interactively against `resolveBidiRuns` directly and via a full native-Chromium `dir="rtl"` comparison)
    found **no AL-specific divergence**: `مرحبا 1250` (Western digits, EN), `مرحبا ١٢٥٠` (Arabic-Indic
    digits, AN - the specific case W2/W3 govern, since AN only exists after AL/AN context), `المبلغ
    1,250.50 ريال` (thousands separator, decimal point, trailing currency word) and `50% الخصم` (leading
    percent-prefixed number) all produced run structures bidi-js resolved identically in shape to the
    equivalent Hebrew strings - the AN digit run comes out un-reversed and correctly grouped with its
    trailing/leading neutral punctuation, same as EN. The one string that looked wrong on first read
    (`مرحبا أحمد 1250 ١٢٥٠ Ahmed` exports as `Ahmed ١٢٥٠ 1250 مرحبا أحمد` left to right, not the
    naively-expected `1250 ١٢٥٠ Ahmed أحمد مرحبا`) was checked against a plain native `<div dir="rtl">`
    and `<textarea dir="rtl">` with the identical string and no app code involved at all - **Chrome's own
    bidi resolution produces the identical order**, which means a by-hand UAX#9 derivation was the thing
    that was wrong, not the app; bidi is exactly hard enough by hand that this codebase delegates it to a
    certified library rather than re-deriving it, and this is a concrete instance of why.
  - **End-to-end verified in the real running app, not just the guard**: uploaded a fixture PDF to `/sign`,
    typed `مرحبا أحمد 1250 ١٢٥٠ Ahmed` (a lam-alef-hamza name, Western and Arabic-Indic digits, a Latin
    name) with the default Arimo selected, and confirmed the font picker showed the auto-substituted
    "Arabic (Almarai)" with no coverage-warning text on the page. Downloaded, and the exported PDF (decoded
    and rendered with `pdftoppm`) shows real, legible, correctly-joined vector text, in the exact visual
    order the native-browser bidi check above predicts - not rasterized, not corrupted, not refused, and
    `pdftotext` extracts it as real searchable text matching that same order.
  - **Dari/Pashto (Afghanistan, Perso-Arabic script) remain out of scope for this addition.** Almarai
    targets Modern Standard Arabic; the `SCRIPT_FALLBACKS` pattern deliberately excludes Arabic Supplement
    (U+0750-077F) and Arabic Extended, which carry the Persian/Urdu/Sindhi-only letterforms those languages
    need and this font was never built to draw - see the pattern's own comment in `fonts.js`. A Perso-
    Arabic addition would need its own font and its own verification run, not inherit this one.
- **Chinese (China; sizeable minority language in Singapore and Malaysia).** Not a shaping problem - it's
  a page-weight problem. A full-coverage CJK font is routinely 5-20MB unsubsetted, against a per-page
  budget (`check-page-weight.js`) built around a handful of Latin/Hebrew TTFs. **This paragraph used to
  say the export ran with `subset: false` and that turning subsetting on would silently corrupt shaped
  glyph runs, so "just subset the font" wasn't a quick fix. That is now out of date: subsetting shipped
  2026-08-27** (see the correction below and `src/lib/sign.js`/`src/editor/registry/text.ts`), so
  a bundled CJK font's runs would subset correctly on export like everything else does. What is still
  true, and still the actual blocker, is the page-weight one: even subsetted-at-export, a full Noto Sans
  JP/SC/KR file still has to be *fetched* in full before that per-download subsetting can run, and 5-20MB
  fetched on pick is not something this app's page-weight budget or lazy-load pattern is built for -
  hence still recommending a build-time pre-subset below.

  **Measured 2026-08-25, and the conclusion is "build-time subsetting, not runtime" - read this before
  starting CJK.** A spike tried to lift the `subset: false` coupling by having `drawShapedRun` drive
  `CustomFontSubsetEmbedder`'s own private `subset.includeGlyph()`/`glyphIdMap` machinery per glyph (it
  bypasses `encodeText`, which is the only thing that normally calls `includeGlyph`, because it needs each
  glyph's own shaped position). **That approach was reverted, and the `assertNotSubsetEmbedded` guard put
  back**, because the runtime subsetter in the pinned `@pdf-lib/fontkit@1.1.1` (a frozen 2020 fork) is
  broken for exactly the fonts CJK needs:
  - **Arimo** (TrueType `glyf`, static, Latin) subsets **correctly**: 284,925 -> 5,612 bytes, `pdftotext`
    identical, `pdftoppm` renders byte-identical PNGs (same MD5). This is the result that made the
    approach look viable, and it does not generalise.
  - **Noto Sans JP OTF** (CFF outlines, so `Font.createSubset()` returns `CFFSubset`, a completely
    different code path from Arimo's `TTFSubset`) produces a font file poppler rejects: `Syntax Error:
    Embedded font file may be invalid`, `Couldn't create a font for 'NotoSansJP-Regular-...'`,
    `non-embedded font using identity encoding`.
  - **Noto Sans JP variable TTF** (`glyf` + `gvar`/`fvar`; Google Fonts ships only the variable build now)
    subsets to **visibly broken output** - most glyphs dropped from the page entirely, only a few
    rendering.
  - **The CFF case nearly passed as a false positive, which is the part worth remembering.** `pdftotext`
    extracted the correct string and the rendered PNGs looked right - because poppler had silently
    substituted a *system* Japanese font after rejecting the embedded one. Only `pdftoppm`'s stderr
    revealed it. This is the same shape of meaningless-green-probe failure as the stale `FontFace` in the
    Arabic guard and the 0x0 jsdom rects (H8): **for any CJK verification, treat `pdftoppm`/`pdftotext`
    stderr as a failure signal, not just the extracted text or a pixel diff.**

  **Recommended approach when this is picked up: pre-subset at build time with `pyftsubset` (fonttools)
  and ship a static TTF.** *(Superseded in part - see the "Correction 2026-08-27" below: the runtime
  subsetter is not broken, `subset: false` no longer stays, and the reason to still pre-subset at build
  time is page weight on fetch, not this.)* The character set is principled rather than arbitrary:
  jōyō kanji (2,136, the standard taught set) + jinmeiyō kanji (863, the set *legally permitted in
  Japanese personal names*, which is precisely what a form-filling tool needs) + kana + punctuation +
  Latin/digits, so roughly 3,200 of Noto Sans JP's 17,936 glyphs, estimated 800KB-1.5MB, lazy-loaded only
  when that font is picked (Kalam already ships at 427KB for comparison). Anything outside the shipped
  subset hits the existing while-typing "no bundled font can draw this" notice, which is the designed
  behaviour rather than a new failure mode. **Chinese, Japanese and Korean need three separate fonts** -
  Han unification means they share codepoints but render regionally different glyph shapes, so one file
  cannot honestly serve all three. Noto Sans JP/SC/KR are all SIL OFL 1.1 (license verified in hand from
  the `notofonts/noto-cjk` release and the `google/fonts` OFL repo).

  Two alternatives considered and not recommended: swapping to upstream `foliojs/fontkit@2.x` (likely
  fixes the subsetter, but TODO.md already records it is not a drop-in - `@cantoo/pdf-lib`'s embedder
  reaches into `@pdf-lib/fontkit`-specific internals - so it is an engine swap, a much bigger project);
  and hunting for a font whose *runtime* subsetting happens to work (unbounded search, and the result
  would rest on private-API reflection that breaks silently on any pdf-lib upgrade).

  **Correction 2026-08-27: the diagnosis above was wrong, and runtime subsetting has since shipped -
  read this before trusting the "broken for exactly the fonts CJK needs" framing above.** The 2026-08-25
  spike was picked back up once W1's export render guard existed to tell correct output from plausible
  output, which is exactly what this entry itself says was missing at the time ("there was no way to
  tell correct output from plausible output"). It ran, and found the earlier diagnosis was a
  generalisation from one font, not a property of CFF or of variable builds:
  - **What actually breaks fontkit's TTF subsetter is a `glyf` table whose outlines are not 2-byte
    aligned**, full stop - not outline format, not static-vs-variable. It reads each outline at the
    offset `loca` gives it, so one odd-length glyph misaligns the read of everything after it.
  - Of the 38 bundled fonts, only **Kalam Regular and Bold** were affected: `.notdef` was 51 bytes (odd),
    so 528 of 1,028 `loca` offsets were odd and 40/40 sampled glyphs came back corrupt. The other 36
    files, including every other `glyf`-outline font in the catalogue, were clean.
  - **Outline format does not predict this.** Arimo, Tinos, Cousine, PT Sans and Caveat-Bold share
    Kalam's `indexToLocFormat` and are all fine - so "Arimo subsets correctly and does not generalise"
    was true, but the reason given for why it didn't generalise (CFF vs `glyf`, static vs variable) was
    itself the wrong axis.
  - Fix: repad with fontTools (`font['glyf'].padding = 4`). All 1,027 Kalam outlines, its metrics and its
    cmap are byte-identical after repadding, which is the proof nothing visual changed - and the W1
    export render guard (closed 2026-08-27, see "Stage 1" in the design doc) returned to 0 drifted cases
    against its untouched baseline, having caught this as exactly one drifted case out of 21
    (`devanagari-kalam`, 26.10% against a 12.50% tolerance) on its first real run. **This is the
    concrete answer to "there was no way to tell correct output from plausible output": there is now.**
  - `scripts/check-font-glyf-alignment.js` (`npm run test:fonts`, wired into CI) fails the build on any
    unaligned bundled font, so this class of corruption cannot silently ship again.
  - **Subsetting now ships.** `src/lib/sign.js` embeds with `{ subset: true }`; `remapGlyphForSubset` in
    `src/editor/registry/text.ts` does the subset embedder's own bookkeeping (`includeGlyph`, `glyphs`,
    `glyphIdMap`, `glyphCache.invalidate()`) per shaped glyph, since `drawShapedRun` bypasses `encodeText`
    to keep each glyph's shaped position and must therefore replicate what `encodeText` would have done.
    It throws rather than falling back if a pdf-lib upgrade renames those private fields - the exact
    failure mode this whole guard chain exists to make impossible is a raw id silently drawing the wrong
    glyph against a subsetted font. A signed PDF with one Arimo text box went from 279 KB to 5.7 KB; Arimo
    + Heebo + Pacifico from 348 KB to 11 KB.
  - The same misalignment defect was then found and fixed in the CJK spike's own Noto Sans JP subsets
    (1,788 and 1,832 odd `loca` offsets across the weights checked), where it reduced 郎 in 山田太郎 to
    an empty glyph - a name silently losing a character, and the same shape of bug `docs/
    wysiwyg-text-architecture.md` independently found while correcting its own version of this same
    diagnosis. Repadded the same way; unaffected otherwise (the advance-parity guard is unchanged at
    3,600 cases per weight, worst delta 0.000134px).
  - **What survives for CJK, and what changes:** the recommendation above (pre-subset at build time with
    `pyftsubset`) still stands, but not because the runtime subsetter is broken - it works, once the font
    handed to it is aligned. It stands because a full-coverage CJK face is still 5-20MB and this tool
    still only needs the few thousand glyphs a Japanese name uses, and the two now *compose*: a
    build-time subset that passes the alignment guard gets subsetted again at export, down to roughly
    900 bytes for four kanji. Re-verify any pre-subset TTF against `check-font-glyf-alignment.js` before
    shipping it - `pyftsubset` output is exactly the kind of generated file this guard exists to catch.
  - Also worth recording: the CJK spike's stated merge blocker at the time (the precache manifest pushing
    ~1.27MB gzipped of fonts at every visitor) no longer applies - fonts are no longer precached at all
    (see the "Stop precaching 8.42 MB of fonts nobody asked for" commit), independent of this fix.
  - `docs/wysiwyg-text-architecture.md` made the same category error in the opposite direction (blamed
    "glyf-only, non-variable" as disproving TODO's CFF/variable claim, which was also incomplete) and has
    been corrected there too. Both documents generalised from a sample of one font; neither named
    alignment. Worth remembering next time a runtime library "is broken for" some class of input based on
    one example: check whether the input itself is malformed before blaming the class.

Five font additions have landed: **Alef** (Hebrew), **PT Sans** (Ukrainian/Cyrillic), **Mali** (Thai
handwriting), **Kalam** (Devanagari/Hindi handwriting), and **Almarai** (Arabic) - each went through the
same license/`calt`/glyph-coverage/parity checks, and Kalam and Almarai additionally needed (and got)
their own enumerated-corpus correctness guard before landing, since Devanagari's reordering/
conjunct-formation questions and Arabic's joining/ligature questions have no Hebrew equivalent to reuse.
Both scripts' apparent structural blockers turned out to be the cheap kind: Devanagari's was fontkit's
Indic shaper crashing on a missing polyfill, Arabic's was nobody having tried fontkit's already-ported
`ArabicShaper` state machine. Perso-Arabic (Dari/Pashto) and Chinese/Japanese/Korean/emoji remain open -
see "Open follow-ups, 2026-08-25" below for what's actually left on each.

**The support is now said out loud on the Sign page.** Fixing the fallback only helps someone who
already trusted the tool enough to type in their language and hit Download; the analytics say a large
share of visitors come from Israel, India, Ukraine, the Philippines, Malaysia, the UAE, Jordan,
Afghanistan and China, and nothing above the fold told any of them whether their script would survive.
So `tool.languages` in `src/data/tools.js` now drives `ToolLanguagesCard.astro`, rendered by
`ToolPageLayout.astro` directly below the tool and above "How it works" - the first card on the page,
because "will my language come out right" decides whether the rest of it matters. Sign is the only tool
that declares it (it is the only one where you type your own text into the file).

Two things about it are deliberate. **Half the card is the "not yet" half**: Arabic, Perso-Arabic, CJK,
emoji and India's non-Devanagari scripts are named, with why and what the tool does instead (a notice
while typing, not a refusal at Download), and there is a matching FAQ entry so the FAQPage schema says
it too. Naming the gap is what makes the other half believable, and those are real visitors, not a
hypothetical. And **the native names render in the visitor's own system font**, not the bundled TTF for
that script - Kalam alone is 427KB, and half a megabyte of webfont so a card can show one word would tax
every visitor to prove a point to a few. Every claim on the card is backed by `SCRIPT_FALLBACKS` and
checked against the real font bytes by `fontCoverage.test.js`; the two per-font claims that were *not*
(full Greek coverage, full Latin Extended in the handwriting faces) were measured and reworded rather
than shipped, since the handwriting faces genuinely have no ł, š, ă or ż.

**Open follow-ups from the fallback work:**

- **An upright Devanagari and Thai text face.** Both scripts have exactly one bundled face and both are
  handwriting, so an upright font (Tinos, say) resolves to a handwritten one for the whole element.
  That is still far better than a wall, and the notice explains it, but it is the one visibly awkward
  outcome the fallback can produce. Each candidate needs its own full verification run per the
  catalogue-is-ours-to-curate rule - for Devanagari that means re-running the 185-case shaping guard.
- **The save-time refusal replaces the whole editor view** (`status === 'error'` in `PdfWorkspace.tsx`
  renders instead of the pages, not beside them), so a refused download hides the document the user was
  working on until they act. Pre-existing, and much rarer now that the same problem is surfaced while
  typing, but it is the wrong shape for a recoverable error. Noticed while verifying this work; not
  changed here because it is a separate UX decision.
- **A newly created text element inherits `lastDirection`**, so a box created right after typing Arabic
  starts RTL even when the next thing typed is Cyrillic or Latin. Pre-existing and unrelated to fonts;
  recorded because it was visible during this verification and looks like a bug from the outside.
- **Almarai may already cover Farsi and Urdu's extra letters, unverified.** Checked in passing while
  choosing the Arabic pattern's block boundaries: Persian's four extra letters (پ چ ژ گ) and five common
  Urdu-specific letters (ٹ ڈ ڑ ں ے) all sit inside the *main* Arabic block (U+0600-06FF), not the excluded
  Arabic Supplement, so Almarai already has real glyphs for them (`hasGlyphForCodePoint` confirmed all
  nine), Extended Arabic-Indic (Farsi) digits ۰-۹ are fully covered too, and a spot check of `پ` in
  isolated/initial/medial/final position shapes to four distinct, correct positional glyphs the same way
  the Arabic corpus's letters do - because Unicode's joining classes, which fontkit's `ArabicShaper` reads
  from real `ArabicShaping.txt` data, don't distinguish "Arabic" from "Persian" letters, only joining
  behavior. This means basic Farsi/Urdu text may already resolve to Almarai and export correctly today,
  entirely as a side effect - the `SCRIPT_FALLBACKS` Arabic pattern makes no script distinction within the
  main block. **Not claimed anywhere and not landed as a feature**, because it has none of what actually
  shipping Arabic needed: no corpus, no bidi check against Farsi/Urdu content (Persian in particular mixes
  its own digit block with Arabic text in ways worth checking, not assumed from the Arabic case), no
  probe in `fontCoverage.test.js`. Pashto remains genuinely blocked - a direct check found Almarai missing
  8 of 9 Pashto-specific letters (ټ ډ ړ ږ ښ ګ ڼ ې). Worth a real follow-up given how cheap the remaining
  work looks; not proposed as shipped until it clears the same bar Arabic did.

**Open follow-ups, 2026-08-25: making the next font additions cheaper, and what's next.** Prompted by the
Sign page's own "Coming soon" copy (`tool.languages.notYet` in `src/data/tools.js`) turning into a real
action list rather than staying prose. Split into infrastructure (do once, benefits every future addition)
and content (the actual next scripts/fonts), because conflating them is how "add Bengali" quietly becomes
"design a corpus-guard framework and add Bengali."

*Infrastructure:*

- ~~**Shared shaping-guard test harness.**~~ **Landed 2026-08-25.** `devanagari-shaping-guard.spec.js` and
  `arabic-shaping-guard.spec.js` were ~265 lines each and ~90% identical: the esbuild fontkit bundling, the
  canvas pixel-diff-against-native-rendering method, and the "calibrate a noise floor from a measured
  maximum, never pick a tolerance in advance" discipline were copy-pasted between them, differing only in
  font file, LTR-vs-RTL anchoring, and the corpus/calibration data. Extracted into
  `e2e/sign/fixtures/shapingGuardHarness.js` (`buildFontkitBundle`/`removeFontkitBundle` for the node side,
  `runShapingGuardInPage` for the in-browser shape/reconstruct/pixel-diff work, `createShapingGuardTest` to
  wire a `test.describe` block from a config object). Both existing specs now reduce to ~90 lines of
  config plus their own script-specific reasoning (kept in full - the calibration-set stories, the RTL
  anchoring calibration bug, the sabotage-testing notes are all still there, just no longer copy-pasted
  alongside the mechanics that don't change). Verified as a non-regression, not assumed: both specs rerun
  against the real built site and passed at their original counts, **185/185 Devanagari, 131/131 Arabic**,
  0 failing either way. A third script's guard is now "write a corpus file + pick a calibration set +
  supply geometry," not "write another 265-line Playwright file by hand."
- **Corpus-builder helpers.** `devanagariCorpus.js` and `arabicCorpus.js` each hand-roll their own
  cross-product/grouping bookkeeping (`CONSONANTS.flatMap(...)`, `{id, text}` shaping) even though the
  *pattern* - "every base crossed with every mark," "every letter in each of its positional forms," "a
  curated word list" - repeats. A small `e2e/sign/fixtures/corpusHelpers.js` (`crossProduct(bases, marks,
  idFn)`, `positionalForms(letters, joiner)`, `wordList(entries)`) would remove that bookkeeping from the
  next corpus file. **Does not remove the actual work**: the linguistic rules (which conjuncts, which
  reordering axes, which positional forms) still have to come from someone who knows the script, the same
  way Devanagari's pre-base-vowel/reph/subjoined-RA axes and Arabic's joining/ligature/diacritic axes did.
- **A cheap pre-screen script for font candidates**, before spending guard-level effort on one.
  `scripts/screen-font-candidate.mjs <ttf-path> <unicode-range>` reporting: license file presence next to
  the font, whether the font's GSUB table carries `calt` (today this is eyeballed by hand - it's exactly
  the feature that got Playpen Sans Hebrew dropped from the catalogue, see `fonts.js`'s `RETIRED_FONTS`
  comment), and full-vs-partial character-set coverage of the target block (`fontkit.create(bytes)
  .characterSet`, the same primitive `fontCoverage.test.js` already uses). Lets 3-4 candidates be triaged
  in seconds so only real contenders reach the expensive parity-guard stage - Almarai's addition alone
  evaluated six named candidates (Noto Naskh Arabic, Amiri, Cairo, Almarai, Lateef, Scheherazade New) by
  hand before picking one.
- **Verify `FONT_VERTICAL_METRICS` against real font bytes, not just transcribe it by hand.**
  `fonts.js`'s `FONT_VERTICAL_METRICS` table (ascent/descent per family, used by `textBoxPaddingEm` to keep
  a text box from clipping ascenders/descenders) is hand-read from each TTF's `hhea` table and hardcoded.
  `fontCoverage.test.js` already re-derives glyph coverage from real bytes and fails the build on drift;
  add the same discipline here - a case that reads real ascent/descent via fontkit for every bundled family
  and asserts it matches the hardcoded table, so a stale or typo'd entry fails loudly the moment a font file
  changes instead of silently clipping text forever.
- **Fold the above into one "adding a font" checklist** in `docs/hebrew-text-shaping-export.md`, so the
  next addition follows a written list (screen candidates -> verify metrics -> write/extend a corpus with
  the helpers -> run the guard via the shared harness -> update `SCRIPT_FALLBACKS` + `fontCoverage.test.js`
  probes + `tool.languages` copy + FAQ) instead of re-deriving the Kalam/Almarai process from TODO.md prose
  each time.

*Content - the next scripts, roughly by how much of the above they actually need:*

- ~~**Dari (Afghanistan, Persian/Farsi script).**~~ **Landed 2026-08-25.** The groundwork was already done
  and unclaimed (see the Almarai Farsi/Urdu finding above): Persian's extra letters (پ چ ژ گ) sit inside
  Almarai's covered main Arabic block, `hasGlyphForCodePoint` had confirmed real glyphs for all of them,
  and positional shaping was spot-checked correctly. What was missing has now landed:
  - **`fontCoverage.test.js`** gained a dedicated describe block verifying Almarai's real glyph coverage for
    all four Persian-specific letters and the full Extended Arabic-Indic (Persian) digit block ۰-۹, checked
    against real font bytes rather than left as an unverified aside from the earlier finding.
  - **`arabicCorpus.js`'s guard now covers Persian too**, not a separate guard file - one font, one shaper,
    so `persianPositionalFormsCases`/`persianNonJoiningFormsCases`/`persianRealisticCases` were added into
    `ARABIC_CORPUS` directly. Joining behaviour was verified against the real font before writing the corpus
    (the same discipline the Arabic corpus itself used): `پ`/`چ`/`گ` each shape to four distinct glyphs
    (dual-joining, like their Arabic base letters ب/ج/ک), `ژ` shapes to only two (right-joining/non-joining,
    like its base ز). Extended corpus run through the shared harness (the extraction two items up): **151/151
    passing** (131 original Arabic + 20 new Persian cases), 0 failing, same tolerance the Arabic-only run
    used.
  - **The bidi question was measured, not assumed - and the assumption would have been wrong to make.**
    Persian's own digit block (۰-۹) is Unicode Bidi_Class **EN**, not **AN** like Arabic's own digit block
    (٠-٩) - genuinely different starting classification. Ran real Dari strings (a date, an amount, a
    trailing Latin name) through `resolveBidiRuns` before writing any assertion: UAX#9 rule W2 reclassifies
    an EN digit run to AN when the nearest preceding strong character is AL (which Dari text always is
    here), so the digit run still comes out grouped and un-reversed exactly like Arabic's own AN digits -
    but that is bidi-js's real resolution, not a hand-derived certainty. Added as permanent regression cases
    in `bidiRuns.test.js` rather than left as a one-off check.
  - **Sign page copy updated**: Dari/Farsi moved from `notYet` into `languages.supported` in
    `src/data/tools.js`, with a new FAQ entry, and the "not yet" FAQ reworded to drop Dari and keep Pashto/
    CJK/emoji. Verified against the real built HTML and JSON-LD (`npm run build`), not just the source
    file - both render the new copy correctly, including the Persian-letter and digit strings.
  - **Full verification pass**: `npm test` (856/856), `npm run test:seo`, `npm run test:css`, `npm run
    test:weight`, `npm run test:csp`, and the full `e2e/sign/` Playwright suite (39/39) all pass.
  - **Pashto is still not covered by any of this** - see below, it needs its own font.
- **Pashto (Afghanistan) remains genuinely blocked on Almarai** - a direct check found it missing 8 of 9
  Pashto-specific letters (ټ ډ ړ ږ ښ ګ ڼ ې). Needs its own font search (screened per the pre-screen script
  above once it exists) covering Arabic Extended-A, then its own full verification run - it does not inherit
  Almarai's or Dari's.
  **Correction 2026-08-28:** the count was low. Re-measured against `src/lib/fontCoverageTable.js` (the
  generated table, so all 46 bundled files rather than a spot check), Pashto is missing **eleven**
  letters, not eight: the list above plus ځ U+0681, څ U+0685 and ۍ U+06CD, and each of the eleven is
  absent from *every* bundled file, not only Almarai. The conclusion stands and gets stronger. The live
  entry is under "Internationalization" above, which also raises the question this one does not: whether
  one Arabic face could replace Almarai and serve Arabic, Dari/Farsi, Pashto and Urdu together.
- **Bengali, Tamil, Telugu** (the three named in the Sign page's own "Coming soon" copy) **and Gujarati,
  Punjabi** (flagged as untouched during the Devanagari spike but not currently promised anywhere). Each is
  its own complex script with its own reordering/conjunct/joining rules - the corpus-builder helpers above
  remove the bookkeeping, not the linguistics, so each is still a real project: pick and screen a candidate
  font, work out that script's actual shaping axes (a Bengali speaker or reference grammar, not a guess),
  build its corpus, run it through the shared harness, verify vertical metrics, update the catalogue and the
  Sign page copy. Priced at roughly what Devanagari cost before the harness extraction, minus the ~265 lines
  of Playwright boilerplate each no longer has to write by hand.
- **A second font choice for scripts that already work, no guard needed.** Non-reordering scripts (Hebrew,
  Cyrillic, Greek, Thai, every Latin-script language) only need `fontCoverage.test.js`'s coverage checks plus
  Guard A/B parity, the bar Alef/PT Sans/Mali cleared without a corpus guard. Concrete candidates worth
  screening: Sriracha for a second Thai handwriting option (already recorded above as a same-day,
  `calt`-free runner-up to Mali, not yet parity-tested); a second Ukrainian/Cyrillic face; a second Hebrew
  handwriting option; a couple more Latin handwriting styles. Lower priority than the scripts above - these
  add choice to something that already works, rather than closing a "not yet" gap.
- **Chinese, Japanese and Korean: all four families are live.** Japanese shipped 2026-08-27/28
  (commits `988667c`..`527a2d4`); Simplified Chinese, Traditional Chinese and Korean were wired in the
  same shape 2026-08-28, closing the "built and dormant" gap this entry used to describe.
  - **All four are live.** `Noto Sans JP`, `Noto Sans SC`, `Noto Sans TC` and `Noto Sans KR` are in
    `TEXT_FONTS`, `SANS_STYLE_FONTS`, `FONT_VERTICAL_METRICS`, `editorFonts.css`'s `@font-face` rules
    and `FontPickerMenu.tsx`'s `STANDARD_FONTS`. A user can pick any of them and download with it today.
  - **The five-edits wiring measured true for all three at once**, and the numbers came out identical to
    Japanese's: `FONT_VERTICAL_METRICS` for SC/TC/KR is 1.160/0.288 across every weight, measured via
    `@pdf-lib/fontkit` rather than assumed - all four Noto CJK regional families share one vertical-metrics
    design, so this was a real check that happened to confirm a guess, not a guess left unchecked.
  - **Korean got the precise "full" treatment Devanagari/Thai/Bengali get, not Japanese's prose-only
    one.** `scripts/font-languages.mjs` now has a `korean` row (the full modern Hangul syllable block,
    U+AC00-U+D7A3, all 11,172 precomposed syllables, plus compatibility jamo) because Hangul, unlike Han,
    is a genuinely closed contiguous set - `LANGUAGE_COVERAGE.korean.full` is `['Noto Sans KR']`, a
    measured claim, not a curated-subset one. Chinese stays prose-only in the Sign languages card, the
    same way Japanese kanji is, for the same reason: Han has no compact alphabet to check against.
    Measured directly against the font bytes instead: Noto Sans SC covers ~7,945 Han characters, Noto
    Sans TC ~11,147 - real curated subsets, not all of Unicode's ~97,000 Han codepoints.
  - **Han unification did not go away, it became opt-in.** `fonts.js`'s `CATALOGUE` array is the
    tiebreaker `resolveFontSubstitution` uses when more than one family covers a piece of text, and Noto
    Sans JP/SC/TC share thousands of Han codepoints. JP sits first in that array (it shipped first), so
    typed Chinese resolves to Japanese letterforms by default unless the user explicitly picks Simplified
    or Traditional Chinese from the font picker - there is no signal in the text itself that says which
    region is meant, so explicit selection is the only correct fix, not a ranking change. Documented in
    `fonts.js`'s `CATALOGUE` comment and disclosed in the Sign languages card's Chinese entry and its FAQ
    answer, the same way the Urdu/Nastaliq caveat is disclosed rather than hidden.
  - **Test fixtures that relied on "Chinese/CJK is universally undrawable" had to move to emoji.** Several
    unit tests (`fonts.test.js`, `textCoverage.test.js`, `sign.test.js`, `liveFontCoverage.test.js`) used
    Chinese or Korean text as their "nothing can draw this" case; wiring SC/TC/KR in made those assertions
    false the same way `988667c`'s own Japanese fixture went stale. Emoji is the fixture now, since it is
    not a subsetting problem this work touches (see the Emoji entry below).
  - **Still open:** the export-render-corpus gap below has no SC/TC/KR case yet (Japanese and Bengali do);
    the font-registry-debt entry's "worth doing before wiring SC/TC/KR" note applies in hindsight rather
    than having been done first - three more families landed via the checklist, not the one-manifest fix.

- **The export render guard's cross-platform tolerance was calibrated by proxy, and the real number is
  higher. The guard is red on a macOS dev machine at HEAD, and was before any of this work.**
  `exportRenderHarness.js` sets `MIN_TOLERANCE_PCT = 12.5` to absorb rendering noise *between machines*,
  and its own header is honest that the figure was never measured: the baseline is captured on Linux CI,
  developers run macOS, "there is no Docker on this project's dev machine, so the real number was not
  available", and same-machine render-scale and sub-pixel perturbations stood in for it instead.
  Measured 2026-08-28, by accident, while adding the Japanese and Bengali cases: running the guard on
  macOS against HEAD's Linux baseline, **with no local changes at all**, fails on two cases -
  `latin-caveat` at 13.68% and `latin-great-vibes` at 17.61%, against a 12.50% tolerance. Every case
  differs by 6.7% to 17.6%. The determinism noise floor is 0.00%, so this is not run flakiness: two
  captures in the same run were pixel-identical. It is a real, reproducible macOS-vs-Linux gap, and the
  two cases that exceed the floor are both thin, loopy handwriting faces - the most hinting-sensitive
  things in the catalogue, and the two `fonts.js` already flags as needing the most vertical slack.
  `thai-mali` is a near miss at 12.195%, inside the tolerance by three hundredths of a percent.
  **What this means, and what it does not.** It does not mean the guard is wrong; the guard is doing
  exactly what it was built to do, and it caught a divergence its own author predicted it could not
  measure. It does mean the guard is **effectively CI-only today**: a developer who runs it locally sees
  two red cases that are not regressions, which is the fastest way to teach a team to ignore a red guard.
  **Do not fix this by raising `MIN_TOLERANCE_PCT` to fit.** 17.61% is one sample from one machine pair,
  and the harness's own non-vacuity property needs the closest distinct pair to stay above
  `2 x tolerance`; that pair is currently 31.65%, so a tolerance above ~15.8% starts eating the property
  that makes the guard meaningful at all. The honest options are to measure the real floor across both
  platforms and re-derive the constant from it, or to make the guard skip (not fail) off-CI with a
  message saying why. Either beats a number that reads as validated when it was not, which is a hazard
  the harness header already warns about in a different context.

- **Adding a font is a checklist, not a registry, and the last-mile steps were the unguarded ones.**
  Part II §3 of CLAUDE.md requires a registry for element types ("adding a type touches only new
  files"), and `boxResize.ts` even has a CI-enforced single owner. Fonts never got that treatment.
  Adding one means parallel edits in `fonts.js` (`TEXT_FONTS`, `SANS_STYLE_FONTS`,
  `FONT_VERTICAL_METRICS`), `editorFonts.css`, `FontPickerMenu.tsx`, `scripts/font-languages.mjs` and
  the Sign card copy in `tools.js`, plus two regenerated files and an e2e guard.
  **The compensating design is a guard per step rather than a registry**, which is defensible - the
  data genuinely lives in CSS, in JS and in generated tables, and no single format holds all of it.
  What was wrong was that the guard set had holes, and both holes were *last mile*: the steps between
  "the font works" and "a user can reach it correctly". Both are closed now (`FontPickerMenu.test.tsx`
  checks the picker against the catalogue in both directions; `fonts.test.js` checks `editorFonts.css`
  against the exporter's own filename derivation).

- **The deeper version: the editor and the exporter bind family name to file by two independent routes.**
  The editor goes through CSS (`font-family` -> an `@font-face` rule -> a `url()`); the exporter never
  reads CSS at all (`loadCustomFont` in `sign.js` strips the spaces from the family string, appends a
  weight/style suffix, and fetches that). Neither derives from the other, and the filename convention is
  restated in five places: `loadCustomFont`, `requestedFontFile`, the `fontCoverageTable` keys, the
  `url()`s in `editorFonts.css`, and the generator scripts.
  **Measured, not theorised:** deleting both `@font-face` rules for a shipped, selectable font left the
  entire unit suite green. The download stays correct and the editor silently falls back to whatever the
  browser substitutes, which is precisely the screen/export divergence the whole module exists to
  prevent, arriving through the one step that had no guard.
  That is now ratcheted rather than fixed. **The structural fix is one manifest** of
  `family -> { file per weight/style }` that `editorFonts.css` is generated from and `loadCustomFont`
  reads, collapsing four of the edits above into one and giving the convention a single owner the way
  box resize has one. Not urgent while the ratchets hold. Worth doing around the next two or three
  fonts, and worth doing *before* any attempt to wire SC/TC/KR, since that is three families times five
  steps.

- **The export render guard has no CJK case, and its own rules say it should.**
  `e2e/sign/fixtures/exportRenderCorpus.js` states that it carries "one case per shipped script", and it
  does for Latin, Hebrew, Arabic, Devanagari, Thai, Cyrillic and Greek. Japanese has been a shipped,
  selectable script since `bebc24b` and has no case, so the one guard that rasterises what the user
  actually receives has never looked at it.
  **This is a smaller gap than it first sounds, and worth stating why so it is not over-fixed.**
  `cjk-advance-parity-guard.spec.js` is a deliberate substitute, not an oversight: it argues that the
  failure mode a pixel diff exists to catch (a shaper picking the *wrong glyph* through reordering or
  joining) has no CJK analogue, and it closes that off independently by asserting
  `glyphs.length === [...text].length` on every case, over each family's whole shipped cmap, so a
  substitution firing is a failure rather than an assumption. It also proved it can fail, on the
  pre-GPOS-drop JP build. What it does not do is look at ink, which is what catches a corrupted `glyf`
  or a subset missing composite components - exactly the failure class that `988667c` found in the
  spike's own JP subsets.
  **Done 2026-08-28**, as one corpus case each rather than a second shaping harness:
  `japanese-noto-sans-jp` (佐藤さくら, kanji surname plus hiragana given name, every character inside the
  joyo/jinmeiyo subset so `signPdf` does not refuse) and `bengali-noto-sans-bengali` (প্রিয়া, carrying a
  ra-phala conjunct and a pre-base vowel sign, and deliberately avoiding the three clusters `f8778b0`
  named as known fontkit/Chromium divergences - baselining a known-divergent cluster would enshrine it as
  correct).
  **Still open, and now actionable rather than hypothetical: Simplified Chinese, Traditional Chinese and
  Korean were wired in 2026-08-28 (see the "Chinese, Japanese and Korean" entry above) and still have no
  corpus case.** Add `chinese-simplified-noto-sans-sc` / `chinese-traditional-noto-sans-tc` /
  `korean-noto-sans-kr` in the same shape as the two above - a real word or short phrase inside each
  font's measured coverage (SC ~7,945 Han characters, TC ~11,147, KR full Hangul, see `fonts.js`'s
  `FONT_VERTICAL_METRICS` comment) - once a CI baseline capture is available (see the next entry: this
  needs to run on Linux CI, not locally, the same requirement that applied to the JP/Bengali cases above).
  **The baseline entries for both were captured on macOS and every other entry in that file is from
  Linux CI (`79eb235`), so regenerate on CI before trusting a green run** - see the next entry, which is
  what this work turned up and is the more important finding.

- **Emoji** is not a subsetting problem and should not be bundled into the CJK work. Colour emoji fonts
  use `COLR`/`CBDT` bitmap or layered-glyph formats, which pdf-lib's outline-glyph embedder has no path
  for at all - so this is a different question (probably: draw emoji as embedded images rather than font
  glyphs, which the codebase already knows how to do for signature images) and deserves its own
  evaluation rather than inheriting CJK's answer. Not yet investigated.

---

## Migration status: structurally complete

The maintainability migration (epics E0-E4, plus E7/E8 hardening) is done. Verified against the code
rather than the ticket list:

| Epic | | Outcome |
|---|---|---|
| E0 | Stabilize | 2/2 |
| E1 | Guardrails | 9/9 |
| E2 | Kill the global CSS monolith | 6/6 |
| E3 | Tailwind on the static surface | 8/8 |
| E4 | Headless TS editor core | 5/5 |
| E5 | Documentation | 3/3 |
| E6 | Carried-over launch backlog | 8/11 |
| E7 | Finish the headless convergence | 7/8 (E7.3 optional) |
| E8 | Post-assessment cleanup | 20/21 |
| E9 | Offline-first app shell | 1/1 |

**Ground-truth evidence, not ticket status:**

- `global.css` is 430 lines, and its only class selector is `.sr-only` (a legitimate global a11y
  utility). Everything else is `@theme`/`:root` tokens, `@font-face`, and four element rules. That is
  the "tokens as the only global CSS" target, reached. 22 CSS Modules carry what the monolith did.
- `git grep` for the resize anchor-cap fingerprint returns exactly one file,
  `src/editor/registry/boxResize.ts`.
- The registry covers all 9 element types with `{ create, render, resizeBehavior, serialize, schema }`.
- `src/editor` is 28 TypeScript files to 0 JavaScript, and `src/components` is 77 TypeScript files
  (50 source + 27 test) to 0 JavaScript/JSX.
- All guards green: CSP hashes, SEO invariants, class resolution, editor-CSS ratchet, CSS duplication,
  page weight (40,510 / 48,000 bytes brotli on the worst page), gesture golden rule, typecheck, and e2e.

## Landed structural wins: do not reopen these

Two independent architecture audits (2026-07-11) agreed these are settled. Reopening any is a
regression, not a refactor:

- **The gesture golden rule is structural, not conventional.** One `editor/gestures/controller.ts`,
  `finished`-guarded single commit, a pure `computePatch`, a painting `writeDOM`, and all six
  Sign+Redact call sites routed through it. Proven by integration test and by
  `scripts/check-gesture-golden-rule.js`, which scans every `computePatch` body.
- **The shape-resize math has exactly one owner:** `boxResize.ts`, per-handle anchor caps, CI-enforced.
- **Sign and Redact key on one flat `type` discriminant** with per-type registry modules. The legacy
  `style` field and the `type:'whiteout'` shim are gone.

---

## Decisions and rejected approaches

**The CSS-Modules branch was re-implemented, not merged.** The work lived on
`claude/e2.2-css-modules-wave-a` while `main` advanced ~13 commits, including native sharing wired into
every tool. A trial `git merge main` was run in a throwaway worktree and **rejected**: `main` had
restructured `PdfRedactTool.jsx` so heavily that a "keep both" merge produced a Frankenstein file, with
the branch's old inline success block merged *alongside* main's new structure and orphaned
download/start-over UI left behind. The durable artifacts (the new `.module.css` files, the `global.css`
deletions) were reused verbatim; the per-`.jsx` class swaps were redone on top of `main` (`a825e33`).
**Do not resurrect the branch-merge approach.**

**The Tailwind migration is deliberately partial.** Utilities own the static/SEO `.astro` surface; CSS
Modules own the editor. This was never "finish the wholesale Tailwind migration" - the goal was to kill
the global monolith by scoping styles, not to Tailwind-ify the editor.

**The CSS byte cap was retired rather than re-tightened.** It was scaffolding for a migration that
finished, and it watched the wrong half of the page: on `/sign/`, first load is ~12.7KB of CSS against
~16KB of eagerly-referenced JS. CSS is the smaller, more compressible, more inert half; JS is the half
that regresses violently and silently when one static import that should have been dynamic pulls a PDF
library into the island chunk. Replaced by `check-page-weight.js`, deliberately with headroom rather
than as a ratchet, because features grow page weight and that is not a defect. The hard ratchets live in
`check-css-duplication.js`, where every number measures a mistake.

**Redact's box *creation* was deliberately left un-converged** when its drag and resize moved onto
Sign's shared hooks. Two real behavior divergences block a full merge without a product decision: Sign
snaps a too-small drag to a default-sized box while Redact discards it (the user chose to keep Redact's
discard), and the creation drag-clamp math genuinely differs (Sign's is unclamped, Redact's clamps to
`[0,100]` per move). A third structural mismatch - Sign eagerly adds the element to state and mutates
its live DOM node, Redact draws a preview node and commits on release - exists specifically to support
Sign's snap. Converging further was assessed and rejected: about 4-5 lines would actually be shared,
while clamp policy, DOM lifecycle and commit policy stay caller-specific either way.

**Google Analytics was dropped rather than disclosed.** For a product whose whole pitch is "nothing
leaves your device," shipping `gtag` while the docs claimed "no third-party scripts" was a credibility
problem. Only same-origin Vercel Analytics remains, and `connect-src` is back to `'self'`.

**HowTo structured data was removed on purpose** (Google deprecated the rich result in 2023) and must
not be re-added. FAQ schema only.

**`fix/hebrew-pdf-shaping` was retired rather than rebased, and rasterised text was rejected outright.**
The branch (head `d47ca5f`, 2026-07-06) fixed Hebrew shaping by rendering text to a canvas and embedding
it as a PNG, which matches the editor exactly because the output *is* the browser's rendering - and
stops the download being text: no selection, search, copy or accessibility, on a much heavier file. Its
own commit message called it not production-ready and left the decision open. The decision is now made:
**no image fallback, not even for a single stubborn font.** The investigation on 2026-08-21 also found
the fix is far cheaper than the branch assumed (pdf-lib discards shaping it has already computed), so
there was nothing on the branch worth rebasing after seven weeks of drift. It is preserved as the tag
`archive/hebrew-pdf-shaping`. **Do not merge it** - besides the rasterisation it carries an unrelated
Google Analytics integration that reopens `script-src` and `connect-src` to Google origins, which
contradicts the GA decision recorded above. Full reasoning:
[docs/hebrew-text-shaping-export.md](./docs/hebrew-text-shaping-export.md).

---

## Post-mortems whose lessons are still live

**The whiteout resize regressions (two of them) taught the per-handle rule.** A blanket cross-handle
clamp moved the un-dragged anchor edge (`ca411be`), and Redact's copy of the same math was a stale fork
of Sign's pre-fix version, so left/top/corner drags drove the box off-page (`ea10349`). Two lessons
outlived the fix: **no shared function may post-process geometry across element families**, and
duplicated math means a fix on one side never reaches the other. Both motivated the single-owner
`boxResize.ts`.

**The prior whiteout tests were vacuous, and that is why the regression shipped.** They ran against an
unmocked 0x0 page-wrapper rect, which saturates every clamp to ±Infinity, so the assertions could not
fail. Every geometry test now mandates a realistic mocked rect, and the invariant suites carry a
**non-vacuity meta-guard** verified by transiently reintroducing the bug and confirming the tests go
red. A test that cannot fail is worse than no test, because it also stops anyone writing a real one.

**The CSP violations were never the editor's gesture geometry.** The intuitive diagnosis was wrong:
`DraggableWrapper` writes per-property CSSOM, which `style-src` does not govern. The real violations
were 22 SSR-serialized static attributes. **Incidental find:** `index.astro`'s inactive tab panels used
`style="display:none"`, which CSP blocked at parse time, so all three panels rendered stacked until
first click, a visible bug nobody had attributed to CSP.

**One component's decoration was being billed to twelve pages.** Tailwind v4 emits a single stylesheet
and `inlineStylesheets: 'always'` inlines it everywhere, so the home page's tool-tile styling (~30
arbitrary-value rules, used on exactly one page) cost every tool page 4,187 bytes. Component-specific
decoration belongs in that component's scoped `<style>`, not the shared utility layer.

**`transition-[...]` sets `transition-property`, not the shorthand.** A comma list with a duration baked
in compiles to an invalid property-name list and the browser drops the whole declaration. This shipped
once: the home tiles animated not at all for two epics, silently. Check compiled output, not the class
string.

**A stale preview service worker can poison the dev server indefinitely.** A worker installed by
`npm run preview` is scoped to the origin, which on localhost is just a port, so it kept serving that
build's assets cache-first to `astro dev` afterwards. The page then got modules from two Vite optimize
passes and hydration died on `Cannot read properties of undefined (reading '__H')` with nothing naming
the cache. The tell is two different `?v=` hashes on `preact.js` and `preact_hooks.js`.

**A worktree needs its own `npm install`, and a stray `node_modules` there fails silently.** Node stops
at the first `node_modules` it finds, so a leftover empty one shadows the real install. Most imports
still resolve, but CSS Modules resolve to `{}` under Vitest, so `styles.foo` is `undefined`, the element
renders `class="undefined"`, and every test touching that class fails with nothing pointing at the cause.

**The class-resolution guards only see server-rendered markup.** `check-dead-utilities.js` reads built
HTML, so any class appearing only after an interaction is invisible to it. Two real defects lived in
that gap for months: the Undo dialog shipped unstyled against a CSS Module nothing imported, and five
tools' "not a PDF" notice rendered as bare text after `.hint-message` was deleted and never re-homed.
`check-class-resolution.js` is the source-side complement. **Before allowlisting a class in either
script, check whether it has a rule in some `.module.css` first - if it does, the bug is a missing
import, not a hook.**

**Three backlogs drift into three different truths.** This file's own history: a 919-line narrative
duplicated the board, then described shipped work as open for months, missed two entire epics, and sent
a reader looking for "what's left" to a wrong answer. Meanwhile a fourth backlog hid in `docs/` as an
implementation spec for already-shipped work. One list, or the extra ones lie.

---

## Parked, deliberately

**IndexNow** (faster Bing/Yandex indexing) - skipped, low priority.

**An in-app feedback form** - rejected to avoid loosening `connect-src 'self'`. Feedback ships as footer
links to GitHub Issues and Discussions instead, which adds zero network surface.

---

## Detailed design records

- **[docs/E4-headless-editor-core-plan.md](./docs/E4-headless-editor-core-plan.md)** - the editor-core
  low-level design: audit, target `src/editor/` layout, per-type behavior inventory, the Sign/Redact
  model reconciliation.
- **[docs/E2.2-css-modules-scoping-plan.md](./docs/E2.2-css-modules-scoping-plan.md)** - the CSS-Modules
  scoping inventory with line ranges and module destinations.
- **[docs/E2.3-editor-css-modules-plan.md](./docs/E2.3-editor-css-modules-plan.md)** - the 78-class
  editor ownership inventory. Its job ended with the migration; the standing guard is
  `scripts/check-editor-global-css.js`.
- **[docs/hebrew-text-shaping-export.md](./docs/hebrew-text-shaping-export.md)** - why exported Hebrew
  did not match the editor. The framing to take from it: the export had a shaper and a painter, not a
  text pipeline, and each defect found is one of the five stages it was missing rather than a bug in
  fontkit. Also the rejected alternatives (image, HarfBuzz WASM, presentation forms, all three now
  annotated with what their measurements could not see) and the measurement pitfalls that produced
  confidently wrong readings along the way. **Stale on current state and left that way on purpose**: its
  layer 1, 2 and 3 headers still say "open" and all three shipped, and its `HEBREW_CAPABLE_FONTS` count
  is one behind (Alef). Read it for the reasoning trail and the per-font measurements; read the record
  below for what is true today.
- **[docs/wysiwyg-text-architecture.md](./docs/wysiwyg-text-architecture.md)** - what pdkef can promise
  for WYSIWYG text with no server. Supersedes the record above on current state: a five-stage map of both
  sides verified from code with file:line, the guard map showing five of seven shipped scripts have no
  agreement proof, the coverage-first selection rule, the measured font coverage matrix, and the five
  architecture options with their real costs. Two things to take from it before touching this area: the
  two products in the competitor study **fail in opposite directions** (pdkef refuses and ships nothing;
  the server-side tool ships something partially wrong), and **"browser authoritative" and "rasterise
  the text" are the same option**, so that door is already closed.
- **[docs/view-density-control-spec.md](./docs/view-density-control-spec.md)** - the Relaxed / Condensed
  / Full screen control, why density is a global preference and why only Sign and Redact expose it.
- **[seo-audit-output/](./seo-audit-output/)** - SEO strategy and reference material.

## Full ticket history

The complete 77-ticket board, with per-ticket acceptance notes, lived in `scrum-board.data.js` until
2026-08-16. It is preserved in git history rather than carried forward, because 67 closed tickets of
acceptance prose is a record, not a backlog:

```bash
git show 13427d2:scrum-board.data.js
```
