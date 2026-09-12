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

1. **Mukta** (Ek Type, OFL 1.1 - [license](https://github.com/EkType/Mukta/blob/master/OFL.txt)). Static Regular-ExtraBold, 7 weights, no italics. Upright humanist sans. Claims Devanagari + Gujarati + Gurmukhi + Tamil + Latin. No `calt` found. Same foundry as the already-bundled Mukta Mahee - best odds of a clean fontkit result.
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

### FONT-08b - the 2026-08-29 web shortlist, superseded

The FONT-08b sections from this pass (Bengali, Tamil, Arabic, Gurmukhi/Telugu, Cyrillic/Greek, Sriracha,
CJK) are superseded by the verified pass below; see git history for the original text. Two of its claims
did not survive contact with the bytes: Mansalva and Mynerve *do* cover Greek (the pass had them right,
a later research agent got them wrong), and Sriracha's advertised "2 stylistic sets" are not in the
file Google Fonts ships.

## FONT-08b shortlist (2026-09-12 pass, verified against font bytes)

A deep-research agent produced the candidate list from the prompt in
[FONT-08](../backlog/tasks/FONT-08.md); every claim below was then re-checked locally against the TTF
Google Fonts distributes (`google/fonts` main, or the upstream repo where noted), with this repo's
`@pdf-lib/fontkit`. What "verified" means per column:

- **Coverage**: `hasGlyphForCodePoint` over the script's base letters (and Farsi/Urdu/Pashto extras for
  Arabic), plus ASCII letters and digits. "full" means every probe letter has a glyph.
- **Features**: the font's `availableFeatures`, filtered to the ones that predict shaper disagreement
  (`calt`, `ssXX`, `liga`, `kern`, `mark`/`mkmk`, `rlig`).
- **Check 1**: uncaught throws from `font.layout()` over the repo's own corpus for that script
  (`e2e/sign/fixtures/*Corpus.js`: Arabic 155 + Pashto 22, Bengali 256, Gurmukhi 500, Telugu 630,
  Tamil 329, Malayalam 478, Devanagari 185, Latin names 25) or, where no corpus exists, a small ad hoc
  set (Thai 18 incl. ปั๊กฝ้ายให้ฟังกิ๊บ, Hebrew 11 with niqqud, Cyrillic 8 incl. Ukrainian, Greek 8).
  **Ad hoc sets are a smoke test, not a corpus**; a landing still needs a real corpus and guard.
- **glyf**: `scripts/check-font-glyf-alignment.js` pointed at the candidate directory.
- **©**: the `name` table copyright string, verbatim, which is what `THIRD_PARTY_LICENSES.md` needs
  (cross-check against the upstream `OFL.txt` on download; the agent's quoted lines were wrong for seven
  of nineteen fonts, so never copy a copyright line from a research report).

**Checks 2 and 3 (pixel guard, advance parity) are not run for any of these.** They need a browser and
a per-script spec; that is landing work, not research.

### The research agent's errors, so the next pass knows what a report cannot be trusted for

- **Greek inverted.** It discarded Mansalva and Mynerve as "Latin-only" and picked Patrick Hand as the
  "viable" Greek face. The bytes say the opposite: Patrick Hand has 4 stray Greek glyphs, Mansalva and
  Mynerve both have all 55 probed. Patrick Hand's copyright line was also attributed to the wrong person.
- **Foundry wrong.** Tillana is Indian Type Foundry, not Ek Type; the "Ek Type engineering record"
  argument for ranking it first does not apply.
- **`calt` claims wrong in both directions.** Sriracha (called HIGH RISK for `calt` + stylistic sets)
  ships with `liga` and `kern` only. Marck Script ("connected cursive ligatures") has `kern` only.
  Vazirmatn ("no calt") has `calt` and `ss01`.
- **Sizes wrong** by up to 3x (Suranna 610KB, not 210KB; Sriracha 312KB, not 185KB; Tiro Gurmukhi
  147KB, not 280KB). **Static availability wrong** for Cairo (variable-only upstream, no static files).
- What it got right: every license, every upstream repo URL, the script coverage of every non-Greek
  candidate, and the style classifications.

### Arabic family (second upright choice next to Scheherazade New)

| | Vazirmatn | Cairo |
| --- | --- | --- |
| Foundry, license | Saber Rastikerdar, OFL 1.1 ([OFL.txt](https://github.com/rastikerdar/vazirmatn/blob/master/OFL.txt)) | Mohamed Gaber, OFL 1.1 ([OFL.txt](https://github.com/Gue3bara/Cairo/blob/master/OFL.txt)) |
| Style vs Scheherazade New | geometric/humanist sans, Latin from Roboto; the sharpest contrast available to a traditional Naskh | geometric Kufi-flavoured sans on Titillium Latin |
| Static | upstream `fonts/ttf/` has 9 static weights; Regular **119KB** (Google Fonts ships the 235KB variable only) | **variable only**, upstream and Google Fonts; 585KB |
| Coverage | Arabic, Farsi, Urdu, **Pashto 9/9**, Latin: full | Arabic, Farsi, Urdu, Latin full; **Pashto 0/9** (22/22 Pashto corpus cases hit `.notdef`) |
| Features | **`calt`, `ss01`**, liga, kern, mark, mkmk, rlig; flag `calt` | kern, mark, mkmk, rlig |
| Check 1 | 0/155 Arabic, 0/22 Pashto, 0/25 Latin | 0/155, 0/22 (all notdef), 0/25 |
| glyf | aligned | aligned |
| © | `Copyright 2015 The Vazirmatn Project Authors (https://github.com/rastikerdar/vazirmatn)` | `Copyright 2009 The Cairo Project Authors (https://github.com/Gue3bara/Cairo)` |
| Verdict | **screen further, top pick.** The `calt` is the risk to test; IBM Plex Sans Thai showed a `calt` face can pass | **discard.** No Pashto means the Pashto row would substitute the whole element back to Scheherazade New; variable-only and 585KB on top |

### Bengali (second choice next to Noto Sans Bengali)

| | Hind Siliguri | Tiro Bangla |
| --- | --- | --- |
| Foundry, license | Indian Type Foundry, OFL 1.1 ([OFL.txt](https://github.com/google/fonts/blob/main/ofl/hindsiliguri/OFL.txt), upstream [itfoundry/hind-siliguri](https://github.com/itfoundry/hind-siliguri)) | Tiro Typeworks, OFL 1.1 ([OFL.txt](https://github.com/TiroTypeworks/Indigo/blob/main/LICENSES.txt)) |
| Style vs Noto Sans Bengali | humanist sans, same family language as Mukta/Mukta Mahee; a modest contrast | traditional literary serif; the big contrast |
| Static | 5 weights on Google Fonts, Regular 244KB / Bold 280KB | Regular + Italic, 316KB |
| Coverage | full + Latin | full + Latin |
| Features | none of the flagged ones (Indic GSUB only) | `ss01` |
| Check 1 | **0/256** | **fontkit never returns** on ফ্র and শ্র: `layout()` allocates until the heap dies (reproduced at 512MB, 1GB, 2GB and 4GB caps). Other ra-phala clusters (ব্র ভ্র ম্র স্র হ্র) and ফ্য ফ্ল shape fine. শ্র starts শ্রী, the everyday honorific |
| glyf | aligned | aligned |
| © | `Copyright (c) 2015 Indian Type Foundry (info@indiantypefoundry.com)` | `Copyright 2020 The Indigo Project Authors (https://github.com/TiroTypeworks/Indigo)` |
| Verdict | **screen further, the only Bengali candidate left** | **discard.** A new fontkit failure class: not a throw but a hang, which no `try/catch` in `signPdf` can turn into a clean refusal; the tab simply dies at Download |

### Punjabi/Gurmukhi (second choice next to Mukta Mahee)

**Tiro Gurmukhi** (Tiro Typeworks, OFL 1.1, same Indigo repo and copyright line as Tiro Bangla). Serif
against a sans. Static Regular + Italic, **147KB**. Coverage full + Latin. Features `liga`, `kern`.
Check 1 **0/500**. glyf aligned. **Screen further.** The Tiro Bangla hang is in that font's Bengali
lookups, not in Tiro's engineering generally: Gurmukhi and Tamil shaped their whole corpora cleanly.

### Telugu (second choice next to Anek Telugu)

**Suranna** (Andhrapradesh Society for Knowledge Networks / Cyreal, OFL 1.1,
[OFL.txt](https://github.com/google/fonts/blob/main/ofl/suranna/OFL.txt)). High-contrast serif against
a monoline sans. **Single Regular, 610KB, no Bold**; over the 600KB size flag. Coverage full + Latin.
No flagged features. Check 1 **0/630**. glyf aligned. ©
`Copyright (c) 2012 Andhrapradesh Society for Knowledge Networks (fonts.siliconandhra.org). Copyright (c) 2011, Cyreal (www.cyreal.org) with Reserved Font Name 'Prata'`.
**Screen further, with the size and no-Bold caveats stated up front.** It is the only Telugu candidate
found that is not a Noto face.

### Tamil (second choice next to Noto Sans Tamil)

| | Tiro Tamil | Mukta Malar | Catamaran |
| --- | --- | --- | --- |
| Foundry, license | Tiro Typeworks, OFL 1.1 (Indigo repo) | Ek Type, OFL 1.1 ([OFL.txt](https://github.com/EkType/Mukta/blob/master/OFL.txt)) | Pria Ravichandran, OFL 1.1 ([OFL.txt](https://github.com/VanillaandCream/Catamaran-Tamil/blob/master/OFL.txt)) |
| Style vs Noto Sans Tamil | literary serif; biggest contrast | humanist sans, softer terminals; modest contrast | contemporary sans; least contrast |
| Static | Regular + Italic, 192KB | 7 weights, Regular 237KB / Bold 247KB | Google Fonts variable 179KB; upstream `Fonts/` has 9 statics |
| Coverage | full + Latin | full + Latin | full + Latin |
| Features | liga, kern | **`ss01`, `ss02`**, liga, kern (stylistic sets are opt-in, so lower risk than `calt`; flag anyway) | kern, mark |
| Check 1 | 0/329 | 0/329 | 0/329 |
| glyf | aligned | aligned | aligned |
| © | `Copyright 2020 The Indigo Project Authors (https://github.com/TiroTypeworks/Indigo)` | `Copyright (c) 2016, Ek Type. All rights reserved.` | `Copyright 2020 The Catamaran Project Authors (https://github.com/VanillaandCream/Catamaran-Tamil)` |
| Verdict | **screen further, top pick** for contrast | screen further; safest engineering (same foundry as three bundled faces) | screen further, third |

### Malayalam (second choice next to Anek Malayalam)

**Gayathri** (Swathanthra Malayalam Computing, OFL 1.1,
[OFL.txt](https://gitlab.com/smc/fonts/gayathri/-/blob/master/OFL.txt)). Soft, curved text face against
Anek's geometry. Static Thin/Regular/Bold, **159KB** each. Coverage full + Latin. Features `kern` only.
Check 1 **0/478** on the same corpus that crashed Noto Sans Malayalam 33/35 on reph. glyf aligned. ©
`Copyright 2019 The Gayathri Project Authors (https://gitlab.com/smc/fonts/gayathri)`. **Screen
further, top pick**; SMC maintains the mlm2 lookups specifically for cross-engine parity.

### Thai, second handwriting face (next to Mali)

**Sriracha** (Cadson Demak + Pablo Impallari, OFL 1.1,
[OFL.txt](https://github.com/cadsondemak/sriracha/blob/master/OFL.txt)). Loopless informal hand against
Mali's looped one. Single Regular, **312KB**. Coverage full + Latin. Features **`liga`, `kern` only**:
despite the listing's "2 stylistic sets and intelligent OpenType features", the shipped file has no
`calt` and no `ssXX`. Check 1 0/18 ad hoc (incl. the tone-mark stress case). glyf **unaligned**
(496/966 odd offsets), needs the padding=4 repad. ©
`Copyright (c) 2015, Cadson Demak (info@cadsondemak.com), Copyright (c) 2014, Pablo Impallari (www.impallari.com|impallari@gmail.com)`.
**Screen further.** Guard A (advance parity) is what sank Sarabun and Kanit and is the check to run
first; `e2e/sign/thai-font-parity.spec.js` already knows how.

### Devanagari, second handwriting face (next to Kalam)

| | Tillana | Amita |
| --- | --- | --- |
| Foundry, license | **Indian Type Foundry** (not Ek Type), OFL 1.1 ([OFL.txt](https://github.com/google/fonts/blob/main/ofl/tillana/OFL.txt), upstream [itfoundry/tillana](https://github.com/itfoundry/tillana)) | Omnibus-Type / Eduardo Tunni, OFL 1.1 ([OFL.txt](https://github.com/etunni/Amita/blob/master/OFL.txt)) |
| Style vs Kalam | structured calligraphic brush; clear contrast to a felt-tip | casual flowing hand; closer to Kalam |
| Static | 5 weights, Regular 321KB / Bold 299KB | Regular 210KB / Bold 215KB |
| Coverage | full + Latin | full + Latin |
| Features | liga | liga, kern, mark |
| Check 1 | 0/185 | 0/185 |
| glyf | **unaligned** (513/1013), repad | **unaligned** (417/825), repad |
| © | `Copyright (c) 2014 Indian Type Foundry (info@indiantypefoundry.com)` | `Copyright (c) 2014, Eduardo Rodriguez Tunni. Copyright (c) 2000, Modular Infotech, Pune, INDIA. All rights reserved. Copyright (c) 2011 by Brian J. Bonislawsky DBA Astigmatic (AOETI) (astigma@astigmatic.com). All rights reserved.` (three parties; all under the one OFL) |
| Verdict | **screen further, top pick** on contrast | screen further, runner-up |

### Cyrillic handwriting (none today)

| | Neucha | Marck Script | Amatic SC |
| --- | --- | --- | --- |
| Foundry, license | Jovanny Lemonad, OFL 1.1 ([OFL.txt](https://github.com/google/fonts/blob/main/ofl/neucha/OFL.txt)) | Denis Masharov, OFL 1.1 ([OFL.txt](https://github.com/google/fonts/blob/main/ofl/marckscript/OFL.txt)) | see the Hebrew appendix |
| Style | upright marker print, discrete letters | connected slanted cursive | condensed hand-drawn **caps only** |
| Static | single Regular, 138KB | single Regular, 81KB | Regular 148KB / Bold 152KB |
| Coverage | Cyrillic 70/70 incl. Ukrainian і ї є ґ, Latin | Cyrillic 70/70, Latin | Cyrillic 70/70, Hebrew, Latin |
| Features | `kern` only, **no GSUB table at all** | `kern` only | liga, kern, mark, mkmk |
| Check 1 | 0/8 ad hoc | 0/8 ad hoc | 0/8 ad hoc |
| glyf | aligned | aligned | aligned |
| © | `Copyright (c) 2005-2010 by Jovanny Lemonad. All rights reserved.` | `Copyright (c) 2011, Denis Masharov <denis.masharov@gmail.com>, Marck Fogel, with Reserved Font Names "Marck Script".` | `Copyright 2015 The Amatic SC Project Authors (https://github.com/googlefonts/AmaticSC)` |
| Verdict | **screen further, top pick**: the simplest font in this whole pass | screen further; a connected script is where Caveat's 5.1px kerning gap lives, so run check 3 first | screen further as a two-gap font (see below) |

### Greek handwriting (none today)

Only two OFL handwriting faces cover Greek, and both carry `calt`: **Mansalva** (Carolina Short, 347KB,
`calt` + liga + kern, © `Copyright 2022 The Mansalva Project Authors (https://github.com/carolinashort/mansalva)`)
and **Mynerve** (Carolina Short, 272KB, `calt` + liga + kern, ©
`Copyright 2022 The Mynerve Project Authors (https://github.com/carolinashort/MyNerve)`). Both: Greek
55/55 incl. tonos and dialytika, Latin full, check 1 0/8, glyf aligned. **Patrick Hand is discarded**:
Latin-only (4/55 Greek), whatever the research report said. Verdict for both: **screen further, `calt`
flagged**; the pixel guard and advance parity decide, and a `calt` face has passed before (IBM Plex Sans
Thai). Rank Mynerve first on size. If both fail, Greek stays upright-only and the languages page says so.

### Hebrew, second handwriting face (appendix; Gveret Levin is the only one)

**Amatic SC** (Vernon Adams and contributors, OFL 1.1,
[OFL.txt](https://github.com/googlefonts/AmaticSC/blob/master/OFL.txt)). Narrow hand-drawn capitals
against Gveret Levin's flowing pen. Static Regular 148KB / Bold 152KB. Coverage **Hebrew 27/27, Cyrillic
70/70, Latin**; niqqud shape via `mark`/`mkmk` (שָׁלוֹם lays out as 7 glyphs, no notdef). Check 1 0/11
Hebrew with niqqud, 0/8 Cyrillic. glyf aligned. **Screen further; it would close the Hebrew and Cyrillic
handwriting gaps with one 148KB file.** The caveat to say in the picker: it is caps-only, so Latin and
Cyrillic lowercase render as small capitals. Hebrew has no case, so it is unaffected.

### CJK

Unchanged: not worth candidate research until build-time pre-subsetting exists. Names the agent
surfaced, **unverified** and recorded only so they are not re-found: Zen Maru Gothic (JP, rounded),
LXGW WenKai / WenKai TC (SC/TC, kaiti handwriting style), Gowun Batang (KR, serif).

### Cross-script summary

| Script | Top pick | Runner-up | Top pick's open risk |
| --- | --- | --- | --- |
| Arabic family | Vazirmatn | none (Cairo discarded, Amiri set aside) | `calt` + `ss01`; run the 151-case Arabic guard and the Pashto corpus |
| Bengali | Hind Siliguri | none (Tiro Bangla hangs fontkit) | pixel guard vs Noto's six known divergences |
| Gurmukhi | Tiro Gurmukhi | none | no Bold; Italic is the only second style |
| Telugu | Suranna | none | 610KB, no Bold |
| Tamil | Tiro Tamil | Mukta Malar, Catamaran | no Bold |
| Malayalam | Gayathri | none | none found |
| Thai handwriting | Sriracha | none | advance parity (what sank Sarabun/Kanit); glyf repad |
| Devanagari handwriting | Tillana | Amita | glyf repad; kerning parity |
| Cyrillic handwriting | Neucha | Marck Script, Amatic SC | none found |
| Greek handwriting | Mynerve | Mansalva | `calt` on both |
| Hebrew handwriting | Amatic SC | none | caps-only; say so in the picker |

The screening scripts for this pass (`crash-screen.mjs`, byte probe, glyf check redirect) were session
scratch and are not in the repo; the fixture corpora and `check-font-glyf-alignment.js` are, and
reproducing the run is download plus two small scripts against them.
