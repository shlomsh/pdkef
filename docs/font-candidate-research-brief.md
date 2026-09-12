> **Note:** the `CLAUDE.md` font section this brief cites ("Fonts must render identically on screen and in the export") now lives in `.claude/rules/fonts-and-text.md`.

# Font candidate research brief

Rules for screening a new font before it is proposed for the Sign tool's catalogue, and the current
state to screen against. Written for FONT-03/FONT-04/FONT-08 in [TODO.md](../TODO.md), and for any
research agent (human or otherwise) picking one of them up. **This document produces a shortlist, not a
landed font.** Nothing here replaces the code-level verification (fontkit corpus run, `glyf` alignment
check, real browser parity) that every prior addition went through before being wired in - see
CLAUDE.md's "Fonts must render identically on screen and in the export" section and the per-font writeups
in TODO.md's internationalization epic for the discipline this is extracted from.

## What to screen for, per candidate

1. **License.** SIL Open Font License 1.1 (OFL) or Apache 2.0 only - every bundled font so far is one of
   these two. No commercial, no "free for personal use," no license that requires payment or a signed
   agreement, no AGPL. Confirm the license file exists in the font's own source repo (Google Fonts'
   `ofl/apache` metadata is a reasonable pointer but verify against the upstream repo, not just the
   Fonts.google.com listing page). Record the exact copyright line for `THIRD_PARTY_LICENSES.md` -
   real text from the font's own `OFL.txt`/`LICENSE`, not paraphrased.
2. **Static files, not variable-only.** Every font landed so far ships (or was instanced to) real static
   Regular/Bold TTFs. A variable-only distribution is not disqualifying by itself - variable-vs-static was
   directly tested during the Gurmukhi/Telugu crash investigation and confirmed **not** to be the crash
   factor - but static files are simpler to embed, subset, and reason about, and are strongly preferred
   when both exist.
3. **`calt` (contextual alternates) presence is a red flag, not an instant disqualifier.** Playpen Sans
   Hebrew was dropped from the catalogue entirely for an 88% systemic shaping disagreement traced to its
   `calt` table. A font with `calt` is not automatically wrong, but flag it explicitly in the report so
   whoever screens it next knows to weight that risk - don't silently note "has calt" and move on.
4. **Fontkit-crash risk cannot be assessed from a browser alone - flag it as pending, do not guess.** The
   single most expensive lesson on this board: Noto Sans Gurmukhi and Noto Sans Telugu both looked
   completely normal in a browser and both crashed `@pdf-lib/fontkit`'s `layout()` with an uncaught
   `Cannot read properties of null (reading 'xCoordinate')` inside `GPOSProcessor.getAnchor` - the same
   crash later found in Noto Nastaliq Urdu, confirming it's a general fontkit limit, not a one-off. A web
   research pass **cannot** run this check (it needs the actual font bytes and this repo's fontkit
   version). Every candidate this brief produces still needs its generated corpus shaped through fontkit
   before it is trusted - say so explicitly in the report rather than implying the candidate is verified.
5. **Real glyph coverage of the full script block plus digits and relevant punctuation**, checked against
   actual font bytes (`characterSet` / `hasGlyphForCodePoint`), not a marketing claim or a "supports N
   languages" badge. If the font's own specimen page lists a script, that's a lead, not a verification.
   Also note Latin ASCII coverage - a font with full Latin+digit coverage keeps a mixed-language line in
   one font instead of triggering `resolveFontFamily`'s whole-element substitution (this is what makes
   Kalam pleasant for Devanagari+English lines; Scheherazade New's Latin coverage was not part of its
   pitch and mixed lines still split fonts).
6. **`glyf` table alignment for subsetting is a known, fixable, but real cost - flag if checkable.**
   Roughly half of the Brahmic candidates landed so far needed a `glyf` padding=4 repad because fontkit's
   TTF subsetter cannot read unaligned `loca` offsets (Kalam, Scheherazade New, Anek Telugu all needed
   it; the fix is mechanical and was verified outline/cmap/metrics-identical each time). This cannot be
   checked from a specimen page - note it as "unknown, check on download" rather than guessing either way.
7. **Vertical metrics come from the real `hhea` table, never transcribed from a spec sheet.** Not
   checkable from web research; flag as a required step, don't fill in a guessed ascent/descent.
8. **Weight/size budget.** Fonts load on demand now, not via wholesale precache, so page weight is not
   the primary gate it once was - but repo weight and per-font download size still matter. For context,
   real numbers already in the catalogue: Kalam ~427KB (Regular only), Scheherazade New 324KB Regular /
   580KB Bold, Anek Telugu needed the same repad treatment as Kalam. A "kitchen sink" family covering many
   scripts in one enormous file is a worse fit than a script-specific family even at parity coverage - CJK
   families (5-20MB unsubsetted) are the extreme case and already have their own build-time pre-subsetting
   plan; don't propose a similarly oversized file for a Brahmic or Arabic-family candidate without flagging
   the size explicitly.
9. **Classify the candidate's style up front: handwriting/cursive vs. upright/text.** This decides
   whether it would join `HANDWRITING_FONTS` or `TEXT_FONTS` in `src/editor/text/fonts.js`, and - for Devanagari
   and Thai specifically - whether it actually closes the "no upright option" gap (FONT-08a) or just adds
   a second handwriting choice. Say which, and why (serif/sans-serif, slant, connected strokes, etc.),
   don't just repeat the font's own marketing description.
10. **No engine-swap workarounds.** If a candidate crashes fontkit, the answer is a different candidate,
    not a HarfBuzz-WASM proposal - see `docs/hebrew-text-shaping-export.md`'s argument against an engine
    swap for Hebrew, which generalizes here. Urdu/Nastaliq (FONT-06) was the former exception; it is
    retired because Scheherazade New already serves Urdu, and remains out of scope for this brief.

## Report format per candidate

For each candidate, report: family name, foundry/publisher, license + a link to the actual license file
(not just the Google Fonts listing), static file availability and approximate size (Regular/Bold/other),
style classification (handwriting vs. upright, and why), claimed script/language coverage with a link to
the specimen or GitHub repo, whether `calt` is mentioned anywhere in its own documentation or feature
list, and a one-line recommendation: **screen further** (worth a real fontkit-corpus run) or **discard**
(and why - license, style mismatch, coverage gap, etc.). Rank candidates within a script by how likely
they are to survive screening, not by name recognition.

## Current catalogue, for exclusion and gap reference

`HANDWRITING_FONTS` (`src/editor/text/fonts.js`): Caveat, Dancing Script, Great Vibes, Gveret Levin, Kalam, Mali,
Pacifico, Sacramento.

`TEXT_FONTS`: Arimo, Tinos, Cousine, Assistant, Heebo, Alef, PT Sans, Scheherazade New, Noto Sans JP,
Noto Sans SC, Noto Sans TC, Noto Sans KR, Noto Sans Bengali, Mukta Mahee, Anek Telugu, Noto Sans Tamil,
Mukta, IBM Plex Sans Thai, Anek Malayalam. (Source of truth: `src/editor/text/fontManifest.js`, generated
from `scripts/font-manifest.mjs`; this list was last synced 2026-09-12.)

Retired, mapped to a replacement in `RETIRED_FONTS`: Playpen Sans Hebrew (to Gveret Levin), Almarai (to
Scheherazade New).

Single-font scripts and their gap type, as of 2026-09-12:

| Script | Sole font | Style | Gap |
| --- | --- | --- | --- |
| Devanagari | Kalam (handwriting), Mukta (upright) | both | upright gap **closed** 2026-08-29 (FONT-08a); Kalam is still the only handwriting face |
| Thai | Mali (handwriting), IBM Plex Sans Thai (upright) | both | upright gap **closed** 2026-08-29 (FONT-08a); Mali is still the only handwriting face, Sriracha named as the unscreened same-day runner-up |
| Malayalam | Anek Malayalam | upright | no second choice (landed via FONT-03 after Noto Sans Malayalam crashed fontkit) |
| Arabic/Farsi/Dari/Urdu/Pashto | Scheherazade New | upright (traditional Naskh) | no second choice |
| Bengali | Noto Sans Bengali | upright | no second choice |
| Punjabi/Gurmukhi | Mukta Mahee | upright | no second choice |
| Telugu | Anek Telugu | upright | no second choice |
| Tamil | Noto Sans Tamil | upright | no second choice |
| Japanese | Noto Sans JP | upright | no second choice (CJK size cost applies) |
| Chinese (Simplified) | Noto Sans SC | upright | no second choice (CJK size cost applies) |
| Chinese (Traditional) | Noto Sans TC | upright | no second choice (CJK size cost applies) |
| Korean | Noto Sans KR | upright | no second choice (CJK size cost applies) |
| Cyrillic | Arimo/Tinos/Cousine/PT Sans | upright only | **no handwriting option at all** - confirmed against the bundled TTFs 2026-09-12: every bundled handwriting face is a Latin-only cut (0/15 Cyrillic letters probed) |
| Greek | Arimo/Tinos/Cousine | upright only | **no handwriting option at all** - same probe, 0/16 Greek letters in every handwriting face (PT Sans and Heebo carry only a stray glyph or two) |

Latin and Hebrew both already have both styles covered and are out of scope for this brief, except that
a second Hebrew handwriting face (Gveret Levin is the only one) is a welcome appendix.

## Already screened: do not re-propose

Every entry here went through at least one of the three code-level checks, so a research pass that
surfaces it again is wasting its budget. Evidence lives in the commit or spec named.

| Font | Script | Verdict | Where |
| --- | --- | --- | --- |
| Mukta | Devanagari | **landed** as the upright face, clean on all three checks | `7239685` |
| IBM Plex Sans Thai | Thai | **landed** as the upright face; carries `calt` but passed advance parity at 0.05px on every sample including the tall-consonant/tone-mark stress case | `e2e/sign/thai-font-parity.spec.js` |
| Sarabun, Kanit | Thai | **failed** advance parity (1.4-3.0% and 0.3-1.0% of string width) on ordinary words, neither has `calt` | FONT-08 record |
| Anek Malayalam | Malayalam | **landed**, 0/478 crashes, 245/245 on the pixel guard | FONT-03, `e2e/sign/malayalam-shaping-guard.spec.js` |
| Noto Sans Malayalam | Malayalam | **crashes** fontkit on 33/35 reph cases | FONT-03 |
| Noto Sans Gurmukhi, Noto Sans Telugu | Gurmukhi, Telugu | **crash** fontkit in `GPOSProcessor.getAnchor` | `.claude/rules/fonts-and-text.md` |
| Scheherazade New | Arabic family | **landed**; passes the 151-case Arabic guard and the 22-case Pashto corpus | `8eead4f` |
| Amiri | Arabic family | **passes the guard** but set aside as too calligraphic for a form; the documented fallback only | `8eead4f` |
| Noto Naskh Arabic, Noto Sans Arabic | Arabic family | **fail** one guard case each, the same one: shadda and fatha stacked on a letter | `8eead4f` |
| Almarai | Arabic | **retired**: lacks eleven Pashto letters; passed the Arabic guard, so an Arabic-only revival is a product decision, not a screening question | `8eead4f`, `6365486` |
| Noto Nastaliq Urdu | Urdu | **crashes** fontkit; Nastaliq is out of scope | FONT-06 (retired) |
| Playpen Sans (any script) | Hebrew, Cyrillic, Greek | **discard by precedent**: the Hebrew cut was removed for an 88% `calt`-driven disagreement | `RETIRED_FONTS` |

## Candidates found (2026-08-29 research pass)

Two web-research passes against the rules above. **Nothing here is screened** - no candidate has been
run through the fontkit corpus, checked for `glyf` alignment, or verified byte-for-byte for coverage.
This is a ranked shortlist to screen from, not a landed decision. Ranked within each script by likelihood
of surviving screening.

### FONT-08a - upright option for Devanagari (resolved: Mukta landed 2026-08-29)

Kept for the record of what was ranked and why; candidate 1 shipped.

1. **Mukta** (Ek Type, OFL 1.1 - [license](https://github.com/EkType/Mukta/blob/master/LICENSE.txt)). Static Regular-ExtraBold, 7 weights, no italics. Upright humanist sans. Claims Devanagari + Gujarati + Gurmukhi + Tamil + Latin. No `calt` found. Same foundry as the already-bundled Mukta Mahee - best odds of a clean fontkit result.
2. **Anek Devanagari** (Google Fonts, OFL). Variable-only, same family shape as the already-bundled (and already-repadded) Anek Telugu. Upright, contemporary/geometric sans.
3. **Hind** (Indian Type Foundry, OFL). Static, 5 weights, ~1,146 glyphs incl. conjuncts. Upright humanist sans, widely used for Devanagari body text.
4. **Poppins** (ITF, OFL). Static, 18 weight/italic files. **Caveat: an open upstream GitHub issue disputes its Devanagari coverage** - verify before trusting the claim.
5. **Tiro Devanagari Sanskrit** (OFL). Static Regular + Italic only. The one **serif** option, for style variety.
6. Noto Sans/Serif Devanagari - variable-only, listed last on purpose: the Noto family that crashed fontkit for Gurmukhi and Telugu elsewhere. Fallback only, expect elevated crash risk.

### FONT-08a - upright option for Thai (resolved: IBM Plex Sans Thai landed 2026-08-29)

Kept for the record. Candidates 1 and 2 both failed advance parity in code; candidate 3 shipped. The
ranking below was wrong in the way the three-check protocol exists to catch: real-world adoption did
not predict fontkit agreement.

1. **Sarabun** (OFL). Static, 16 files. Thailand's de facto government/document font - top pick, broad real-world validation.
2. **Kanit** (Cadson Demak, OFL). Static, 18 files. Loopless geometric sans, good stylistic contrast to Mali.
3. **IBM Plex Sans Thai** (IBM, OFL). Static, 7 weights, no italics. Upright grotesque sans.
4. **Pridi** (Cadson Demak, OFL claimed, license file not directly verified this pass). Static, 6 weights. The one **serif** option.
5. Noto Sans/Serif Thai - variable-only, same elevated Noto-crash-risk caveat as Devanagari's Noto entries.

### FONT-08b - second choice, Bengali (currently Noto Sans Bengali only)

1. **Hind Siliguri** (Indian Type Foundry, OFL). Static, 5 weights, Regular ~244KB. Upright sans, same design language as Mukta/Mukta Mahee. No `calt` found.
2. **Tiro Bangla** (Tiro Typeworks/"Indigo," OFL). Static Regular + Italic, ~324/330KB. The **serif** option - bigger visual departure, ranked second for that reason.
3. Noto Serif Bengali - same-publisher serif fallback if both above stall in fontkit.

### FONT-08b - second choice, Tamil (currently Noto Sans Tamil only)

1. **Tiro Tamil** (Tiro Typeworks/"Indigo," OFL). Static Regular/Italic, ~197KB. Upright serif; same foundry as the Tiro Bangla pick above, so foundry engineering quality is a known quantity across scripts.
2. **Catamaran** (OFL). **Variable-only in the google/fonts mirror** - check the upstream repo for static instances before assuming none exist.
3. Mukta Malar (Ek Type, same family as bundled Mukta Mahee) - lowest novelty, safest fallback.

### FONT-08b - second choice, Arabic family (currently Scheherazade New only)

- **Naskh alternatives:** both screened since this pass, see the "Already screened" table. Noto Naskh Arabic fails one guard case; Amiri passes but reads as calligraphic and stays the documented fallback only. A second Naskh is therefore not the lever; the contrast worth having is a modern sans.
- **Geometric/modern alternative: Vazirmatn** (rastikerdar, OFL - mirror ships variable-only but the [upstream repo](https://github.com/rastikerdar/vazirmatn/tree/master/fonts/ttf) has real static Regular/Bold ~123KB each). Built explicitly for Persian/Arabic/Urdu, geometric sans, visually the furthest from Scheherazade New. **Top pick for a modern-feel second choice.** Cairo (OFL, variable-only, 599KB) is a second geometric option but larger and less explicitly multi-language-targeted.

### FONT-08b - second choice, Punjabi/Gurmukhi and Telugu

- Gurmukhi: **Tiro Gurmukhi** (OFL, static ~151KB, serif) and Noto Serif Gurmukhi (OFL, variable-only) - both distinct in style from the sans Mukta Mahee.
- Telugu: **Suranna** (Silicon Andhra/Cyreal, OFL, static ~625KB, serif, book-oriented) and Noto Serif Telugu (OFL, variable-only, 543KB). Both **flagged for size** - larger than the Devanagari/Bengali picks above.

### FONT-08b - Cyrillic and Greek handwriting gap (currently zero handwriting option for either)

Pulled from Google Fonts' own metadata, filtered to `category: Handwriting`.
- **Cyrillic:** Marck Script (OFL, static 84KB) - own docs mention "intelligent OpenType features," **calt risk, flag**; **Neucha** (OFL, static 141KB, single weight, no `calt` mentioned) - simpler, lower-risk pick, **top choice**.
- **Greek:** genuinely scarce (confirmed by an independent TypeDrawers thread on the same gap). Mansalva (OFL, static 356KB) and Mynerve (OFL, static 279KB, connected-script style, likely `calt`-dependent - flag) are the only two found. Playpen Sans also technically covers both scripts but is **discard by precedent** - this catalogue already dropped its Hebrew sibling for an 88% `calt`-driven shaping failure.
- Checked in code 2026-09-12: the bundled Caveat, Great Vibes and Pacifico TTFs are Latin-only cuts (0 Cyrillic, 0 Greek glyphs via `hasGlyphForCodePoint`), whatever the Google Fonts metadata says. Something new has to be sourced.

### FONT-08b - Sriracha (second Thai handwriting face, already named on the board)

Confirmed real and current: OFL, Cadson Demak (2015) + Pablo Impallari (2014), single static Regular ~320KB, Thai+Latin, on Google Fonts since 2015. Its own listing advertises "2 stylistic sets" and "intelligent OpenType features to recreate handwriting" - **explicit calt-adjacent risk, flag prominently**, the same shape of claim that sank Playpen Sans Hebrew.

### FONT-08b - CJK (Japanese, Chinese SC/TC, Korean)

Light touch only, per the brief's own cost note: no pre-subsetted alternative distribution stood out as an obvious win. The existing plan (build-time pre-subsetting of the current Noto files, tracked elsewhere on the board) is the right lever, not a second 5-20MB family. Not worth further candidate research until that infrastructure exists.
