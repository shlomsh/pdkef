/**
 * Systematically-generated Bengali correctness corpus for
 * e2e/sign/bengali-shaping-guard.spec.js.
 *
 * Same discipline as devanagariCorpus.js (see that file's header for the
 * general reasoning): an enumerated corpus targeting the real shaping rules
 * Bengali needs checked, not a handful of hand-picked examples, and never
 * judged against a hand-derived notion of "correct" Bengali - only against
 * the same browser's own native rendering (see the spec file).
 *
 * Bengali and Devanagari are both complex Brahmic scripts and share the
 * broad shape of failure mode (glyph *selection* and *visual order*, given
 * an OpenType Indic shaper), but Bengali's own OpenType feature set
 * (akhn/blwf/vatu/pstf/rphf, confirmed present in Noto Sans Bengali's GSUB -
 * see CLAUDE.md's Bengali entry) motivates a different split into four
 * groups, not a straight port of Devanagari's:
 *
 * 1. `preBaseVowel` - every base consonant crossed with each vowel sign that
 *    has a pre-base visual component. Bengali ি (I) moves fully before its
 *    consonant, ে (E) and ৈ (AI) also sit to the left, and ো (O) / ৌ (AU)
 *    are visually two-part (a pre-base left component plus a post-base
 *    right component) - the same "typed after, drawn before" reordering
 *    Devanagari's matching group tests, just a wider set of signs.
 * 2. `reph` - RA (র) + virama + consonant, syllable-initial. Bengali's rphf
 *    feature turns this into a reph mark that moves to sit above a later
 *    consonant in the cluster, exactly the `র্ক`-family axis named in
 *    CLAUDE.md.
 * 3. `raphala` - consonant + virama + RA (RA second, not syllable-initial).
 *    Bengali's vatu feature draws this as ra-phala, a diagonal stroke
 *    attached below-and-right of the preceding consonant, not two separate
 *    letters - same two input characters as reph, opposite order, a
 *    different rule, deliberately not confused with it (mirrors
 *    subjoinedRaCases in the Devanagari corpus).
 * 4. `yaphala` - consonant + virama + YA (য second). Bengali's blwf/vatu
 *    features draw this as ya-phala, a distinctive diagonal-tail form
 *    attached to the preceding consonant - the `র and য post-forms, which
 *    move` CLAUDE.md calls out by name, tested here as its own axis because
 *    ya-phala's glyph shape has nothing in common with ra-phala's.
 * 5. `conjuncts` - a curated list of the Bengali conjuncts most likely to
 *    appear in real names, addresses and form content (akhn/blwf/cjct),
 *    including the classic three-consonant conjunct ক্ষ (KSSA) which is
 *    itself a dedicated glyph in most Bengali fonts, not a mechanical stack.
 *
 * khanda ta (ৎ, U+09CE) is deliberately NOT generated as a shaping case
 * here: it is its own precomposed codepoint with a plain cmap lookup, not a
 * glyph fontkit and Chromium could select differently through GSUB - the
 * font-languages.mjs comment for BENGALI_KHANDA_TA says the same thing.
 * fonts.test.js's coverage tests already prove the font has a glyph for it;
 * this corpus exists for the codepoints where two shapers really can
 * disagree.
 */

// 32 base consonants (ক..হ), minus the same four Unicode-unassigned
// codepoints scripts/font-languages.mjs's BENGALI_CONSONANTS excludes
// (0x09A9, 0x09B1, 0x09B3-0x09B5 - reserved retroflex slots Bengali's block
// never assigned), and minus RA (র) and YA (য), which this file uses as the
// trigger letters for reph/ra-phala/ya-phala rather than as an ordinary base
// consonant under test.
const RA = 'র';
const YA = 'য';
const UNASSIGNED = [0x09a9, 0x09b1, 0x09b3, 0x09b4, 0x09b5];

export const CONSONANTS = Array.from({ length: 0x09b9 - 0x0995 + 1 }, (_, i) => 0x0995 + i)
  .filter((cp) => !UNASSIGNED.includes(cp))
  .map((cp) => String.fromCodePoint(cp))
  .filter((ch) => ch !== RA && ch !== YA);

const VIRAMA = '্';

// Vowel signs with a pre-base visual component: ি (I) and ে/ৈ (E/AI) sit
// fully to the left of the consonant; ো/ৌ (O/AU) are visually two-part (a
// pre-base left component plus a post-base right component), so a shaper
// that only got the post-base signs right could still fail these silently.
const PRE_BASE_VOWEL_SIGNS = [
  { name: 'vowelSignI', sign: 'ি' },
  { name: 'vowelSignE', sign: 'ে' },
  { name: 'vowelSignAI', sign: 'ৈ' },
  { name: 'vowelSignO', sign: 'ো' },
  { name: 'vowelSignAU', sign: 'ৌ' },
];

/** consonant + pre-base vowel sign, for every consonant x every pre-base sign. */
export const preBaseVowelCases = CONSONANTS.flatMap((consonant) => PRE_BASE_VOWEL_SIGNS.map(({ name, sign }) => ({
  id: `preBaseVowel:${consonant}+${name}`,
  text: consonant + sign,
})));

/** RA + virama + consonant (reph), for every following consonant. */
export const rephCases = CONSONANTS.map((consonant) => ({
  id: `reph:RA+virama+${consonant}`,
  text: RA + VIRAMA + consonant,
}));

/** consonant + virama + RA (ra-phala), for every preceding consonant. */
export const raphalaCases = CONSONANTS.map((consonant) => ({
  id: `raphala:${consonant}+virama+RA`,
  text: consonant + VIRAMA + RA,
}));

/** consonant + virama + YA (ya-phala), for every preceding consonant. */
export const yaphalaCases = CONSONANTS.map((consonant) => ({
  id: `yaphala:${consonant}+virama+YA`,
  text: consonant + VIRAMA + YA,
}));

/**
 * Curated common conjuncts likely in real names/addresses/form content.
 * Excludes anything already covered by rephCases/raphalaCases/yaphalaCases
 * (any cluster built from RA or YA in either position) so this group tests
 * genuinely different conjunct-formation rules rather than duplicating them.
 */
export const conjunctCases = [
  { id: 'conjunct:kssa', text: 'ক্ষ' }, // KA+virama+SSA - the classic three-part conjunct, own dedicated glyph
  { id: 'conjunct:jna', text: 'জ্ঞ' }, // JA+virama+NYA
  { id: 'conjunct:nta', text: 'ন্ত' },
  { id: 'conjunct:nda', text: 'ন্দ' },
  { id: 'conjunct:mpa', text: 'ম্প' },
  { id: 'conjunct:mba', text: 'ম্ব' },
  { id: 'conjunct:tta', text: 'ত্ত' },
  { id: 'conjunct:ttha', text: 'ত্থ' },
  { id: 'conjunct:sta', text: 'স্ত' },
  { id: 'conjunct:sva', text: 'স্ব' },
  { id: 'conjunct:ska', text: 'স্ক' },
  { id: 'conjunct:kta', text: 'ক্ত' },
  { id: 'conjunct:kka', text: 'ক্ক' },
  { id: 'conjunct:ngka', text: 'ঙ্ক' },
  { id: 'conjunct:ncha', text: 'ঞ্চ' },
  { id: 'conjunct:nja', text: 'ঞ্জ' },
  { id: 'conjunct:ddha', text: 'দ্ধ' },
  { id: 'conjunct:dbha', text: 'দ্ভ' },
  { id: 'conjunct:shcha', text: 'শ্চ' },
  { id: 'conjunct:shna', text: 'শ্ন' },
  { id: 'conjunct:hna', text: 'হ্ন' },
  { id: 'conjunct:hma', text: 'হ্ম' },
];

/**
 * Six real, measured fontkit-vs-Chromium disagreements, found while building
 * this guard and while re-geometrying it under SIGN-19 - not harness artifacts
 * (see shapingGuardHarness.js's `shape()` comment for the *other* thing that
 * looked like one and wasn't real) and not tuned away by loosening tolerance,
 * per CLAUDE.md's standing rule that a shaper disagreement is a finding, not
 * something to paper over.
 *
 * - `raphala:ট+virama+RA` ("ট্র") and `raphala:ঠ+virama+RA` ("ঠ্র"): both
 *   pixel-diff around 42% against Chromium's native rendering at IDENTICAL
 *   total advance width (widthDiff ~0px) - so this is a real positioning
 *   disagreement in how fontkit places the zero-advance `raphalabeng` tail
 *   glyph relative to the retroflex consonant's below-base "half" form, not
 *   a missing-glyph problem. The other eight consonant+ra-phala combinations
 *   tested (দ, ধ, ন, ত, থ, ড, ঢ, ণ) all pass, so this is narrow to these two
 *   retroflex letters specifically, not systemic to ra-phala as a feature.
 * - `conjunct:kka` ("ক্ক", doubled KA): fontkit falls back to three
 *   unligated glyphs (KA, visible virama, KA - total advance 161.4px at the
 *   old 100px geometry) where Chromium renders a compact ligated conjunct at
 *   78.9px, essentially one KA's width - a real GSUB feature-application
 *   gap (fontkit isn't triggering the conjunct-forming feature for this
 *   specific doubled consonant, though it does for others tested here, e.g.
 *   গ্গ, ম্ম, প্প - own exploration, not part of this corpus).
 * - `conjunct:ska` ("স্ক", SA + virama + KA), added 2026-08-29 under SIGN-19.
 *   **The most visible of the five, and the one that reaches the download.**
 *   fontkit emits `uni09B809CD.half` + `baphalabeng.alt4` + `uni0995.part`
 *   and no `headlinebeng.*` component, so the conjunct is drawn **without the
 *   headline segment over its right-hand KA part**, and that part renders as a
 *   detached blob instead of a connected hook - confirmed by eye at 400px, not
 *   inferred from a percentage. Its total advance is 64.00px against
 *   Chromium's 74.50px, a **14% under-report**, which in an exported PDF puts
 *   whatever follows 10.5px too far left. Both numbers are identical on macOS
 *   and Linux (Linux reads 75.00 only because it rounds advances to whole
 *   pixels), so this is the font/shaper, not a platform. Pixel diff 7.5% at a
 *   0.00% noise floor. The neighbouring conjuncts that share its first two
 *   glyphs are fine (`স্ব` agrees to 0.5px, `স্ত` and `শ্চ` exactly), so this
 *   is one cluster, not a broken feature.
 * - `preBaseVowel:ট+vowelSignI` ("টি"), added 2026-08-29 under SIGN-19.
 *   Advance agrees exactly (325.20px both sides at 400px), and the pre-base
 *   reordering itself is right - fontkit does put the I-sign first. The
 *   disagreement is in where the `uni099F.flag` component lands on the
 *   retroflex TTA body, so the letter is subtly malformed rather than
 *   mis-ordered. 8.7% (macOS) / 9.2% (Linux) against a 4% tolerance. **This
 *   one was hiding**: at the old 100px geometry it measured 13.78% against a
 *   14.48% tolerance and "passed" by 0.7 points, which is why the guard now
 *   renders large enough for the rasteriser noise to stop covering it.
 * - `conjunct:ddha` ("দ্ধ"), added 2026-08-29 under SIGN-19, and the odd one
 *   out: **its ink is right and its advance is not.** fontkit draws the
 *   conjunct essentially as Chromium does (4.59% pixel diff) but reports
 *   212.40px against Chromium's 258.00px at the 400px geometry - a 45.6px,
 *   18% under-report, thirty times what whole-pixel advance rounding could
 *   explain for three glyphs, and identical on both platforms. In an export
 *   that pulls whatever follows 45px too far left.
 *
 *   It is excluded here because a pixel diff of one string in isolation is
 *   simply the wrong instrument for it - the disagreement lives in trailing
 *   advance, where there is no ink to differ - so its 4.59% is a near-miss on
 *   a measurement that was never going to resolve it properly. It is not the
 *   only case of its kind: `হ্ন` (53.40 vs 74.40px) and `ক্ত` (71.00 vs
 *   91.00px) at the old geometry are the same defect and are **still in the
 *   enforced corpus**, passing at 6.16% and 7.27% because their ink matches.
 *   Closing that hole needs an advance-parity assertion beside the pixel one,
 *   which is **SIGN-20**; until it exists, do not read this corpus's green as
 *   a statement about cluster advances.
 *
 * **The keep-or-drop decision, re-opened as CLAUDE.md requires and re-taken:
 * keep the font.** The rule there is that a fourth divergence re-opens the
 * question rather than extending this list silently, so: six of 262 generated
 * cases is **2.3%** - and the honest figure is eight, because `হ্ন` and `ক্ত`
 * carry the same advance defect as `দ্ধ` and are only passing because this
 * guard cannot see it (SIGN-20). Against the 88% systemic disagreement that
 * got Playpen Sans Hebrew dropped from the catalogue outright, 3% is still a
 * different kind of finding. They stay narrow and enumerable, and they
 * are not scattered - they fall into two named groups. **Three (ট্র, ঠ্র, টি)
 * are fontkit misplacing a component part attached to a retroflex consonant**,
 * and **three (স্ক, দ্ধ, and ক্ক in its own way) are conjunct assembly**, where
 * fontkit omits a component or fails to ligate. Two bounded weaknesses, not a
 * general failure of Indic shaping.
 *
 * Bengali and Assamese users are better served by a font that draws 256 of 262
 * clusters correctly and names the rest than by having no Bengali at all, which
 * is the only alternative - there is no second OFL Bengali face that fontkit
 * shapes better (Noto is the reference implementation for this script). What is
 * NOT acceptable is shipping them unmentioned, so they are named to the user in
 * the Sign page's Bengali FAQ, `স্ক` included because it is the one somebody
 * could actually notice in their own document.
 *
 * **This list is now at the size where the next finding should change the
 * answer, not extend the list.** If a seventh appears - or if SIGN-20 lands and
 * shows the advance class is wider than the three clusters named here - re-open
 * the drop-or-keep question properly rather than adding a line.
 */
export const KNOWN_FONTKIT_DIVERGENCES = [
  'raphala:ট+virama+RA',
  'raphala:ঠ+virama+RA',
  'conjunct:kka',
  'conjunct:ska',
  'preBaseVowel:ট+vowelSignI',
  'conjunct:ddha',
];

export const BENGALI_CORPUS = [
  ...preBaseVowelCases,
  ...rephCases,
  ...raphalaCases,
  ...yaphalaCases,
  ...conjunctCases,
].filter((c) => !KNOWN_FONTKIT_DIVERGENCES.includes(c.id));
