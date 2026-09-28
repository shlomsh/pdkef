# RED-18: closing the four gaps `results-extra.md` found

`results-extra.md` found four constructs where the RED-18 alignment logic either crashed, could be
fooled, or never looked at all: an embedded-CMap Type0 font, an inline image with an "EI" trap in its
raw data, text inside a tiling pattern, and text in an annotation appearance stream - plus a fifth,
narrower question about whether a Type3 font's glyphs can draw outside what the alignment checks.

This change makes `spikes/red-18/align.mjs` turn every one of those into an explicit, reported
"fallback: `<reason>`" for the page, or (for the annotation case, which the brief treats differently) an
explicit note of which annotations need routing elsewhere. None of it is a crash and none of it is a
silent pass. Every existing export's name and return shape is unchanged for a page that doesn't exercise
one of these constructs - see "21/21 still align" below - only new fields and new functions were added.

## 1. Embedded CMap - no longer crashes

`classifyFont()` used `fontDict.lookupMaybe(PDFName.of('Encoding'), PDFName)`, which throws
(`UnexpectedObjectTypeError`, "Expected instance of PDFName, but got instance of PDFRawStream") the
moment a Type0 font's `/Encoding` resolves to anything other than a `PDFName` - which is exactly what an
embedded CMap stream is. Fixed by reading the encoding with `fontDict.lookup(PDFName.of('Encoding'))`
(no type argument - pdf-lib's `lookup`/`lookupMaybe` only throw when given type arguments and the
resolved object doesn't match one; with none, it just returns whatever the reference resolves to,
confirmed by reading `PDFContext.lookup`/`lookupMaybe` in `node_modules/@cantoo/pdf-lib`). If the result
is a `PDFName`, behaviour is identical to before. If it's anything else (a stream, in practice), `cls`
now carries `embeddedCMap: true` and `decodeCodes()` reports `unsupported cmap (embedded)` instead of
never getting that far.

Rerun over `corpus-extra/cmap-embedded-mixed-width.pdf`:

```
"firstMismatch": { "kind": "raw decode", "index": 1, "op": "Tj", "error": "unsupported cmap (embedded)" }
```

No exception. The page is reported FAILS with the exact message `decodeCodes()` was always meant to
produce for an unsupported CMap - it just now reaches that code path instead of crashing one step
earlier in font classification.

## 2. Inline image "EI" trap - length is verified, not guessed, wherever it can be

`Tokenizer.readInlineImage()` now parses the `BI` dict's entries and determines the data's exact extent
in the only two ways that are actually exact:

- **`/L` (`/Length`)**: use it directly - skip exactly that many bytes, then the following `EI` is
  consumed as a fact, not found by scanning.
- **A single recognised filter, decoded to its own end**: only `/Fl` / `/FlateDecode` is attempted, using
  Node's `zlib.inflateSync(buf, { info: true })`, which - confirmed by a standalone test in this
  worktree's Node (v24.13.0) - returns `engine.bytesWritten`, the exact number of *compressed* input
  bytes the deflate stream consumed, even when the buffer handed to it has trailing garbage after the
  real end (exactly the inline-image-in-a-content-stream situation, where the "garbage" is the rest of
  the page). This is the "filter whose end you can find by decoding" the brief asked for; other filters
  (DCT, CCITT, LZW, RunLength) are not attempted and fall through to the heuristic below, so they're
  still reported as a fallback, not guessed.

Anything else - no `/L`, no filter, or a filter that isn't Flate - falls back to the old
whitespace-bounded-`EI` scan, and a note is pushed either way via the existing `notes` channel
`rawShowOps()` already had (so a page's report line was already showing notes; this just adds one):

- known: `inline image: length known via /L` or `inline image: length known via filter:Fl`
- unknown: `fallback: inline image (length not knowable - no /L, no /Filter; used EI-scan heuristic)`

Rerun over `corpus-extra/inline-image-ei-trap.pdf` (no `/L`, no `/Filter` - exactly the construct
`results-extra.md` built): reported

```
"notes": ["fallback: inline image (length not knowable - no /L, no /Filter; used EI-scan heuristic)"],
"aligned": false,
"firstMismatch": { "kind": "op count", "raw": 2, "pdfjs": 1 }
```

Same op-count-mismatch FAILS `results-extra.md` already documented (unchanged - this fixture still can't
be resolved, by construction, since it has neither `/L` nor a filter), but now it also carries an explicit
`fallback:` line explaining exactly why, instead of leaving a reader to infer it from the mismatch alone.
A fixture with an `/L` or a `FlateDecode` inline image would now skip past a "EI" trap correctly instead
of relying on luck, per `results-extra.md`'s own warning that the raw side's recovery there "is luck, not
robustness."

## 3. Text inside a tiling pattern - reported even though the page numerically "aligns"

New: `collectPatternRefs()` (any `scn`/`SCN` operator whose trailing operand is a `/Name` - unambiguous
evidence of a pattern fill, so no `cs`/`CS` graphics-state tracking is needed to be correct),
`resolvePatternObj()`, and `detectPatternTextFallback(node, raw)`, which reuses `rawShowOps()`'s own
`pageBytes`/`formSources` (already walked; nothing is re-descended) to find every distinct
`PatternType 1` (tiling) pattern filled on the page or in any of its forms, decodes its own content
stream, and checks it for a `Tj`/`TJ`/`'`/`"` operator with `streamHasTextOps()`.

Rerun over `corpus-extra/tiling-pattern-text.pdf`:

```
"rawCount": 1, "pdfjsCount": 1, "aligned": true,
"fallbacks": ["fallback: text in a pattern (/P1)"]
```

This is the important case: the page still numerically "aligns" (1 keep-text op on both sides, exactly
as `results-extra.md` found - "TILEPATTERN" enters neither side's comparison), but it is now explicitly
flagged as a fallback anyway, because a caller checking only `align()`'s `aligned: true` would otherwise
never learn that a pattern on this page paints text neither side ever looked at. This is deliberately
**not** folded into `align()`'s own aligned/FAILS verdict - `align()`'s contract (op-count and code-value
equality) is unchanged - but reported as a separate, additive signal the report line already surfaces.

## 4. Text in an annotation appearance stream - routed, not fallback-flagged

New: `detectAnnotationText(node)` walks `node.Annots()`, and for each annotation resolves `/AP /N`
(a direct stream, or - for annotations like buttons whose `/N` is a sub-dictionary keyed by appearance
state - every stream-valued entry of that sub-dictionary), decodes it, and checks it with the same
`streamHasTextOps()`. Per the brief, this is **not** treated as a fallback by itself - `align.mjs` never
claimed to cover annotations (`pdfjsShowOps()` hardcodes `AnnotationMode.DISABLE`, `rawShowOps()` never
reads `Annots()`) - it exists purely to tell a caller which pages have text-bearing appearance streams so
they get routed to the annotations step (RED-21) instead of being silently treated as "nothing more to
find here."

Rerun over `corpus-extra/annotation-appearance-text.pdf`:

```
"aligned": true, "fallbacks": [],
"annotationsWithText": [{ "index": 0, "subtype": "/FreeText" }]
```

One text-bearing annotation reported, exactly the `/FreeText` fixture `results-extra.md` built. The page
itself is still reported "aligned" (correctly, per `align.mjs`'s own scope) but now carries the
information a real redaction engine needs to also route this page's annotation to RED-21.

## Type3 font - checked, not just trusted

The brief's fifth question: `results-extra.md` found Type3 decodes correctly *for the one fixture built*,
but a Type3 glyph can draw anything, unbounded by width - is that fixture actually safe, or just lucky?

New: `checkType3Bounds(fontDict)`. For every stream in `/CharProcs`, it tokenizes the glyph procedure and
tracks the accumulated CTM through `q`/`Q`/`cm` (the same matrix-concatenation math as PDF's own graphics
state: `CTM_new = M_cm × CTM_old`), then transforms every path-construction operand (`m`, `l`, `c`, `v`,
`y`, `re`) through that CTM before comparing against the font's `/FontBBox`.

**Why `/FontMatrix` plays no part in the containment check itself:** `/FontBBox` is specified "in glyph
space" (ISO 32000-1 §9.6.5.2) - the same coordinate system a `CharProc`'s own path operators draw in,
before any transform is applied. `/FontMatrix` maps *that* glyph space into text space; it's what a
*renderer* needs to place the glyph on the page, but both operands of this specific containment check
(the box, and the drawing) already live in the same space as each other, so comparing them directly is
correct and `/FontMatrix` is irrelevant to whether the drawing stays inside the box. (It would matter if
this check needed to report the bound in text-space units - it doesn't.)

Curves (`c`/`v`/`y`) are bounded via their control points rather than the true curve extent. This is
conservative, never optimistic: a cubic Bezier always lies within the convex hull of its control points
(a standard property of Bezier curves), so a glyph that "passes" this check cannot actually draw outside
`/FontBBox`, but a glyph could in principle fail this check while its rendered curve stays inside (a false
fallback, never a false pass). A missing or degenerate (`[0 0 0 0]`, or zero-area) `/FontBBox`, or a
font with no `/CharProcs` to check, is unsafe by construction (`safe: false`) since there is then nothing
to compare against.

Rerun over `corpus-extra/type3-font.pdf` (`/FontBBox [0 0 600 700]`, one shared glyph proc
`50 0 500 650 re f` - a filled rectangle from (50,0) to (550,650)):

```
"type3": [{ "safe": true, "reason": "all CharProc drawing within /FontBBox [0 0 600 700]" }]
```

Confirmed by hand: the rectangle's four corners are (50,0), (550,0), (50,650), (550,650), all inside
[0,600]×[0,700]. **This fixture's Type3 alignment is for real, not lucky** - now backed by an actual
geometric check instead of an inference from one hand-built glyph. A Type3 font whose `CharProcs` draw
outside `/FontBBox` (or whose `/FontBBox` can't be trusted) is reported `safe: false` with the specific
reason, which a caller should read as `fallback: Type3 font`.

## Confirmation: the 21 original files still align, byte-identically

`node spikes/red-18/align.mjs` was rerun after every change above. Diffed the regenerated
`spikes/red-18/results-align.md` against the version at the start of this task:

```
$ diff results-align-before.md spikes/red-18/results-align.md && echo BYTE-IDENTICAL
BYTE-IDENTICAL
```

`21 of 21 files align on every page. 25 of 25 pages align.` - unchanged, because none of
`spikes/red-01/corpus`'s fixtures exercise an embedded CMap, an inline image, a tiling pattern fill, or
an annotation appearance stream with text (confirmed by construction - `results-extra.md` is exactly the
document that built the first fixtures which do). The two behaviour-changing fixes (`classifyFont`,
`readInlineImage`) only change what happens on inputs the old code either crashed on or had no data for;
every new function is additive surface nothing in the existing report driver calls.

## Corpus-extra rerun, full result

`align.mjs` hardcodes `spikes/red-01/corpus` as `CORPUS_DIR` and wasn't touched (per the original brief);
corpus-extra was exercised by importing `align.mjs`'s real exports (`rawShowOps`, `pdfjsShowOps`, `align`,
plus the three new detectors) from a throwaway script pointed at `spikes/red-18/corpus-extra/` instead -
"pointing the module at that folder" via its actual API, rather than editing `run-align-extra.mjs`'s
separate hand-copied logic (out of scope: this task owns `align.mjs`, not that file). All 8 fixtures still
open and produce a result with no crash anywhere:

| # | Fixture | `aligned` | Fallback / note reported |
|---|---|---|---|
| 1 | `type3-font.pdf` | true | none - `checkType3Bounds`: `safe: true` |
| 2 | `cmap-embedded-mixed-width.pdf` | **false** (reported, not a crash) | raw decode: `unsupported cmap (embedded)` |
| 3 | `inline-image-ei-trap.pdf` | false (op count 2 vs 1, unchanged) | `fallback: inline image (length not knowable - no /L, no /Filter; used EI-scan heuristic)` |
| 4 | `nested-form-2deep.pdf` | true | none |
| 5 | `nested-form-3deep.pdf` | true | none |
| 6 | `shared-form-drawn-twice.pdf` | true | none |
| 7 | `tiling-pattern-text.pdf` | true (vacuously, as before) | `fallback: text in a pattern (/P1)` |
| 8 | `annotation-appearance-text.pdf` | true (vacuously, as before) | not a fallback; `annotationsWithText: [{index:0, subtype:"/FreeText"}]` (route to RED-21) |

Every hard case `results-extra.md` raised is now either a genuinely-correct alignment backed by a real
check (fixtures 1, 4, 5, 6), a reported failure with the exact right diagnosis instead of a crash
(fixture 2, the brief's case 1), an explicit fallback line even where the page's op counts still happen
to agree (fixtures 3 and 7, the brief's cases 2 and 3), or an explicit routing note for the step that
owns it (fixture 8, the brief's case 4). Nothing here is silently wrong, and nothing here is a crash.
