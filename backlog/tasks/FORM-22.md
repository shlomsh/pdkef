---
id: "FORM-22"
title: "A CI guard keeps field detection pure"
status: "in_progress"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["ARCH-24"]
---

# FORM-22 · A CI guard keeps field detection pure

## Why

Audited 2026-09-25: the detectors are already pure, plain data in and plain data out, with every
pdf-lib, pdf.js and DOM access in a few thin boundary shims (`collectPageInk`, `pageWidgets`,
`widgetEntries`, `collectCheckboxGlyphs`, the scoring loader). Nothing keeps it that way. A
strategy that is swapped in is only swappable if it cannot reach outside its inputs, and the
project's rule is that an invariant is a check, not prose.

After ARCH-24 the capability is one folder, so the guard can be one folder's rule.

## Acceptance

- [ ] A script in the style of `check-gesture-golden-rule.js`, wired into `ci.yml` and the CLAUDE.md
      CI list: detector modules import no `pdfjs-dist`, `@cantoo/pdf-lib`, DOM or Preact, except the
      named boundary shims, and hold no module-level `let`/mutable state.
- [ ] Sabotage-checked: a stray import and a module-level cache each fail it.
- [ ] Runs in under a second; `check:fast` includes it if it touches detection files.

## Landed (2026-09-25)

`scripts/check-detection-purity.mjs`, wired into `ci.yml` (right after `test:gesture-golden-rule`,
matching the style of that guard), `check:fast`, `package.json` (`test:detection-purity`) and the
CLAUDE.md CI guardrails list. Style follows `check-gesture-golden-rule.js`, but it parses with the
TypeScript compiler API (already a devDependency, imported the same `createRequire`-past-Vite way
`check-module-boundaries.import-scan.test.mjs` already does) instead of scanning raw text: every
detector file's JSDoc carries `@param {import('@cantoo/pdf-lib').PDFPage} page`, and a text scan for
`import(...)` cannot tell that from a real dynamic import - it would have flagged pageInk.js,
formGrid.js, formCells.js, formWidgets.js and pdfObjects.js on day one. An AST does not see comments
at all.

**The three rules, as implemented:**
1. No import of `pdfjs-dist`, `@cantoo/pdf-lib` or `preact`, and no `document.`/`window.`/`navigator.`/
   `localStorage`/`fetch(`/`XMLHttpRequest` reference, in a detection module - except a file on the
   `BOUNDARY_SHIMS` allowlist, which is exempt from the package-import half only (a shim still may
   never touch the DOM).
2. No module-level mutable state: a top-level `let`/`var` fails outright; a top-level `const` bound to
   `new Map/Set/WeakMap/Array`, `[]` or `{}` fails only if something later in the file mutates it
   (`.set`/`.add`/`.push`/.../a property or index assignment) - a lookup table that is only ever read
   is not state, and every existing top-level container in these ten files (`IDENTITY`,
   `PAINT_OPERATORS`, `KIND_GROUPS`, `CHECKBOX_GLYPHS`, `KINDS`, ...) is exactly that.
3. No `Date.now()`, `new Date()`, `Math.random()` or `performance.now()` anywhere in a detection module.

**`DETECTION_MODULES`** is today's explicit file list (field detection is scattered inside
`src/editor/adapters/pdf/` alongside `sign.js`/`redact.js`/`applyPageEdits.js`/`deleteObjects.js`,
which are not detection): `pageInk.js`, `formGrid.js`, `formCells.js`, `formWidgets.js`,
`fieldRegions.js`, `textRuns.js`, `pdfObjects.js`, `corpus/scoring/{score.js,match.js,candidates.js}`.
`DETECTION_ENTRY_POINT` (`src/editor/adapters/pdf/detectFormFields.ts`) is scanned only once ARCH-24
lands it - the guard never fails for a file that does not exist yet. Once ARCH-24 moves the capability
into one folder under `src/tools/sign/`, `DETECTION_MODULES` collapses to that folder's contents, a
one-line change here.

**`BOUNDARY_SHIMS`** (file -> reason), exactly the shims FORM-22's own "Why" section named:
- `pageInk.js` - `collectPageInk`/`pageCropBox` adapt one pdf-lib `PDFPage` into plain ink data (MOBI-03).
- `pdfObjects.js` - `pageWidgets`/`widgetEntries`/`collectCheckboxGlyphs` read a pdf-lib page and its
  annotation tree into plain values (FORM-14, MOBI-11).
- `corpus/scoring/score.js` - the scoring loader: `pageTextRuns` opens a real PDF through pdf-lib and
  pdfjs-dist to score the shipped pipeline against reviewed ground truth (MOBI-13).

Exemption is whole-file, not per-export: both `pageInk.js` and `pdfObjects.js` mix page-reading
functions with plain helpers in one file, and splitting either just for this guard would be churn
ARCH-24 is about to redo anyway when it draws the real folder boundary.

**Measured on today's code**: `node scripts/check-detection-purity.mjs` passes, 10/10 modules, 0
violations, in 0.17s wall (0.20s user) - comfortably under the 1s acceptance bar.
`npx vitest run scripts/check-detection-purity.test.mjs` passes, 32/32.

**Sabotage-checked** (each inserted, run, confirmed failing with the expected message and line number,
then reverted - `git status` clean after all three):
- A stray `import 'pdfjs-dist';` at the top of `formGrid.js` -> failed:
  `formGrid.js:1: imports 'pdfjs-dist', which is not on the boundary-shim allowlist`.
- A module-level `let cache = new Map();` inserted into `formWidgets.js` -> failed:
  `formWidgets.js:6: top-level 'let cache' is module-level mutable state`.
- `const _sabotage = Math.random();` inserted at the top of `detectCellCandidates` in `formCells.js`
  -> failed: `formCells.js:592: 'Math.random' reaches outside the detector's plain-data inputs`.

No real detection code changed - the audit in FORM-22's own "Why" held: the detectors were already
pure. Left `in_progress` rather than `done`: acceptance box 3 ("`check:fast` includes it if it touches
detection files") is satisfied unconditionally instead (it runs every `check:fast`, alongside the other
source guards in that chain, none of which are change-scoped either) - worth a second look once ARCH-24
lands and the file list collapses to a folder, but not worth narrowing today's ten-file, sub-second
guard by hand.

## Review follow-up (2026-09-25)

An independent review of the landed commit found five real gaps, all fixed in the same file without
touching any detection code:

1. **BLOCKING** - `FORBIDDEN_PROPERTY_ACCESS` only ever matched a bare `document`/`window`/`navigator`
   object name, so `globalThis.document.title`, `self.document.title`, a bare `self`, and
   `const { document: doc } = globalThis` all passed. Replaced with `FORBIDDEN_GLOBAL_REFERENCES`, a
   set of identifiers (`globalThis`, `self`, `window`, `document`, `navigator`, `localStorage`,
   `sessionStorage`, `indexedDB`, `fetch`, `XMLHttpRequest`) that are forbidden by *reference*, however
   reached, checked against the AST (a property name and a destructure's property key are excluded, an
   identifier reference is not) rather than only the specific `object.member` shape.
2. `crypto.randomUUID()`/`crypto.getRandomValues()` were not caught. Added `crypto` to
   `FORBIDDEN_NONDETERMINISTIC_MEMBERS` alongside `Math`/`Date`/`performance`.
3. `isMutatingUse`/`checkModuleLevelState` matched a mutation by name only, so a function-local shadow
   of a top-level const's name (a parameter, or a same-named local declared and mutated inside a
   function) falsely flagged the top-level binding. Fixed with real scope resolution: `createChecker`
   builds a single-file, `noLib` TypeScript Program and its type checker purely for
   `getSymbolAtLocation`, and a mutation only counts against a top-level declaration when the
   reference's resolved symbol is that exact declaration node.
4. `BOUNDARY_SHIMS` exempted a whole file, so in `pdfObjects.js`, `lookupDict`, `numberAt`,
   `getPageContentBytes`, `extractPageObjects` and `hasFillableAcroForm` all got pdf-lib for free
   alongside the three functions the file's own comment named. Added `FUNCTION_SHIMS` (file -> function
   name -> one-line reason), enforced by walking a reference's `node.parent` chain to its nearest named
   enclosing function: every reference to an imported pdf-lib/pdf.js binding, and every dynamic
   `import()`/`require()` call, must sit inside a function on that file's `FUNCTION_SHIMS` list. Read
   straight off today's code, honestly (`hasFillableAcroForm` is listed even though it references no
   import directly - its parameter is a pdf-lib `PDFDocument` - and `scoreForm` in `score.js` is listed
   even though nothing named it before, since it calls `PDFDocument.load` itself):
   - `pageInk.js`: `pageCropBox` (reads CropBox/MediaBox), `collectPageInk` (delegates entirely to
     `pdfObjects.js`, referencing no import itself, but is the file's other named shim).
   - `pdfObjects.js`: `lookupDict`, `numberAt`, `getPageContentBytes`, `readFont`, `buildFontTable`,
     `buildXObjectTable`, `collectCheckboxGlyphs`, `inheritedEntry`, `pageWidgets`, `widgetEntries`,
     `extractPageObjects`, `hasFillableAcroForm` - effectively every function in the file that is not
     pure string/geometry logic (`parseToUnicode`, `decodeCodes`, `isCheckboxGlyph`, `textGlyphBox`
     stay off the list, correctly).
   - `corpus/scoring/score.js`: `pageTextRuns` (dynamic pdfjs-dist import), `scoreForm`
     (`PDFDocument.load`).
5. A bare `require('pdfjs-dist')` was not caught (only a static `import` or dynamic `import()`).
   Added, scoped the same way as a dynamic import: unconditionally forbidden outside a shim file, and
   confined to a `FUNCTION_SHIMS` function inside one. `require.resolve(...)` (score.js's real use, to
   locate the font/cmap/wasm directories) is unaffected - it resolves a path, it never loads the module.

19 new unit tests (one or more per finding), each confirmed by hand to fail against commit b8750b02's
own copy of the script before the fix and pass after. `node scripts/check-detection-purity.mjs` still
passes 10/10 modules, 0 violations, in ~0.20s. `npx vitest run scripts/check-detection-purity.test.mjs`
passes 51/51. All three original sabotage checks re-run clean, plus a fourth
(`globalThis.document.title` inserted into `formCells.js`) added for finding 1; each was inserted, run,
confirmed failing with the expected message and line, then reverted, with `git status` clean after all
four.
