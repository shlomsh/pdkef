# Font screening evidence

The per-font findings behind the screening rules in `.claude/rules/fonts-and-text.md`. The rule file
says what to do; this record says what was measured, on which font, and why the rule reads the way it
does. Add a section here when a screening produces a number worth keeping; do not put the number in
the rule.

## Bengali: six named shaper disagreements (Noto Sans Bengali)


**Bengali ships with six named shaper disagreements, and that is a curation decision, not an
oversight.** `e2e/sign/bengali-shaping-guard.spec.js` pixel-checks 262 generated cases against
Chromium; 256 match. The six that do not are listed by id in `KNOWN_FONTKIT_DIVERGENCES` in
`e2e/sign/fixtures/bengaliCorpus.js` with their measurements, and they fall into two named groups.
**Component placement on a retroflex consonant:** ট্র and ঠ্র place the zero-advance ra-phala tail
differently against a retroflex half-form (about 42% pixel diff at an *identical* advance width, so
a positioning disagreement rather than a missing glyph, and the other eight consonants tested pass),
and টি misplaces the TTA flag at an exactly matching advance. **Conjunct assembly:** ক্ক is a GSUB
gap where fontkit emits three unligated glyphs with a visible virama at 161.4px where Chromium
ligates to 78.9px; স্ক is drawn with no headline component over its KA part and under-reports its
advance by 14%; and দ্ধ draws correctly but reports an 18%-short advance. They are excluded from the
enforced corpus so the guard still protects the other 256, and each exclusion is named rather than
dropped. **The precedent this is measured against is Playpen Sans Hebrew, which was removed from the
catalogue entirely for an 88% systemic disagreement.** 2.3% across six narrow, enumerable clusters in
two named groups is a different thing, and the Sign page's Bengali FAQ names all six to the user
rather than claiming parity we do not have. **The list is now at the size where the next finding
should change the answer rather than extend it**: if a seventh appears, or if SIGN-20 shows the
advance class is wider than the clusters named here, re-open the drop-or-keep decision instead of
adding a line. Note also that দ্ধ's defect is one this pixel guard is structurally poor at seeing -

## Gurmukhi and Telugu: fontkit crashes on the Noto faces


**A font's Noto face is not automatically the right one, and "does fontkit crash on it" is the first
thing to measure.** Punjabi and Telugu (landed 2026-08-28) both ship on a **non-Noto** face, because
fontkit throws an uncaught `Cannot read properties of null (reading 'xCoordinate')` inside
`GPOSProcessor.getAnchor` on Noto Sans Gurmukhi (203 of 500 generated cases, and most ordinary words -
ਸਿੰਘ "Singh" included) and on Noto Sans Telugu (4 of 630, all consonant+virama+RA, which is ప్ర, which
is in ఆంధ్రప్రదేశ్). **This is the same crash that blocks Noto Nastaliq Urdu**, so it is a general
fontkit limit, not a Nastaliq quirk. Two things make it worth a standing rule rather than a footnote.
First, it **reaches the real export path**: `signPdf` rejects with that raw `TypeError`, not a clean
`UnrepresentableTextError`, so shipping it means a crashing Download rather than an honest refusal -
the one outcome this whole module exists to prevent. Second, it is **invisible to every other check** -
coverage is full, the `glyf` alignment guard passes, the font is real and OFL and looks correct in the
browser, because Chromium's shaper has no such problem. Only running the generated corpus through
fontkit finds it. So: **before wiring any new font, shape the whole corpus through fontkit and count
the crashes.** It costs one script and it eliminated two candidates here. Replacements are screened the
way the Arabic candidates were (Mukta Mahee for Punjabi, Anek Telugu for Telugu; Noto Sans Tamil needed
no screening and shipped as-is), and the Sign card *says* why the font is not the expected Noto one
rather than quietly substituting - `languageCoverage.test.js` pins that explanation.

## Handwriting faces: kerning parity (Caveat, Great Vibes)

every pixel comparison here - the only two exported-PDF render baseline cases that ever drifted across
platforms were Caveat and Great Vibes - and they carry a failure the upright faces do not: Caveat's
`measureText` disagrees with fontkit's summed advances by **5.1px on "Sarah Levi"** on macOS, which is
kerning one side applies and the other does not. So screen a handwriting candidate for **kerning
parity**, not just glyph coverage and shaping. The Latin/Caveat guard is already `test.skip`ped as red
for a related reason; do not read the other Latin guards' green as covering it.


## The advance-rounding bound (SIGN-19)

under SIGN-19: whole-pixel advance rounding can move a cluster by at most `glyphCount x 0.5px`, so
anything past that is the font or the shaper. Checked against every known case, it separates them
cleanly (হ্ন 21px against a 1.5px bound; `phrase:jumhuriya` 2.008px against an 8.5px bound).


## Pre-2026-08-29 tolerances were too loose

divergence, so re-screen before trusting an old green.** The Arabic guard's tolerance was **22.33%** -
it admitted roughly a quarter of the pixels differing - and Bengali's was 14.48%. This is not
theoretical: fixing the geometry immediately surfaced two real divergences in a face that had been
shipping as clean (`টি` had been *passing by 0.7 points* and is genuinely malformed; `স্ক` is drawn with
no bar across its top), taking Noto Sans Bengali's known-divergence list from three entries to six
without the font changing at all. **Arabic, Pashto and Bengali have been re-measured at the new
geometry; Devanagari, Tamil, Telugu and Gurmukhi have not** - they still run at the old small render
size, and their greens are in exactly the category Bengali's was. Re-screening them is a one-line
geometry change per guard and is the cheap move before leaning on those scripts or adding a language.


## Why the Brahmic guards auto-calibrate

partitions the corpus by fontkit's own substituted/not-substituted judgment instead of a hand-picked
set. That choice is deliberate and worth keeping: Bengali's calibration set could be hand-built because
its akhn/blwf/vatu/pstf/rphf features were readable straight off the font's GSUB table, and this
project has no equivalent in-house reference for the other three - so hand-classifying "which cases
have no shaping ambiguity" would have been a guess, and a wrong guess there produces a falsely wide
tolerance rather than a visible failure. Let the harness partition it.

**Fonts are subsetted on export, and that is a recent inversion of a long-standing invariant.**

## Kalam: unaligned glyf outlines corrupt the subset

(`font['glyf'].padding = 4` in fontTools; outlines, metrics and cmap all verified byte-identical
across all 1,027 glyphs) and `npm run test:fonts` now fails the build on any unaligned bundled font.
The lesson generalises past this one bug: **outline format does not predict whether a font subsets
correctly.** Five other bundled families share Kalam's `indexToLocFormat` and are all fine. Test the
font, not the format - and note that the older records disagree about this (TODO.md blames CFF and
variable builds, the design record says corruption reproduces on a static `glyf` font). Both
generalised from one sample; alignment was the actual variable.

**Glyph coverage is one stage of five, and all five now exist.** Drawing text correctly is
normalization, bidi, itemization, shaping, positioning. The export has normalization
(`composeHebrewClusters`, NFC plus gated Hebrew presentation-form recomposition), bidi

## Platform: what a green guard proves

that ran them - which, for a release, means the `ubuntu-latest` CI runner, since that is what gates
`main`. That used to be a much weaker statement than it looked: the guards passed on macOS and failed
on Linux on the same commit, because the comparison was picking up two artefacts of the measuring
browser rather than of the exported PDF (SIGN-19). Both are now removed or measured, so the Arabic,
Pashto and Bengali guards give the same verdict on both platforms and a green run means the same
thing wherever it happened. Two caveats survive that fix and should not be quietly dropped. The
**exported-PDF render guard is different**: its baseline is platform-bound, pinned to the CI runner,
and it **skips** on a developer's machine - so a green local `npm run test:e2e` has not run it at all,
and only CI's green covers it. And **there are no Linux users** - macOS, Windows, iPhone and Android
are the platforms, Linux is the build machine - so where the runner's rasteriser differs from a
user's, the runner is an instrument to correct, never a fidelity target to calibrate towards. Full
record: [docs/shaping-guard-platform-calibration.md](./shaping-guard-platform-calibration.md).
