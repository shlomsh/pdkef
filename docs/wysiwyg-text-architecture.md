# WYSIWYG text: what pdkef can promise

The architecture record for the Sign tool's text pipeline. Opened 2026-08-27 to answer one question:
**two rendering engines draw the same text and nothing structurally guarantees they agree - what should
pdkef commit to instead, given it can never run a server?**

It is a companion to **[hebrew-text-shaping-export.md](./hebrew-text-shaping-export.md)**, which owns the
five-stage model and the per-defect measurements. That document is now stale in three places; §1.2 below
says exactly where, and this document supersedes it on current state.

The task breakdown lives in **[TODO.md](../TODO.md)**, under "WYSIWYG text: what the two engines actually
guarantee", as W1 through W9. §8 here is the same plan with the reasoning attached; the two are numbered
identically on purpose, because a plan in two places that drift is the failure this repo already had once
with `scrum-board.data.js`.

---

## The answer in one paragraph

The editor paints HTML through Chrome. The exporter draws with fontkit. Under the three product
constraints (one font face per element, coverage-based selection, error while typing), **four of the five
text stages become structural - either one implementation used by both sides, or a refusal.** The fifth,
shaping, cannot. Shaping is where the two engines are two engines, and the only way to make *that*
structural is to stop having two of them: paint the editor from the exporter's own shaper. Everything
else is agreement by discipline, proven per font, per script, forever - and §1.3 shows that discipline is
already not being sustained: **five of the seven shipped scripts have no agreement proof at all,
including Latin, the one that carries people's names.**

---

# 1. The honest current-state map

Every claim in this section was read from the code or measured on 2026-08-27, not taken from prose.

## 1.1 The five stages, on each side

| # | stage | editor (Chrome) | exporter | one implementation? |
|---|---|---|---|---|
| 1 | Normalization | Chrome + its HarfBuzz | `composeHebrewClusters` ([hebrewComposition.js:105](../src/lib/hebrewComposition.js#L105)): `NFC` then Hebrew presentation-form recomposition, gated on `hasGlyph` | **no** - two implementations, agreement measured for Hebrew only |
| 2 | Bidi (UAX#9) | Chrome (ICU), paragraph direction pinned by `dir` ([TextNode.tsx:110,173](../src/components/SignTool/nodes/TextNode.tsx#L110)) | `resolveBidiRuns` ([bidiRuns.js:73](../src/lib/bidiRuns.js#L73)) via `bidi-js`, same paragraph direction from `getEffectiveTextDirection` | **no**, but both implement one published spec against the same explicit paragraph level |
| 3 | Itemization | Chrome, **per character**, into *system* fonts we cannot embed | element-level only: `resolveFontFamily` ([text.ts:383](../src/editor/registry/text.ts#L383)), then refuse ([sign.js:112](../src/lib/sign.js#L112)) | **yes, by refusal** - the two can only agree or stop |
| 4 | Shaping | Chrome's HarfBuzz, segmented word-by-word by Blink's ShapeCache | fontkit `layout()` per bidi run, then per whitespace segment (`toShapingSegments`, [text.ts:237](../src/editor/registry/text.ts#L237)) | **no** - two independent shapers, and this is the open problem |
| 5 | Positioning | Chrome | `drawShapedRun`, one `Tm`+`Tj` per glyph, `Ts` for vertical offset ([text.ts:263](../src/editor/registry/text.ts#L263)) | ours alone; nothing to disagree with |

Two things sit outside the table and matter:

- **`stripInvisibleFormatting`** ([text.ts:85](../src/editor/registry/text.ts#L85)) runs *after* bidi;
  `normalizeTabsForBidi` ([text.ts:106](../src/editor/registry/text.ts#L106)) runs before. That split is
  load-bearing and documented in place.
- **Comb fields skip stage 2 deliberately** ([text.ts:394-427](../src/editor/registry/text.ts#L394)):
  each cell is one grapheme cluster placed by cell index, so there is no run order to resolve.

There is also **no line-breaking stage on either side**, and that is a real simplification rather than a
gap: `.text-input, .text-measure` carry `white-space: pre`
([EditorElement.module.css:25](../src/components/SignTool/EditorElement.module.css#L25)), so a text
element never soft-wraps. Lines exist only where the user pressed Enter. UAX#14 is not in the divergence
surface and does not need to be.

## 1.2 Where the existing prose is wrong

Four claims, each of which was in a file an agent is told to trust. **The first two were corrected in the
same change that added this document**; the third is left stale deliberately, and the fourth is in the
brief that commissioned this work.

1. **`CLAUDE.md` said the export "has no normalization stage ... no bidi stage ... and only a
   per-element itemization stage (so Arabic, Thai and emoji export as nothing at all)".** All three
   clauses were stale. Normalization landed in `461bcdb` (H7). Bidi landed in `f10af8e` (H6, 2026-08-23) -
   `resolveBidiRuns` is imported at [text.ts:25](../src/editor/registry/text.ts#L25) and called at
   [text.ts:454](../src/editor/registry/text.ts#L454). Arabic and Thai now have bundled faces (Almarai,
   Mali) and routing rows; nothing exports as nothing, because `findUnrepresentableCharacters` refuses
   first. **Fixed 2026-08-27**, and the replacement carries the rule the old text was missing: having all
   five stages is not agreement.
2. **`TODO.md`'s stage table marked layer 2 "no" and its H6 entry was still open**, four days after
   `f10af8e` shipped it - the commit whose own message says so. **Fixed 2026-08-27**; H6 is struck through
   with what actually landed.
3. **`docs/hebrew-text-shaping-export.md` headers still say layers 1, 2 and 3 are open** (lines 330, 475,
   601) and its opening table marks 1 and 2 "no". All three shipped. Its line 235 also says
   `HEBREW_CAPABLE_FONTS` is "six since 2026-08-23"; it is seven - Alef was added
   ([fonts.js:84](../src/lib/fonts.js#L84)). **Left as written on purpose**, the way that document
   already keeps its three superseded "why not" sections: it is a reasoning trail dated to when it was
   taken, and this document is the current-state record. `TODO.md`'s design-record index says so, so a
   reader arrives forewarned rather than misled.
4. **The task brief's own two claims about guard gaps are also stale in one direction and understated in
   the other.** `assertNotSubsetEmbedded`'s throw path *does* have a test
   ([textShaping.test.js:113](../src/editor/registry/textShaping.test.js#L113)), which embeds a real
   subset font and asserts the throw. And "no existing test measures exported PDF bytes" is not quite
   right either: `sign.test.js` parses the produced blob with pdf.js and reads its text items
   ([sign.test.js:39-51](../src/lib/sign.test.js#L39)). What was genuinely true when this was written was
   **nothing renders the produced PDF and looks at the ink** - closed 2026-08-27 (W1) by
   `e2e/sign/export-render-guard.spec.js`; see §8 Stage 1.

## 1.3 The guard map, and the reason it is the strongest argument in this document

Under the product constraints, a `(family, script)` pair is drawable if and only if that font file
covers that script. The reachable pairs, measured against the real asset bytes, and what proves each one
agrees with the browser:

| script | families that can draw it | agreement proof today |
|---|---|---|
| **Latin** | all 16 | **none** |
| Hebrew | Arimo, Tinos, Cousine, Assistant, Heebo, Alef, Gveret Levin (7) | Guard A advances (3 strings, browser), Tier 1/2 (full enumerated cluster corpus, unit), Tier 3 (browser order-insensitivity) |
| Arabic + Perso-Arabic | Almarai (1) | 131-case pixel guard vs native Chromium |
| Devanagari | Kalam (1) | 185-case pixel guard vs native Chromium |
| **Thai** | Mali (1) | **none** |
| **Cyrillic** | Arimo, Tinos, Cousine, PT Sans (4) | **none** |
| **Greek** | Arimo, Tinos, Cousine (3) | **none** |

`hebrew-font-parity.spec.js` iterates `HEBREW_CAPABLE_FONTS`, so **Guard A never runs on Caveat, Dancing
Script, Great Vibes, Kalam, Mali, Pacifico, PT Sans, Sacramento or Almarai at all**, on any script.

That would be a footnote if Latin shaping were trivial. It is not, in the fonts that matter most here.
Measured 2026-08-27 by comparing `font.layout()`'s glyph ids against a plain per-codepoint cmap lookup,
over ordinary names:

| font | contextual substitution fires on |
|---|---|
| **Pacifico** | `Sarah Levi`, `William Nnamdi`, `Anna-Maria`, `David Cohen`, `Shlomi Shahar` - every sample |
| **Caveat** | `William Nnamdi`, `Anna-Maria`, `Shlomi Shahar` |
| **Great Vibes** | `David Cohen` |
| **Dancing Script** | `William Nnamdi` |
| every other bundled face | no contextual substitution on these samples |

Those four carry `calt`. **`calt` resolved differently by fontkit and HarfBuzz is the exact, sole reason
Playpen Sans Hebrew was dropped from the catalogue** - and these four are the signature faces, drawing
the one string a signing tool exists to draw. Whether they diverge is *unknown*, because the test that
found it in Playpen has never been run on them.

One correction worth recording, because the first measurement said otherwise: **Gveret Levin's `calt`
does not fire on Hebrew.** A naive comparison against un-reversed cmap lookups makes every RTL string
look like it was contextually substituted. Compared against *reversed* cmap output, all seven
Hebrew-capable faces come out as plain cmap, Gveret Levin included. Its `calt` does not fire on Latin
either. The design record's standing note that "Gveret Levin reads 0/25 and still deserves a glyph-level
check" is now answered: there is nothing contextual there to check.

**The conclusion this table supports:** the per-font-empirical-proof model is not failing through
negligence. It is failing because the cost per `(font, script)` pair is high enough that it only ever
gets paid for a script that visibly broke. Five of seven shipped scripts have no proof; the two that do
are the two that produced bug reports.

## 1.4 Two divergences that live outside the five stages

Both are font *selection*, above stage 1, and no existing guard can see either.

### Synthetic bold and italic

`ElementToolbar.tsx` offers Bold and Italic unconditionally on every family
([lines 63-77](../src/components/ElementToolbar.tsx#L63)). Eight handwriting families ship Regular only
(Caveat, Dancing Script, Great Vibes, Gveret Levin, Kalam, Mali, Pacifico, Sacramento), and Assistant,
Heebo, Alef and Almarai have no Italic. With only a 400/normal `@font-face` declared, the browser
**synthesises** the missing style (`font-synthesis` defaults to `auto`). The export does the opposite:
`loadCustomFont` requests `Caveat-Bold.ttf`, gets a 404, and falls back to `Caveat-Regular.ttf`
([sign.js:99-101](../src/lib/sign.js#L99)).

So **bold Caveat is bold on screen and upright in the download.** This is tested - as a fallback that
should not throw ([sign.test.js:132](../src/lib/sign.test.js#L132)) - but the divergence it creates is
not acknowledged anywhere. It is the same failure shape as everything in the design record: correct on
screen, wrong in the file, invisible until after the document is signed.

**Decided (2026-08-27): source first, then disable what genuinely does not exist.** Blocking the button
is the correct end state for a family with no real face, but it should not be the *first* move, because
several of the Regular-only families almost certainly publish more weights upstream and we simply never
downloaded the files. §8 stage 4 is that search; stage 5 is the block, and it should only have to cover
what the search could not fill.

The alternative to blocking, faux-styling the PDF (text rendering mode 2 plus a line width for bold, a
shear in the text matrix for italic), keeps the capability and keeps the text as text, but buys a new
parity problem - matching Chrome's synthesis parameters - to preserve an affordance that is currently
lying. Recorded as the reversible follow-up if anyone misses it.

**One thing the search must not treat as a gap:** Hebrew and Arabic do not use italic. Assistant, Heebo,
Alef and Almarai having no Italic file is correct typography, not a missing asset, and the honest
outcome there is to disable the control rather than to go looking for a face that should not exist.

### The NFC seam: a live, measured, silent content loss

`unrepresentableCharacters` checks coverage **after** `stripInvisibleFormatting` and **before**
`composeHebrewClusters` ([text.ts:128-139](../src/editor/registry/text.ts#L128)). But
`composeHebrewClusters` opens with `text.normalize('NFC')`
([hebrewComposition.js:106](../src/lib/hebrewComposition.js#L106)), which is **not** Hebrew-specific -
it composes every canonical sequence in the string. So NFC can produce a codepoint the font lacks,
*after* the check has already passed.

Measured on `main`:

```
text     'שלום ά'   (Hebrew, then Greek alpha + U+0301 combining acute, decomposed)
resolveFontFamily('Heebo', text)   -> 'Heebo'        (Hebrew row matches first; Heebo is Hebrew-capable)
unrepresentableCharacters(Heebo, text) -> []          (Heebo has α and U+0301)
composeHebrewClusters(...)         -> ... U+03AC      (NFC composes them)
Heebo.hasGlyphForCodePoint(0x03AC) -> false
layout()                           -> one glyph id 0  (.notdef)
```

The character the user typed is silently absent from the signed document. That is precisely the outcome
layer 3 exists to make impossible, surviving in the seam between the check and the draw. Narrow (it needs
decomposed input plus a font missing the composed form) but real, and it is not exotic: decomposed Latin
and Greek accents arrive routinely from macOS filesystem paths and from some IMEs.

The mirror case is a false refusal. Alef has no glyph for U+FB1D, Assistant none for U+FB1D/FB4C/FB4D/
FB4E, but both have the decompositions. A pasted U+FB1D is refused today, while the drawing path would
have decomposed it under NFC and drawn it correctly.

**Both have one root cause and one fix: coverage must be judged against the string that reaches
`layout()`, never the string that was typed.** §3.1 makes that part of the rule.

**Closed 2026-08-27 (W2).** `unrepresentableCharacters` in `src/editor/registry/text.ts` now splits on
`/\r?\n/` and judges each line as `composeHebrewClusters(stripInvisibleFormatting(line),
thisFontsHasGlyph)` - the same string `layout()` receives. The measurement above still stands as the
reproduction that motivated the fix: `שלום ά` in Heebo now reports `[U+03AC]` instead of `[]`, and the
mirror case, pasted U+FB1D in Alef, now reports `[]` instead of a refusal. Tests live in
`src/editor/registry/textShaping.test.js` ("the normalization seam") and `src/lib/textCoverage.test.js`
("the normalization seam, at policy level"), both directions, both against the real font bytes. See
§8 Stage 2 and `TODO.md`'s W2 entry for the full record, including the note that 'יִ' will not reproduce
the false-refusal case - `String.fromCodePoint(0xfb1d)` is required.

## 1.5 The app already ships the opposite answer, on purpose

A typed signature is not text. `SignatureDialog.tsx` renders the typed name to a canvas with
`ctx.fillText` and stores a PNG ([line 308](../src/components/SignatureDialog.tsx#L308)); the signature
element embeds that image ([signature.ts](../src/editor/registry/signature.ts)).

That is the rasterisation option, taken deliberately, in the one place where losing selectability,
search and copy is acceptable because a signature is a mark rather than words. It is worth naming because
**it is the only path in the app where WYSIWYG is structurally guaranteed today** - the output *is* the
browser's own rendering - and it shows the price exactly: perfect fidelity, no text.

---

# 2. What the competitor study settles

The Sejda comparison is in the task brief and is not re-derived here. Two conclusions carry into the
design.

**Itemization is not what makes a server-side tool work.** Sejda splits one element across four embedded
fonts and still gets RTL word order wrong in two of three passes, still breaks the U+0671 join, still
gives Arabic harakat nonzero advances, and still returns presentation forms from its ToUnicode. pdkef's
ligature formation, mark positioning, bidi and ToUnicode all beat it. Their pipeline is not a target.

**The two products fail in opposite directions, and the difference is the product.** pdkef **fails
safe**: 14 of 17 strings export correctly and the other 3 are refused whole, never partially written
([sign.js:112-113](../src/lib/sign.js#L112) runs before the loop touches `pdfDoc` at all). Sejda **fails
silent**: it draws the mixed-script line pdkef refuses, and it draws `שלום עולם` as `עולם שלום` without
telling anyone. For a document someone signs, those are not two points on one scale. A refusal costs a
user five minutes. A silent reordering changes what the document says.

**Everything below is in service of keeping the fail-safe property while shrinking the set of things that
have to be refused.** That is the whole design problem, stated once.

---

# 3. The selection rule

Replaces `resolveFontSubstitution` ([fonts.js:263](../src/lib/fonts.js#L263)). The product constraints
are fixed: one font face per element, coverage-based selection, error as early as possible.

## 3.1 What "covers" means, precisely

> A family **covers** an element when, for the exact string that will be handed to `layout()`, every
> codepoint has a glyph in the file that will be embedded.

Three clauses, each of which is doing work.

**"the exact string that will be handed to `layout()`"** - not the typed text. The export path
transforms it, in this order, and coverage must be evaluated at the end:

1. split on `\r?\n`, or for a comb, `combCharacters()` sliced to `combCellCount()`
2. `normalizeTabsForBidi` (TAB becomes a space)
3. `resolveBidiRuns` (splits and reorders; changes no characters)
4. `stripInvisibleFormatting` per run (removes `\p{Cc}`/`\p{Cf}`)
5. `composeHebrewClusters` (**NFC**, then presentation-form recomposition gated on `hasGlyph`)

Step 5 is the one today's check skips, and §1.4 is the bug that follows. Note that the gate inside step 5
means composition can never *introduce* a missing glyph - but the NFC call before it can, and does.

**"has a glyph"** - `hasGlyphForCodePoint`, never `layout()`-and-count-`.notdef`. fontkit caches glyph
objects by id, so a font instance has exactly one `.notdef` object carrying whatever `codePoints` were
set when it was first created; the count is reliable and the identity is not. This is already the
precedent in `fontCoverage.test.js` and the reasoning is preserved in `unrepresentableCharacters`' doc
comment.

**"the file that will be embedded"** - `(family, weight, style)`, not family. See §3.4.

One thing coverage deliberately does **not** claim: that the glyph is the *right* glyph. GSUB runs after
this check and can substitute, ligate or decompose. Coverage is a necessary condition for the text to
appear at all. It is not sufficient for the text to appear correctly, which is the whole of §5.

## 3.2 The rule

```
resolveFont(requested, weight, style, text) ->
  { family, requested, reason }

1. requested := RETIRED_FONTS[requested] ?? requested ?? DEFAULT_FAMILY
2. lookupText := the step-5 string above, computed with `requested`'s own hasGlyph
3. if covers(requested, weight, style, lookupText):  return { family: requested, reason: null }
4. candidates := every catalogue family that covers lookupText with a real (weight, style) file,
                 ordered by:
                    a. same style tag as `requested`   (handwriting / sans / serif / mono)
                    b. same class as `requested`       (handwriting vs upright)
                    c. catalogue order
   if candidates is non-empty:  return { family: candidates[0], reason: <what requested could not draw> }
5. return { family: requested, reason: 'uncovered', missing: <the characters no family covers> }
```

Step 5 keeps the requested family rather than substituting something arbitrary, so the editor keeps
rendering what the user picked while the live notice names what will stop the download. `signPdf`'s
refusal is unchanged and remains the backstop.

**Step 2 has a subtlety worth stating rather than discovering.** The composition step is gated on the
font's own glyph set, so `lookupText` is different per candidate font. Computing it once against
`requested` and reusing it for every candidate would judge candidates against the wrong string. Compute
it per candidate. There are 16 candidates and the string is short; this is a non-issue for cost and a
correctness trap if skipped.

## 3.3 Preserving a font's character

A coverage-first rule can silently move someone from a signature face to a text face, and the catalogue
already knows the difference: `HANDWRITING_FONTS` and `TEXT_FONTS`
([fonts.js:18-19](../src/lib/fonts.js#L18)). That two-bucket split is what `SCRIPT_FALLBACKS`' per-row
`handwriting`/`text` pair encodes today, once per script, by hand.

The rule above generalises it with **one new field per catalogue entry: a style tag.** Today that is
`handwriting` for eight families, `sans` for Arimo/Assistant/Heebo/Alef/PT Sans/Almarai, `serif` for
Tinos, `mono` for Cousine. It changes nothing right now, because Tinos and Cousine have no same-tag
alternative - which is exactly the point. It makes the rule *right* rather than accidentally right, and
it degrades gracefully the day a second serif or a second Hebrew handwriting face is added.

**What the rule cannot promise, and should say so:** substitution preserves character only to the
granularity the catalogue has alternatives for. Cyrillic and Greek have no handwriting-capable face at
all, so a handwriting request carrying either resolves to an upright one. That is the honest best
available, it is what happens today, and it is why an upright Devanagari and Thai text face is on the
backlog.

## 3.4 Weight and style are part of the rule

Following §1.4's decision. `covers()` takes `(family, weight, style)` and is false when the file does not
exist - and the picker must reflect it, so Bold and Italic are unavailable on a family with no such face
rather than silently downgraded at save time.

This deliberately does **not** substitute to another family for a missing weight. As the catalogue stands
no bundled handwriting family has a Bold, so "bold Caveat" would become "bold Arimo", losing the
handwriting character entirely to honour a checkbox. Disabling is the smaller lie - **and the right
first move is to shrink how often it has to happen**, which is why sourcing the missing faces (§8 stage
4) is a task in its own right and lands before the block.

The rule also makes weight and style a **catalogue admission criterion** rather than an afterthought: a
new family that ships all four faces is worth more than one that ships one, and where two candidates are
otherwise comparable, that should decide between them. `HANDWRITING_FONTS` currently reads as eight
equal choices when it is really eight Regular-only choices, and nothing in the picker or the catalogue
says so.

## 3.5 The explained-substitution guarantee still holds, and gets sharper

`resolveFontSubstitution`'s contract is that a substitution is explained, never silent, because the font
visibly changes under the user as they type. That survives, and the message improves.

Today `describeFontSubstitution` says *"Arimo has no Hebrew letters"* - a script-level claim derived from
which row matched. Its own doc comment admits the claim is briefly false on mixed-script text. Under a
coverage rule the notice can say what is actually true: **which characters the requested family could not
draw**. Same shape, no approximation, and it stops being wrong on the mixed case.

The two-layer guarantee (live notice while typing via `useFontCoverageNotice`, refusal at save via
`signPdf`) is unchanged. Both continue to run one policy through
`findUnrepresentableCharacters`, which is what keeps them from disagreeing.

## 3.6 What the rule changes, case by case

Measured against the real coverage matrix (§4.1). The row-order accident in
[fonts.js:266](../src/lib/fonts.js#L266) - `SCRIPT_FALLBACKS.find`, first match wins - is what changes.

| typed | requested | today | under the rule |
|---|---|---|---|
| `שלום Hello مرحبا` (C2) | any | **refused**, because Hebrew is row 1 and Hebrew-capable fonts have no Arabic | **refused**, because genuinely no bundled family covers Hebrew + Arabic. Same outcome, honest reason, and it becomes a catalogue question |
| `שלום Привіт` | Heebo | **refused** - Hebrew row matches, Heebo is Hebrew-capable, so no substitution happens, and Heebo has no Cyrillic | **drawn in Arimo**, which covers both. Substitution explained |
| `שלום Привіт` | Gveret Levin | **refused**, same mechanism | **drawn in Arimo**, with the notice saying the handwriting face could not draw the Cyrillic |
| `שלום ά` (decomposed) | Heebo | **silently loses one character** (§1.4) | **drawn in Arimo**, which has U+03AC |
| `Ω` in an otherwise-Latin box | Heebo | substituted to Arimo by the Greek row, which happens to be right | substituted to Arimo because Heebo genuinely lacks it - Heebo's Greek coverage is partial, and the row-level `capable` list cannot express that |
| `שלום` + Thai | any | refused (Hebrew row wins, Thai unrepresentable) | refused (no family covers both) |
| bold `Signed` | Caveat | **exports upright**, silently | Bold unavailable on Caveat, with a reason |

The rule **widens** what works and narrows nothing. Every case it turns from a refusal into a
substitution is one where a covering font was already bundled and the row ordering was the only thing in
the way.

---

# 4. Can any font cover the multi-script cases?

## 4.1 The measured matrix

Every bundled `-Regular.ttf`, probed with `hasGlyphForCodePoint` on 2026-08-27. `Y` = every probe
codepoint present; `.` = none; a fraction = partial.

| family | Latin | Lat-Ext | Hebrew | Nikud | Arabic | Perso-Ar | Cyrillic | Greek | Deva | Thai | CJK | Kana | Emoji |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Arimo | Y | Y | Y | Y | . | . | Y | Y | . | . | . | . | . |
| Tinos | Y | Y | Y | Y | . | . | Y | Y | . | . | . | . | . |
| Cousine | Y | Y | Y | Y | . | . | Y | Y | . | . | . | . | . |
| Assistant | Y | 3/4 | Y | Y | . | . | . | . | . | . | . | . | . |
| Heebo | Y | Y | Y | Y | . | . | . | 1/4 | . | . | . | . | . |
| Alef | Y | Y | Y | Y | . | . | . | . | . | . | . | . | . |
| Gveret Levin | Y | . | Y | Y | . | . | . | . | . | . | . | . | . |
| PT Sans | Y | Y | . | . | . | . | Y | 1/4 | . | . | . | . | . |
| Almarai | Y | 1/4 | . | . | Y | Y | . | . | . | . | . | . | . |
| Kalam | Y | Y | . | . | . | . | . | . | Y | . | . | . | . |
| Mali | Y | Y | . | . | . | . | . | 1/4 | . | Y | . | . | . |
| Caveat, Dancing Script, Great Vibes, Pacifico, Sacramento | Y | 1/4 | . | . | . | . | . | . | . | . | . | . | . |

Reading the combinations the question actually asks about:

| combination | covered by | verdict |
|---|---|---|
| Hebrew + Latin | Arimo, Tinos, Cousine, Assistant, Heebo, Alef, Gveret Levin | **yes, 7 ways, one of them handwriting** |
| Arabic + Latin | Almarai | **yes, one way, upright only** |
| Cyrillic + Latin | Arimo, Tinos, Cousine, PT Sans | yes |
| Greek + Latin | Arimo, Tinos, Cousine | yes |
| Hebrew + Cyrillic (+ Latin) | Arimo, Tinos, Cousine | **yes - today refused whenever the picked font is Heebo, Assistant, Alef or Gveret Levin** |
| Hebrew + Greek (+ Latin) | Arimo, Tinos, Cousine | yes, same |
| **Hebrew + Arabic** | nothing | **no** |
| **CJK + anything** | nothing | **no** |
| Emoji + anything | nothing | no |
| Devanagari or Thai + anything but Latin | nothing | no |

Arabic-Indic and Extended Arabic-Indic digits are Almarai-only, which is consistent: an Arabic document
containing them already resolves there.

## 4.2 The shape of the answer for the uncovered ones

Not a font-shopping exercise. The question and its shape only.

**Hebrew + Arabic (the C2 case).** This is the one combination where a single face plausibly exists and
would immediately unlock a real use case in this app's own country. The realistic candidates are the
handful of pan-script text faces that carry both blocks in one file; DejaVu Sans is the obvious one, and
notably it is what Sejda embeds as its Latin fallback. **The blocker to check first is licensing, not
coverage**: every bundled face today is OFL or Apache-2.0, and DejaVu's Bitstream Vera derived licence is
permissive but is neither. Noto is script-split by design and therefore not a candidate however good it
is. So: *is there an OFL or Apache-2.0 face carrying both Hebrew and Arabic in one file, of acceptable
quality?* That is one afternoon of screening, and the existing pre-screen plus the Arabic and Hebrew
guard harnesses already exist to judge the answer.

**CJK.** Not a coverage question, a size and subsetting question, and TODO.md already has the answer
(build-time `pyftsubset`, not the runtime subsetter). Note that TODO's diagnosis of *why* the runtime
subsetter fails - CFF outlines and variable builds - is wrong: the brief records that the corruption
reproduces on a static, `glyf`-only, non-variable font. The recommendation survives; the reason does not.
Treat the confident claims around it with the same suspicion.

**Emoji.** A different problem entirely (`COLR`/`CBDT` colour formats, which pdf-lib's outline embedder
has no path to) and it should not inherit CJK's answer. The app already knows how to embed an image.

**A note on cost that changes the calculus.** Fonts are `@font-face` declarations in `global.css` with no
`font-display` and no preload, so a browser fetches a TTF only when a rule actually matches text.
Bundling a font therefore costs **zero page weight** on every page including `/sign/`, and costs real
bytes only to the user who picks it. `check-page-weight.js` counts `/_astro/*.js` referenced from the
HTML and eagerly-referenced images; it would not see a new font at all. Adding a face is a repo-size and
a curation decision, not a performance one.

---

# 5. Coverage is necessary, not sufficient

Constraint 1 guarantees the same font *file* on both sides. It does not guarantee the same output from
it. Five options, evaluated on the same axes.

## Option 1 - Status quo: prove agreement per font, per script, forever

**Structural or discipline:** discipline, entirely. Nothing prevents a divergence; a guard detects it if
someone wrote that guard.

**What it fixes:** nothing by itself. It detects.

**Cost:** the honest number is in §1.3. The Arabic guard is 131 generated cases plus a calibration
exercise; Devanagari is 185; both took a session each even after the shared harness removed ~265 lines of
Playwright boilerplate. Five of seven shipped scripts never got one. Every new font multiplies by every
script it covers.

**Which scripts it keeps out of reach:** none, strictly. It keeps them *expensive*. The practical effect
is that the guard gets written after a bug report, which means the first users of a script are the guard.

**Incremental:** maximally. It is already the model.

**The specific hole it leaves open right now:** Latin in Pacifico, Caveat, Great Vibes and Dancing
Script. Those four apply contextual substitution to ordinary names, in the four faces most likely to
carry a real signature, and nothing has ever compared them against the browser.

## Option 2 - Export becomes authoritative; the editor previews it

Paint the text element from the exporter's own shaped output: `fk.layout()`, then `glyph.path.toSVG()`
into a `Path2D` on a canvas (or an SVG layer) at the shaped positions. The `<textarea>` stays, its text
set transparent, as the input and accessibility layer.

**Structural or discipline: structural.** Stages 1 through 5 have exactly one implementation each, used
by both sides. Divergence between Chrome and fontkit stops being a correctness bug and becomes an
aesthetic question - "does our rendering look like the browser's" - which is a judgment call, not a
silent lie in a signed document.

**Feasibility is not speculative.** `e2e/sign/fixtures/shapingGuardHarness.js` already does exactly this
reconstruction, in the browser, and pixel-diffs it against native `fillText`. And `TextNode` already
ships the layering pattern: comb mode stacks a per-cell display layer over the textarea, sets
`color: 'transparent'` and keeps `caretColor`
([TextNode.tsx:193-194](../src/components/SignTool/nodes/TextNode.tsx#L193)).

**What it costs, plainly:**

- **Caret and selection geometry still come from the textarea**, which is browser-shaped. They drift from
  the painted glyphs by exactly the divergence magnitude. Today that is 0.0% on six of seven Hebrew
  fonts. It is not zero on the `calt` faces. Drawing our own caret would fix it and is not worth it: it
  costs IME preview positioning and caret accessibility to buy sub-pixel alignment.
- **IME composition.** While a composition session is open the textarea shows in-progress text the model
  has not seen. The painted layer must either render it too or step aside. Simplest honest answer: fall
  back to browser-rendered text for the duration of the composition and repaint on `compositionend`.
  Relevant to Devanagari and Thai; not to Hebrew, Arabic or Latin.
- **Intrinsic sizing moves.** `.text-measure` currently sizes the box from browser-shaped HTML
  ([TextNode.tsx:105-125](../src/components/SignTool/nodes/TextNode.tsx#L105)); it would have to size
  from `shapedWidth`. That is the change with the most knock-on surface: RTL anchoring, the comb width
  floor, resize. Contained, but not small.
- **Accessibility: unchanged.** The textarea still holds the text and is what a screen reader reads. The
  painted layer is `aria-hidden`.
- **Selection highlight:** the textarea's `::selection` paints behind transparent text, so a highlight
  rectangle still appears, in roughly the right place, off by the same drift.
- **Bundle:** zero. fontkit is already loaded in the editor
  ([liveFontCoverage.js:51](../src/lib/liveFontCoverage.js#L51)) and already 214,606 brotli bytes in a
  lazy chunk.
- **Per-keystroke shaping:** fontkit `layout()` on a short string is microseconds and the gesture golden
  rule does not apply (typing is not a pointer gesture). Must not reshape during drag.

**Stages fixed:** all five, in the sense that matters - they stop being two implementations.
**Stages left open:** none for agreement. It fixes nothing about whether our rendering is *good*.

**Incremental:** yes. Landable per element type behind a flag, revertible by deleting the paint layer and
un-hiding the textarea's text.

**Shipped scripts:** all seven benefit immediately, and the per-script agreement guards become optional
quality checks rather than correctness gates. **Blocked scripts:** unchanged - this is orthogonal to CJK
and emoji.

### Option 2b - the same idea via re-export

Instead of painting from fontkit, run `signPdf` on a debounce and render the produced page with pdf.js.
The preview then *is* the export, with no second renderer written at all. TODO.md already proposes
exactly this pattern for Redact's delete mode, for exactly this reason ("this reuses the export code
path, so preview and download cannot drift apart"), including the stale-generation guard it needs.

Heavier (a full document round-trip per edit rather than one element's glyphs) and it puts pdf.js's
rasteriser in the loop, but it writes no new rendering code and it is the strongest possible form of the
guarantee. Worth considering as the implementation of Option 2 rather than as a separate option.

## Option 3 - Browser becomes authoritative; the export follows it

**This is not possible, and it collapses into an option already ruled out.**

A PDF text run needs glyph IDs. No browser API produces one. `measureText` gives advances.
`TextMetrics` carries no glyph data. SVG's `getStartPositionOfChar` / `getExtentOfChar` give *per
character* geometry after shaping, which is a genuine channel, but it tells you **where**, never
**what** - and for a ligature the character-to-glyph mapping is implementation-defined. `document.fonts`
exposes `FontFace` objects, not shaping.

So the browser can be an oracle for geometry and pixels, and never for glyph identity. The only way to
make the browser's rendering authoritative *inside the PDF* is to ship the browser's pixels - which is
rasterisation, permanently ruled out for destroying selection, search, copy and accessibility.

**"Browser authoritative" and "rasterise the text" are the same option, and the decision was already
taken.** §1.5 is that option, taken deliberately, in the one place its price is acceptable.

## Option 4 - One shaper on both sides (HarfBuzz WASM)

**Structural or discipline: neither, quite - and this is the point people miss.**

Shipping HarfBuzz for the export does not give one shaper on both sides. It gives:

- Chrome's HarfBuzz, at Chrome's version, under **Blink's** normalization, itemization and word-by-word
  ShapeCache segmentation, drawing the editor;
- our HarfBuzz, at our version, under **our** normalization, bidi and segmentation, drawing the export;
- **and fontkit as well**, because it cannot be removed: `@cantoo/pdf-lib`'s `CustomFontEmbedder` is
  built on a fontkit instance ([sign.js:74](../src/lib/sign.js#L74) registers it), and every metric,
  cmap lookup and glyph outline in the embedding path comes from it.

So the cost is **additive**, not a swap. For scale, fontkit is 214,606 brotli bytes in the editor's lazy
chunk today; a HarfBuzz WASM build is the same order of magnitude and must be measured before this is
argued either way. It would not register against `check-page-weight.js` (which counts only
`/_astro/*.js` referenced from the HTML; /sign/ is at 44,230 of 48,000), because it would be a runtime
`import()` like pdfjs and fontkit already are. **That budget is therefore not the constraint here, and
saying "it fits the budget" would be true and misleading.** The constraint is bytes to a real user on a
real connection, on top of the ~614KB brotli the editor already lazy-loads.

**Stages fixed: one of five.** The design record's own table is right and worth repeating: HarfBuzz does
not do bidi (it requires the caller to hand it single-direction runs) and does not do font fallback. It
shapes with the font it is given.

**What it would genuinely buy:** the fontkit-versus-HarfBuzz implementation gap, which is the gap that
dropped Playpen Sans Hebrew and is the unmeasured risk in Pacifico, Caveat, Great Vibes and Dancing
Script. That is a real thing to buy. It is just not agreement, and a guard would still be needed for
the version and segmentation gaps.

**A materially better use of the same dependency, and it is already recorded:** HarfBuzz as a **dev
dependency test oracle**. It ships nothing, costs zero page weight, is versioned with the repo and
reproducible in CI, and answers per-glyph parity questions that no shipped guard can. If Option 1 stays,
this is the cheapest thing that makes it less bad.

**Incremental:** all-or-nothing per script, and reversible.

## Option 5 - Move the parity check into the product

Run Guard A live: compare `shapedWidth()` against `ctx.measureText` per line while typing, and warn when
they disagree. Cheap (fontkit is already loaded), no bundle cost, no architectural change.

**Rejected, and the reason is instructive.** Every Hebrew combining mark has `xAdvance` 0 in every
catalogued font, so an advance comparison can read 0.0% agreement with every mark in the string in the
wrong place - which is the state the catalogue was actually in while Guard A was green. Moving a check
that cannot see the defect class closer to the user does not make it see more. Recorded so it is not
proposed again as the cheap option.

---

# 6. Recommendation

Two things, and only the second is a genuine choice.

## 6.1 Not a choice: the selection rule and the two bugs it exposes

**Adopt §3's coverage-first rule.** It is the direct expression of the product constraints, it converts
a permanent architectural wall (C2 fails because Hebrew is row 1) into a catalogue question (C2 fails
because no bundled face covers Hebrew and Arabic), it widens what works and narrows nothing, and it makes
the substitution notice true instead of approximate.

Doing it correctly requires fixing the NFC seam (§1.4) - not as a bonus, but because the rule cannot be
stated without deciding what string coverage is judged against, and the moment you state it correctly,
the current behaviour is a bug. Same for weight and style (§3.4).

**What this alone buys:** stage 3 of the pipeline, itemization, becomes structural. Every element
either has one font that can draw all of it, or is refused. The `.notdef` cannot happen, including
through the NFC seam. That is a complete, provable clause, and it is most of the "faithful or refused"
promise.

## 6.2 The choice: what underwrites stage 4, shaping

**Resolved 2026-08-27, by the repo owner. Option A - keep two engines, harden the guards - is chosen.**
Option 2 (paint the editor from the exporter's own shaper) is not rejected on its merits; it stays
recorded below as future backlog, to be revisited if the evidence changes (see the note at the end of
this section for what would justify that).

The two options, as they were put to the owner:

- **Option 1 + HarfBuzz as a dev oracle.** Keep two engines, keep proving agreement per font per script,
  and make the proof cheaper. Cost: §1.3's table stays the shape it is. Latin in the four `calt` faces
  needs a guard now, and Thai, Cyrillic and Greek need one eventually. The promise stays "faithful or
  refused", underwritten by discipline.
- **Option 2 (in either form).** One shaper, both sides, structurally. Cost: caret and selection drift,
  an IME fallback, and moving intrinsic sizing off the browser. The promise becomes "what you see is what
  we drew", underwritten by construction.

This document's own recommendation, stated above before the decision was made, was Option 2, staged
last: the empirical-proof model is not being sustained, and the place it is least sustained is the
signature faces drawing people's names. That argument was heard. It was not the deciding one, because it
weighs the two options as if either could be the final answer for what this document's own §1 opens
with: a general text editor. This is not that. The owner's own framing:

> "this is a form filling and signing app, not a freeform paint tool"

A form field and a signature line are short, known strings, mostly the user's own name and the words of
a consent form, not arbitrary prose in an arbitrary font. The product's shape outweighs the elegance
argument for Option 2, and the owner said so directly - the bar for "harden what exists" is lower than
the bar for "make agreement structural," on what this app actually asks text to do.

**What "harden the guards" means here, and it is deliberately proportionate:** a few simple tests, not a
new dependency and not an architectural change. Concretely, that is stage 9 as rewritten in §8 below -
using the harness this repo already has, `e2e/sign/fixtures/shapingGuardHarness.js`, which already does
per-script pixel parity in a browser at no new dependency cost. The `harfbuzzjs` devDependency oracle
from Option 1's write-up above was considered and **not** adopted; it is recorded as available, not
chosen, because the existing harness already answers the question it would answer, for the one cost the
owner asked to pay.

**The acceptance criterion changes as a direct consequence, and this is the part worth stating
precisely.** It is no longer "pixel parity with the browser." It is **no wrong letterforms and no
missing text**. A small measured divergence in placement is acceptable; a *glyph-level* difference is
not. That is exactly the line the Playpen Sans Hebrew removal already drew: Playpen was dropped because
fontkit and HarfBuzz chose different letterforms from its `calt`, not because it was a couple of pixels
off. Under this decision, a face that is slightly off in placement stays in the catalogue; a face that
draws different letters does not. §1.3's guard map stays a correctness obligation under this criterion,
not a quality dashboard - that demotion was Option 2's consequence (§6.3, §9 guardrail 6), and Option 2
was not taken.

**What would justify reopening Option 2:** evidence that changes the shape of the risk above, for
example a bundled face that turns out to draw genuinely different letterforms between fontkit and
HarfBuzz (a real Playpen repeat) and that the catalogue wants to keep anyway rather than drop, so the
disagreement has to be resolved structurally instead of by curation. Absent that, Option 2 stays
recorded, not scheduled.

## 6.3 What the recommendation does not fix

**This section describes Option 2, which was not chosen (§6.2) - moot for now, kept because it is part
of the reasoning trail and because Option 2 remains backlog.**

Stated plainly, because each of these will otherwise be discovered later and read as a regression.

- **It does not make the export *correct*, only *consistent with the preview*.** If fontkit walks
  Pacifico's `calt` differently from HarfBuzz, Option 2 makes both sides agree - on the letterforms a
  HarfBuzz-based browser would not have chosen. The catalogue curation rule is still needed; its
  criterion changes from "does the export match the editor" to "does our rendering look right", which is
  a human judgment on a sample rather than an automatable gate.
- **It does not extend coverage.** CJK, emoji, Bengali, Tamil, Telugu are exactly where they were.
- **It does not close the extraction question.** See §7.
- **It does not remove the need for per-script correctness work.** Devanagari's conjuncts and Arabic's
  joining still have to be right in fontkit; Option 2 only guarantees the screen shows the same wrong
  thing. The existing corpus guards become quality checks, not correctness gates - which is a demotion,
  not a deletion.

## 6.4 What it forecloses

**Also Option 2, also moot for now (§6.2) - kept for the same reason as §6.3.**

- **Per-run itemization, permanently.** Already foreclosed by constraint 1; Option 2 makes it structural
  rather than a policy, because the painted layer draws one font.
- **Rich text inside one element** (mixed sizes, a bold word). Also already foreclosed by constraint 1.
- **Browser-native text selection across the painted glyphs.** Selection stays a textarea affordance.
- **Any future "just let the browser render it"** escape hatch, which §5's Option 3 shows was never
  available anyway.

---

# 7. The extraction question (H2), evaluated

`composeHebrewClusters` composes bet+dagesh to U+FB31 and shin+shin-dot to U+FB2A before shaping, so the
exported ToUnicode reports the composed characters rather than the typed NFD sequence. The brief asks
whether that should stay.

**It should stay, and the framing should change, because the problem is bigger and the fix is cheaper
than either was thought to be.**

Measured 2026-08-27, `בְּרֵאשִׁית` (11 typed codepoints) through Arimo:

| how it was drawn | `pdftotext` (poppler) | pdf.js `getTextContent` |
|---|---|---|
| `page.drawText`, single `Tj` (the control) | the 11 typed codepoints, logical order | the 11 typed codepoints |
| today's per-glyph emission | `U+FB31 U+05B0 ␠ U+05B5 U+05E8 U+05D0 U+FB2A U+05B4 ␠ U+05D9 U+05EA` - composed forms **and** the stray spaces the design record accepted | `U+05BC U+05D1 U+05B0 ...` - decomposed, but with each cluster's marks reordered |
| per-glyph + `/Span <</ActualText …>> BDC … EMC`, ActualText in **visual** order | **byte-identical to the control** | unchanged (pdf.js ignores ActualText) |
| same, ActualText in **logical** order | the 11 typed codepoints, but **reversed** | unchanged |

Four things follow.

1. **H2 is not only a composition problem.** The per-glyph emission itself already degrades extraction,
   in both extractors, in different ways. Composition is one contributor.
2. **`/ActualText` fixes it, using public exports only.** `PDFOperator`, `PDFOperatorNames`, `PDFName`
   and `endMarkedContent` are all exported from `@cantoo/pdf-lib`'s root; a `BDC` with a property
   dictionary is `PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'),
   props])`. **No embedder internals, no fork.** This matters because the obvious fix - overriding the
   ToUnicode CMap - cannot work anyway: that table is whole-font, built from
   `allGlyphsInFontSortedById()`, so it cannot express "this occurrence of this glyph came from these
   characters".
3. **There is no order that is right for every reader.** Poppler runs its own bidi over ActualText and
   therefore expects it in visual order; feeding it the spec-conformant logical order makes poppler emit
   the string backwards. pdf.js ignores the field entirely, so it cannot be harmed either way. **This is
   a decision against a reader, not against the spec, and it should be recorded as such.**
4. **Recommendation: adopt `/ActualText` per shaped run, in the run's visual order** (logical for an LTR
   run, reversed for an RTL one - which is the order fontkit already emits glyphs in, so it is free).
   Rationale: it takes the reader that most extraction tooling uses to exact parity with the known-good
   control, it fixes the accepted stray-space defect at the same time, and the alternative order produces
   a visibly worse result in the only reader that reads the field at all. **Measure Acrobat and macOS
   Preview before shipping**, and if a conformant reader that reads ActualText logically turns up, this
   is the moment to revisit rather than a reason to delay.

Composition itself stays: it is what makes the ink correct, which is the thing a signed document is for.

---

# 8. Staged plan

Ordered so every stage leaves the codebase better than it found it and can be the last one. Nothing
before stage 9 depends on stage 9 landing, and stages 4 through 8 are independent of each other.

### Stage 1 - Render the PDF and look at it

**Landed 2026-08-27 (W1).** `e2e/sign/export-render-guard.spec.js`, with `fixtures/exportRenderHarness.js`,
`fixtures/exportRenderCorpus.js` and `fixtures/exportRenderBaseline.json`, bundles the real `signPdf`
into `dist/` and runs it in the browser, rasterising with pdf.js at 3x against a 48x24 per-cell mean-ink
baseline over 21 cases (never poppler against Chromium - that is the cross-rasteriser comparison the
design record rejected on measured noise floors of 80-88%). `MIN_TOLERANCE_PCT` was calibrated, not
declared, against an in-browser proxy for cross-rasteriser noise (worst measured 8.18%, times 1.5,
rounded to 12.5) - the originally declared floor of 8 did not clear that proxy. Full record, including
the non-vacuity assertion catching a real RTL anchoring defect in the corpus on its first run, in
`TODO.md`'s W1 entry.

**Bought:** the first check on the artifact users actually receive. It is what would have caught the CJK
subsetter corruption, which passed `pdffonts`, `pdftotext` and a zero exit code while rendering broken.
**It is also the safety net that makes every later stage revertible with confidence**, which is why it
was done first.

**Non-negotiable in its design, and held to:** never use "is there ink?" as a pass condition. `.notdef` is
commonly a filled box that draws *more* ink than the glyph it replaced, so a regression can raise the
number. Compares against a per-case baseline, and carries a non-vacuity assertion (distinct cases must
produce distinct signatures) - the exact assertion that caught the font-loading probe comparing one
system font against itself seven times, and the one that caught the RTL anchoring defect above.

**Stated limitation, not fixed by this stage:** at 12.5% relative tolerance a defect smaller than roughly
an eighth of a case's ink passes undetected. This guard is a division of labour with the per-script
shaping guards, not a replacement for them.

### Stage 2 - Close the NFC seam

**Landed 2026-08-27 (W2).** Coverage in `src/editor/registry/text.ts` is now judged against the string
that reaches `layout()` (§3.1): split on `/\r?\n/`, then `composeHebrewClusters` per line. Tests in both
directions, in both `textShaping.test.js` and `textCoverage.test.js`, against the real font bytes. Full
record in §1.4 above and in `TODO.md`'s W2 entry.

**Bought:** removes the last known path to a silently missing character - as a refusal, not a fix; W2
turns the silent loss into a stopped download. **Note for what comes next:** the coverage-first rule in
Stage 3 is what turns that refusal into a correct substitution.

### Stage 3 - The coverage-first selection rule

Replace `resolveFontSubstitution` per §3.2. Add the style tag to the catalogue. Rework
`fontCoverage.test.js` from "does the `capable` list match the bytes" to "does the resolver's answer match
the bytes", keeping the non-vacuity half. Rewrite `describeFontSubstitution` to name characters rather
than a script.

**Buys:** stage 3 of the pipeline becomes structural; the mixed-script refusals in §3.6 become
substitutions; the notice stops being approximate. **Abandonable?** Yes, cleanly - it is one function's
contract, and `SCRIPT_FALLBACKS` can be restored.

### Stage 4 - Source the bold and italic faces the catalogue is missing

Before blocking anything, find out how much of the gap is a missing *download* rather than a missing
*font*. Eight families ship Regular only and four more ship no Italic (§1.4), and that list was built
from what is in `public/fonts/`, never from what the upstream projects actually publish.

**Check upstream availability first, and treat this as unverified until it is checked:** several of these
are believed to publish more weights than we ship - Caveat and Dancing Script as variable fonts spanning
400 to 700, Kalam with a Bold, Mali with a wide weight range *and* italics. If that holds, the fix for
most of the gap is downloading four files, not disabling four buttons.

Then decide the remainder deliberately, in three buckets:

1. **Available upstream** - download, add the `@font-face` rules and the licence entries, extend
   `FONT_VERTICAL_METRICS` (which is per family today and would need re-measuring only if a weight's
   `hhea` differs), and run the new face through the same admission checks any font gets: licence, glyph
   coverage against the real bytes, and the parity guard for every script it claims.
2. **Correct to have no such face** - Hebrew and Arabic do not use italic. Assistant, Heebo, Alef and
   Almarai are not missing anything. Disable, and say why.
3. **Genuinely single-weight display faces** - Pacifico, Great Vibes, Sacramento, Gveret Levin are
   likely here. If a family we want in bold has no bold anywhere, the choice is to disable it or to look
   for a *different* face that covers the same style niche with all four weights. That second option is
   the real point of this task: **weight and style coverage becomes something we select fonts for, not
   something we discover after the fact.** Record the result as an admission criterion in the "adding a
   font" checklist so the next candidate is judged on it.

**Buys:** turns most of stage 5's blocking into shipping. Independently, it is a straight upgrade to the
catalogue - a bold handwriting face is something the tool cannot do at all today.

**Abandonable?** Yes, at any point. Each bucket is independent, and stage 5 is correct whether or not
this runs first; it just has more to disable.

### Stage 5 - Honest weight and style

`covers()` takes `(family, weight, style)`; the picker disables Bold and Italic where no real face
exists, with a reason in the app's own voice, over whatever stage 4 could not fill.

**Buys:** closes a WYSIWYG divergence no guard can see. **Abandonable?** Yes; it is UI plus one predicate.

### Stage 6 - `/ActualText` per shaped run

Per §7, with the order decision recorded and a guard asserting poppler parity with the single-`Tj`
control on a fixed corpus.

**Buys:** extracted text matches typed text in the reader most tooling uses, and the accepted stray-space
defect goes with it. **Abandonable?** Yes; it is additive operators around an unchanged emission.

### Stage 7 - The catalogue coverage report

A build-time artifact enumerating which script combinations the catalogue can draw and which it cannot,
generated from the real font bytes rather than from a claim - essentially §4.1, regenerated on every
build. Feed the same data into the Sign page's Languages card so the public "not yet" list cannot drift
from the code.

**Buys:** makes "should we add a font" a data question, permanently, and makes the Hebrew+Arabic decision
answerable in a minute rather than a session. **Abandonable?** Yes; it is a script and a copy source.

### Stage 8 - Latin parity for the four `calt` faces

Run the existing `shapingGuardHarness` on Pacifico, Caveat, Great Vibes and Dancing Script over a Latin
name corpus. §6.2 resolved the branch this stage used to be conditional on: Option A (keep two engines,
harden the guards) was chosen, so this is not an optional quality check waiting on a future decision, it
is **the correctness gate that should already exist**, owed now.

**Buys:** the answer to the sharpest unknown in §1.3. Possible outcomes: all four agree (the risk was
theoretical, record it and move on), or one does not, in which case the catalogue rule applies exactly as
it did to Playpen. **Abandonable?** It is a measurement; its output is knowledge either way.

### Stage 9 - The decision from §6.2, applied

§6.2 resolved this stage: **Option A.** The guard map's unproven pairs get proof, using the harness this
repo already has - `e2e/sign/fixtures/shapingGuardHarness.js`, which already does per-script pixel parity
in a browser at no new dependency cost. That is what "a few simple tests" means concretely: extend the
guard map to the pairs §1.3 lists as unproven - Latin (folded into stage 8 above, since it is the same
harness and the same four faces), Thai, Cyrillic and Greek - each getting a `shapingGuardHarness` run
against its capable families. No new dependency, no architectural change.

The `harfbuzzjs` **devDependency** oracle from Option 1's write-up in §5 was considered and is **not**
adopted. It is recorded as available, not chosen: the existing harness already answers the parity
question it would answer, at zero additional dependency cost, which is the whole reason "a few simple
tests" was sufficient scope for this decision.

**Option 2's stage is deferred to backlog, not deleted.** If reopened: paint the text element from
`fk.layout()` + `glyph.path.toSVG()`, behind a flag, textarea transparent with `caretColor` preserved,
`aria-hidden` on the painted layer, `shapedWidth` driving intrinsic size, and a composition-session
fallback to browser rendering. Land Sign only; Redact has no text elements. See §6.2 for what evidence
would justify reopening it - in short, a bundled face found to draw genuinely different letterforms
(a real Playpen repeat) that the catalogue wants to keep rather than drop.

**Abandonable?** The chosen branch is additive by construction - guard files added to an existing
harness, nothing to revert. The deferred Option 2 branch remains revertible by deleting the paint layer
and un-hiding the textarea's text, which is why it would still land behind a flag if it is ever taken up.

---

# 9. What guardrails the recommendation needs

Beyond the existing seven CI checks, and beyond stage 1 above.

1. **A render-and-compare guard on the produced PDF** (stage 1). One rasteriser, per-case baselines, a
   non-vacuity assertion, and never "is there ink" as a pass condition. **Exists**, landed 2026-08-27 (W1)
   as `e2e/sign/export-render-guard.spec.js` plus its `fixtures/exportRender*` files - see §8 Stage 1.
2. **A resolver guard, judged against the real font bytes.** `fontCoverage.test.js` today verifies the
   catalogue's *claims*. The coverage rule makes claims unnecessary - the resolver reads the bytes - so
   the test should verify the *resolver*: for an enumerated set of script combinations, assert it returns
   a family that genuinely covers the post-normalization string, or reports uncovered, with no third
   outcome. Keep the non-vacuity half: a family the resolver does **not** pick for a combination must
   genuinely be unable to draw it.
3. **A normalization-seam test.** Both directions of §1.4, named as such, so the fix cannot be undone by
   someone tidying the coverage check back to "check the typed string". **Exists**, landed 2026-08-27 (W2)
   as the "normalization seam" describe blocks in `src/editor/registry/textShaping.test.js` and
   `src/lib/textCoverage.test.js` - see §8 Stage 2.
4. **An extraction guard.** Round-trip the produced PDF through both `pdftotext` and pdf.js and assert
   the codepoint sequence against the typed text. Two extractors, because §7 shows they disagree with
   each other and a single-extractor guard would have called today's behaviour fine.
5. **A style-availability guard.** Assert every `(family, weight, style)` the picker offers has a real
   file in `public/fonts/`. This is the check that would have caught synthetic bold on the day it
   shipped, and it is three lines.
6. **Extend the guard map to CI-enforced completeness.** §6.2 resolved this to Option A: Latin (the four
   `calt` faces), Thai, Cyrillic and Greek each need a `shapingGuardHarness` run, and the map in §1.3
   becomes a **CI completeness check** - a `(family, script)` pair with no guard must be a named, listed
   exemption rather than a silence. This is a correctness gate, not a quality dashboard, because Option 2
   (which would have made it a dashboard, §8 stage 9 / §6.3) was not taken.
7. **Keep the two existing rules that are easy to lose.** `assertNotSubsetEmbedded` must keep its test
   (it has one; the brief thought it did not, which is how a guard dies). And the no-batching rule in
   `drawShapedRun` must keep its test, because a batched run advances by `/W` rather than by the shaper's
   advances and drifts silently - guarding it against `hmtx` was tried and does not catch it.

---

## Verification discipline used in this document

Recorded because two of the measurements above were wrong on the first attempt, in the same way this
project has been burned before.

- **A naive glyph comparison makes every RTL string look contextually substituted.** Comparing
  `layout()` output against a per-codepoint cmap lookup without reversing the expectation reported
  contextual substitution in Gveret Levin and Arimo on Hebrew, in fonts that have none. The corrected
  comparison (§1.3) reverses the naive sequence for RTL. The first version would have shipped a false
  claim about the Hebrew handwriting fallback into a design document.
- **`/ActualText` order was settled by isolating the variable**, not by reading the spec. The reversal
  looked like an artifact of per-glyph emission until the same wrapper was put around a single
  `page.drawText` call and reversed identically, and an LTR control in the same file did not.
- **Every coverage claim here is `hasGlyphForCodePoint` against the real bytes in `public/fonts/`**,
  never a font's name, its `BaseFont`, or a catalogue entry.
- **No PDF was judged by `pdftotext` or `pdffonts` alone.** Where extraction is the claim, extraction is
  the measurement; where ink is the claim, §8 stage 1 is the guard that does not exist yet, and no ink
  claim is made in this document without one.
