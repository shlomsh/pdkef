# RED-18 corpus-extra: the hard cases align.mjs's first corpus never exercised

Eight fixtures in `spikes/red-18/corpus-extra/`, one per construct: a Type3 font, a Type0 font with a
non-Identity (embedded, mixed 1-/2-byte codespace) CMap, an inline image whose raw data contains a
whitespace-bounded "EI" byte sequence, Form XObjects nested two and three levels deep, the same Form
XObject drawn twice on one page, text inside a tiling pattern's own content stream, and text in an
annotation's `/AP /N` appearance stream. Built by `make-extra.mjs`; run through a faithful, unmodified
copy of `align.mjs`'s own tokenizer/decoder/align logic in `run-align-extra.mjs` (`align.mjs` itself
hardcodes `spikes/red-01/corpus` as its corpus directory and wasn't touched - see that file's header).

Every file was independently confirmed to open and produce a `getOperatorList()`/`getTextContent()`
result from pdf.js with no thrown error (`corpus-extra/verify-open.json`), satisfying the "must render
without errors" bar even where align.mjs's own comparison below reports a failure.

**Headline: 6 of 8 files "align" on every page - but two of those six are vacuous passes** (the secret
text never enters either side's comparison at all, by construction, not because it was correctly
handled), and of the two real failures, one is a graceful, already-correctly-reported case and one is
an actual crash in `align.mjs`'s own code that the corpus never triggered before. No case was found to
be *silently wrong* - every case that produced a wrong-looking result was caught (a count mismatch or a
thrown exception), not agreed-and-wrong. Full per-op code dumps are in `corpus-extra/align-raw-output.json`.

## Per case

### 1. Type3 font - **aligned, and for real**
`type3-font.pdf`: a hand-built Type3 font (`FontMatrix`, `CharProcs`, `Differences` encoding to
plain-ASCII codes; each glyph proc just paints a filled box - Type3 glyphs can draw anything, a
letterform isn't required for validity). Raw 2 show ops = pdf.js 2, codes match exactly on both sides:
`[84,89,80,69,51,83,69,67,82,69,84]` = `TYPE3SECRET`.

**Why:** `classifyFont()` sets `isType3` but `decodeCodes()` only branches on `isType0` - a Type3 font
falls through to the same "one raw byte per code" path as any simple font, which is exactly right,
since Type3 codes select a `CharProcs` entry by the font's `Encoding`/`Differences`, one byte each, same
as a simple font's built-in encoding. pdf.js's `originalCharCode` for a Type3 glyph is the same raw
byte. **Measured:** codes match index-for-index. **Inferred:** Type3 needs no special-casing in
align.mjs's current logic; the existing 1-byte decode path already covers it correctly.

### 2. Type0 font, embedded non-Identity CMap (1-byte + 2-byte codespace) - **crashes, not "reported unsupported"**
`cmap-embedded-mixed-width.pdf`: a Type0/CIDFontType2 font whose `/Encoding` is an **embedded CMap
stream** (not a predefined name) declaring two codespace ranges, `<00>-<7f>` (1 byte) and
`<8000>-<ffff>` (2 bytes), with six `cidchar` entries. The secret "CIDMIX" is encoded as 6 raw bytes -
three 1-byte codes and three 2-byte codes - `43 8049 44 804d 8049 58`.

pdf.js opened the file cleanly and decoded it *correctly*: `getOperatorList()`'s `originalCharCode`
sequence is exactly `[67, 32841, 68, 32845, 32841, 88]` = `[0x43, 0x8049, 0x44, 0x804d, 0x8049, 0x58]`,
i.e. pdf.js's own CMap parser correctly split the mixed-width byte string using the codespace ranges I
defined. `align.mjs`'s raw side, however, **throws**:

```
Error: Expected instance of PDFName, but got instance of PDFRawStream
  at classifyFont (.../run-align-extra.mjs:251) via fontDict.lookupMaybe(PDFName.of('Encoding'), PDFName)
```

**Why:** `classifyFont()` reads `/Encoding` assuming it is always a `PDFName` (true for `/Identity-H`,
`/Identity-V`, and any predefined CMap name) - but per spec a Type0 font's `/Encoding` may equally be an
indirect reference to an **embedded CMap stream**, which is exactly what real-world PDFs use for
custom/legacy CID fonts without a predefined CMap. `lookupMaybe(ref, PDFName)` throws instead of
returning null when the resolved object is the wrong type. This exception isn't caught inside
`rawShowOps()` - it propagates out and is only caught by the *page-level* try/catch in the corpus-report
loop, which logs it as `ERROR - raw tokenizer threw: ...`. That's a visible, reported failure (not
silently wrong), but it is **not** the graceful `unsupported cmap (...)` message `decodeCodes()` was
clearly designed to produce for exactly this situation - the crash happens one step earlier, in font
classification, before `decodeCodes()` ever runs.

**Measured:** a real, reachable crash on a spec-legal, real-world construct. **Inferred:** this is a
genuine hardening gap, not a feature - `classifyFont()` needs a type check (`lookupMaybe(ref, PDFDict)`
for a stream, or a plain `fontDict.lookup(Encoding)` + inspect-the-result-type) before assuming
`/Encoding` is a name, so this reaches `decodeCodes()`'s intended `unsupported cmap` path instead of
crashing. (Untested here: a *predefined-name* non-Identity CMap, e.g. `/UniJIS-UCS2-H`, would likely hit
that graceful path today, since `/Encoding` would then already be a `PDFName` - the embedded-stream
variant was chosen for this corpus specifically because the task offered it as an alternative and it's
self-contained, with no `cMapUrl` dependency on pdf.js's bundled resource files.)

### 3. Inline image with a whitespace-bounded "EI" inside its raw data - **reported (op-count mismatch), not silently wrong - but the near-miss is instructive**
`inline-image-ei-trap.pdf`: a 6x4, 8bpc `DeviceGray` inline image (`BI ... ID <24 raw bytes> EI`, no
`/L` length key) with real body text before and after. Ten bytes into the payload the raw data contains
` EI ` (`0x20 0x45 0x49 0x20`) - the exact whitespace-bounded pattern both align.mjs's own inline-image
scanner and, it turns out, pdf.js's own use to find the image's end when no `/L` is given.

Result: raw 2 show ops, pdf.js **1** show op. `align()` correctly reports `op count` mismatch and marks
the page FAILS - a visible, caught failure, not a silent one.

**What actually happened, checked byte-for-byte (`align-raw-output.json`):**
- **align.mjs's raw tokenizer is *also* fooled by the trap** - `readInlineImage()`'s heuristic finds the
  same false " EI " at byte 10 and stops there, just as pdf.js does. The bytes that follow (the
  remaining 10 real image bytes, then the real `\nEI\nQ\n`) get re-tokenized as ordinary content: the
  leftover digit bytes parse as one large number literal, the real "EI" becomes an unrecognized
  operator keyword (silently ignored - not in the `switch`), and "Q" is a harmless, valid operator. None
  of that corrupts font state or position, so when the real `BT ... Tj ... ET` block for the second
  secret starts right after, it parses perfectly and decodes to the exactly correct codes for
  `INLINEIMAGESECRET`. **This recovery is luck, not robustness** - the garbage tokens happened not to
  interfere with anything that mattered. A trap positioned differently (e.g. one whose leftover bytes
  formed something that looks like a partial string, or a `Tf`/`cm` that displaces font/CTM state before
  the real next operator) could plausibly make the raw side wrong too, not just pdf.js - that was not
  observed here, but the mechanism means it can't be ruled out from this one file.
- **pdf.js's own `getOperatorList()` does not recover.** It hits the same false terminator, then throws
  internally (`TypeError: Cannot read properties of undefined (reading 'objId')`) partway through
  building the rest of the page's operator list; pdf.js's own error handling swallows that exception
  (logged as a `Warning: getOperatorList - ignoring errors...`) and simply **stops emitting further
  ops**, dropping the real second `Tj` outright. Tellingly, `page.getTextContent()` - a separate,
  independent extraction path - *does* still recover both strings correctly, so the corruption is
  specific to operator-list construction, not universal within pdf.js.

**Measured:** the two-op-vs-one-op mismatch is real, and `align.mjs` reports it correctly (not silently
wrong). **Inferred:** the "EI inside unfiltered inline-image data, no `/L`" ambiguity is a genuine,
shared weak point - both the raw tokenizer and pdf.js's own evaluator use the same fragile heuristic, and
neither can be trusted on this construct without a real fix (computing the exact data length from
`/W`, `/H`, `/BPC` and the color space when there's no filter, or requiring `/L` when a filter is
present). A true redaction tool built on this logic should treat any inline image lacking `/L` (or an
unresolvable length) as unsafe to process automatically, exactly as it does today for embedded CMaps.

### 4 & 5. Form XObjects nested 2 and 3 levels deep - **aligned, and for real**
`nested-form-2deep.pdf` (page → F1 → F2) and `nested-form-3deep.pdf` (page → F1 → F2 → F3), only the
innermost form draws the secret. Both: raw 2 = pdf.js 2, `forms` count matches the nesting depth (2 and
3 respectively), codes match exactly (`NESTED2DEEP`, `NESTED3DEEP`). The existing corpus only ever
exercised one level of `Do` (`form-xobject-text.pdf`); recursion clearly still works correctly two and
three levels down, well inside the 15-level recursion guard.

### 6. The same Form XObject drawn twice on one page - **aligned, and for real**
`shared-form-drawn-twice.pdf`: one Form XObject (`/Fshared`), invoked with two separate top-level `Do`
calls from the page's own content (not nested). Raw 3 = pdf.js 3, `forms: 2` (both invocations
descended into), and both occurrences decode to the exact correct codes for `SHAREDFORM`.

**Why this was worth checking:** `rawShowOps()`'s cyclic-reference guard (`seenRefs`, added before
descending into a form and deleted again on return) could plausibly have been written at too broad a
scope, treating a form's second top-level use as a false "cycle" and skipping it. It isn't - the guard
is correctly scoped to one recursion chain (a form calling itself, directly or through others), so a
second, independent top-level `Do` of the same ref after the first call has fully returned and cleaned
up its `seenRefs` entry is processed normally. **Measured:** both occurrences present with correct
codes. **Inferred:** no dedup/identity bug here; pdf-lib's "same object instance per ref" assumption
that the code's own comment calls out holds up in practice.

### 7. Text inside a tiling pattern's own content stream - **aligned, but vacuously**
`tiling-pattern-text.pdf`: a `PatternType 1` (tiling) pattern whose cell content stream itself contains
`BT ... Tj ... ET` for the secret "TILEPATTERN", painted by filling a rectangle exactly one cell in
size. Raw 1 = pdf.js 1 - but that's the keep text on *both* sides; "TILEPATTERN" appears in neither.

**Why:** pdf.js's `getOperatorList()` does not decompose a tiling pattern's cell content into page-level
`showText` ops at all - pattern painting is handled entirely inside canvas rendering (`TilingPattern` in
pdf.js's canvas code), never surfaced through the operator list the same way ordinary content is.
`getTextContent()` doesn't walk into a pattern cell either (confirmed: it reports only the one keep-text
item). On the raw side, `rawShowOps()` has no handling at all for `scn`/`Pattern` fills - only `Do` is
followed - so it never reads the pattern's content stream either.

**Measured:** the secret text is invisible to *both* sides of the comparison, so the 1=1 "aligned"
result is trivially true and proves nothing about pattern-text handling. **Inferred:** this is a real
coverage gap for a true redaction tool, not a pass - text painted via a tiling pattern would currently
be silently missed entirely (not wrongly *kept as visible content the tool thinks is safe* - it's simply
never looked at), which is a materially different, and arguably worse, risk than a caught mismatch:
nothing here would ever tell a caller this text exists.

### 8. Text in an annotation's `/AP /N` appearance stream - **aligned, but vacuously**
`annotation-appearance-text.pdf`: a `/FreeText` annotation whose `/AP /N` is a real Form XObject with
`BT ... Tj ... ET` drawing "ANNOTAPSECRET" - unlike the *existing* corpus's `freetext-annotation.pdf`
(RED-01), which has no `/AP` at all and only puts its secret in `/Contents` (annotation metadata, never
rendered), so it never had any show-text op to find in the first place. This fixture is the first one
that actually exercises a rendered annotation appearance stream. Raw 1 = pdf.js 1 - again, only the
keep text on both sides.

**Why:** `align.mjs`'s `pdfjsShowOps()` hardcodes `annotationMode: pdfjs.AnnotationMode.DISABLE`, and
`rawShowOps()` only ever reads a page's own `Resources()`/`Contents()`, never `Annots()`. Re-running the
same file with `AnnotationMode.ENABLE` (outside align.mjs, as an independent check) does surface a
second `showText` op with the exactly correct codes for `ANNOTAPSECRET` - so the text is legitimate,
well-formed, and perfectly parseable; it's excluded by `align.mjs`'s own configuration choice, not
because anything about it is unsupported.

**Measured:** the secret text is invisible to both sides, same shape as the pattern case. **Inferred:**
annotation-appearance text is out of scope for align.mjs *by construction*, and every existing "aligned"
result for an annotation fixture (including RED-01's own `freetext-annotation.pdf`) should be read the
same way - it says nothing about whether appearance-stream text can be found and lined up, only that
none was ever looked for.

## Summary

| # | Case | Result | Silently wrong? |
|---|---|---|---|
| 1 | Type3 font | aligned (real) | no |
| 2 | Embedded non-Identity CMap, mixed 1-/2-byte codespace | **crashes** in `classifyFont()` (reported, but not gracefully) | no - caught by the outer try/catch |
| 3 | Inline image, "EI" inside the data | **reported FAILS** (op-count mismatch) | no, but the raw side's correctness here is luck, not a guarantee |
| 4 | Form XObject nested 2 deep | aligned (real) | no |
| 5 | Form XObject nested 3 deep | aligned (real) | no |
| 6 | Same Form XObject drawn twice | aligned (real) | no |
| 7 | Text inside a tiling pattern | aligned (**vacuous** - out of scope both sides) | no, but nothing is ever checked |
| 8 | Text in an annotation appearance stream | aligned (**vacuous** - out of scope both sides) | no, but nothing is ever checked |

**What was measured:** every file opens and renders in pdf.js without a thrown error. Of the eight
constructs, three (Type3, both nesting depths, the doubled form) align exactly with codes verified
byte-for-byte against what was written. Two (the pattern and the annotation appearance stream) produce
numerically equal counts, but only because the secret text is excluded from analysis on both sides -
not because either side correctly processed it. One (the embedded CMap) crashes align.mjs's own code
on a spec-legal, real-world-plausible construct, one step before the `unsupported cmap` message that
was clearly meant to handle exactly this case. One (the inline-image "EI" trap) produces a caught,
correctly-reported mismatch, but the investigation shows *why*: the trap fools pdf.js's own operator-list
builder (which then silently truncates the page's ops) and it fools align.mjs's raw tokenizer too - the
raw side only happens to land on the right answer afterward because its resulting garbage tokens don't
collide with anything meaningful, not because the heuristic is sound.

**What was inferred:** no case here is "silently wrong" in the sense the brief was most worried about -
looks-aligned-but-codes-are-actually-wrong never happened. But "not silently wrong" undersells two of
the eight results: the pattern and annotation-appearance cases pass *only* because they're invisible to
the tool, which for a true redaction feature is a coverage gap at least as dangerous as a wrong-looking
alignment, since nothing here would ever flag that such text exists. Before this logic is reused for
real redaction, three things need attention: (1) `classifyFont()` must not assume `/Encoding` is always
a `PDFName`; (2) inline images without `/L` need either an exact length computed from their image
parameters or must be treated as unsupported outright, since the EI-scan heuristic is shared, fragile
guesswork on both sides; (3) tiling patterns and annotation appearance streams are entirely unaddressed
today and would need their own explicit walk (not just a wider `AnnotationMode`) before any tool could
claim to redact text painted through them.
