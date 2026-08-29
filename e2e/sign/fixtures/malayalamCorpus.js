/**
 * Systematically-generated Malayalam correctness corpus for
 * e2e/sign/malayalam-shaping-guard.spec.js.
 *
 * Same discipline as gurmukhiCorpus.js/teluguCorpus.js/tamilCorpus.js (see
 * those files' headers for the full reasoning on `autoCalibrate` over a
 * hand-picked calibration set): no in-house Malayalam GSUB reference exists
 * the way Bengali's akhn/blwf/vatu/pstf/rphf features could be read directly
 * off Noto Sans Bengali's own table, so the corpus is a systematic sweep
 * across Malayalam's real shaping axes and the harness partitions it by
 * fontkit's own substituted/not-substituted judgment.
 *
 * **Malayalam's shaping axes are not Devanagari's, and porting them blindly
 * would test the wrong things.** Sourced from the Unicode 17.0 Malayalam
 * block chart (U+0D00-U+0D7F) and r12a's Malayalam orthography notes
 * (https://r12a.github.io/scripts/mlym/ml.html), not guessed:
 *
 * 1. **Vowel-sign placement is inverted from Devanagari's for most signs.**
 *    Devanagari's matra ि (I) is pre-base; Malayalam's vowel sign I (ി,
 *    U+0D3F) is post-base - the Unicode chart carries no "stands to the left"
 *    note for it, unlike E/EE/AI, which explicitly do. So AA/I/II/U/UU
 *    (U+0D3E, U+0D3F, U+0D40, U+0D41, U+0D42) are *not* a reordering axis in
 *    Malayalam at all - they are ordinary post-base attachment, and are used
 *    here only as calibration-diversity ink (`simpleVowelCases`), the same
 *    role Bengali's guard gives consonant+AA.
 * 2. `preBaseVowelCases` - only three vowel signs actually reorder: E (െ,
 *    U+0D46), EE (േ, U+0D47) and AI (ൈ, U+0D48), each explicitly marked
 *    "stands to the left of the consonant" in the Unicode chart. Every base
 *    consonant x each of the three.
 * 3. `twoPartVowelCases` - O (ൊ, U+0D4A) and OO (ോ, U+0D4B) are genuine
 *    two-part signs (a pre-base component plus a post-base component,
 *    canonically equivalent to E/EE + AA) that "should be handled as a unit"
 *    per the chart - Malayalam's version of Devanagari's ो/ौ axis, but only
 *    two signs here because AU splits off into its own group (next).
 * 4. **AU is the one vowel sign the 1971 orthography reform actually
 *    changed the recommended spelling of, and this corpus tests the
 *    reformed spelling deliberately - see the orthography note below.**
 *    `auCases` types every consonant + U+0D57 (AU LENGTH MARK) alone, which
 *    the Unicode chart annotates "used alone to write the /au/ dependent
 *    vowel in modern texts". The precomposed archaic form (ൌ, U+0D4C,
 *    annotated "archaic form of the /au/ dependent vowel") is deliberately
 *    NOT generated - see the orthography section below.
 * 5. `rephCases` / `rakarCases` - RA (ര) interacts with a cluster
 *    differently depending on position, per r12a: "When RA occurs in a
 *    cluster, either as a medial consonant or a coda followed by another
 *    consonant, there are special rules for rendering." Mirrors
 *    Devanagari/Bengali's reph/subjoined-RA split: `rephCases` is
 *    RA+virama+consonant (RA first, syllable-initial), `rakarCases` is
 *    consonant+virama+RA (RA second) - same two input characters, opposite
 *    order, not to be confused with each other.
 * 6. **Chillu letters - a class of consonant-final "dead consonant" forms
 *    with no equivalent in any other bundled script.** Malayalam alone among
 *    this catalogue's scripts has atomic codepoints (U+0D7A-U+0D7F) for a
 *    consonant with no following vowel: chillu NN/N/RR/L/LL/K. Modern
 *    practice types these as single codepoints (r12a: "modern practice uses
 *    atomic characters"), so `chilluBareCases` (all six, alone) is trivial
 *    cmap-lookup ink that lands in the auto-partitioned calibration set
 *    alongside `identityCases`/`simpleVowelCases`. The genuinely shaping-risk
 *    case is different: r12a documents that "chillu forms can sometimes be
 *    followed by a virama and subjoined consonant" - most visibly ൻ്റ
 *    (chillu N + virama + RRA, the "ente/nde" spelling), which the Unicode
 *    chart's own compound-name note calls "the preferred modern spelling".
 *    `chilluClusterCases` generates this pattern (each chillu + virama +
 *    a curated set of following consonants) rather than a full 6x36 cross
 *    product, because it is real orthographic content, not a mechanically
 *    exhaustive one.
 * 7. `conjunctCases` - a curated list of common Malayalam conjuncts likely
 *    in real names/addresses/form content (geminated consonants, common
 *    nasal+stop clusters, the classic ക്ഷ ligature, and two clusters with no
 *    equivalent elsewhere in this catalogue: റ്റ, the doubled RRA that
 *    Malayalam alone uses to spell a geminate /t/, and ന്റ, the *non-chillu*
 *    spelling of the same "nda/nte" cluster `chilluClusterCases` tests via
 *    the chillu spelling - both are real, both are typed, and a font can
 *    disagree on either independently).
 *
 * **Orthography decision: this corpus tests reformed (post-1971 "puthiya
 * lipi") Malayalam, not traditional, and that is deliberate, not a default.**
 * Malayalam underwent a state-mandated script reform in 1971 that cut the
 * number of printed graphemes by roughly 75% by writing most consonant
 * clusters as an explicit, visible chandrakkala (virama) plus a following
 * letter instead of a fused traditional ligature, and by changing AU's
 * recommended spelling from a two-part/precomposed form to a single post-base
 * length mark (see `auCases` above). Three reasons this corpus follows
 * reformed orthography rather than traditional:
 *   - It is the current official standard, taught in Kerala schools and used
 *     in essentially all digital typesetting and government content since
 *     1971 - the same "ordinary modern text" standard this catalogue's other
 *     corpora already hold themselves to (Devanagari excludes four
 *     rare/regional codepoints, Bengali excludes khanda ta and vocalic-L,
 *     Tamil excludes the archaic two-piece AU from its *primary* claim while
 *     still testing it separately).
 *   - Every candidate screened for this ticket (Noto Sans Malayalam) is,
 *     per r12a's own font survey, a "modern" design in the same bucket as
 *     Manjari - traditional ligature-heavy rendering is a property of a
 *     handful of specialist fonts (e.g. Rachana), not of anything in this
 *     catalogue's candidate pool, so testing traditional forms would be
 *     screening a font for behavior it was never built to have.
 *   - The alternative - testing whichever spelling a cluster happens to
 *     ligate to, per font - has no fixed "correct" answer to test against,
 *     which is exactly the ambiguity every other guard in this directory
 *     avoids by picking one committed orthography and stating it.
 * The archaic precomposed AU (U+0D4C) and traditional ligated conjunct forms
 * are out of scope for this guard as a result - not silently absent, named
 * here as a deliberate exclusion the way this file's other exclusions are.
 *
 * Base consonants: U+0D15 (ക KA) to U+0D3A (ഺ TTTA) inclusive, minus two
 * codepoints the Unicode chart itself marks "scholarly use only" - U+0D29
 * (ഩ NNNA) and U+0D3A (ഺ TTTA) - the same "most fonts were not built to
 * carry this" judgment DEVANAGARI_CORPUS applies to its own four exclusions.
 * Unlike Devanagari, Malayalam's block assigns ള/ഴ/റ (U+0D33/34/31) to real,
 * ordinary letters rather than leaving them reserved, so this range needs
 * only the two scholarly exclusions, not four.
 */

const CONSONANT_RANGE_START = 0x0d15; // ക KA
const CONSONANT_RANGE_END = 0x0d3a; // ഺ TTTA (scholarly-only, excluded below)
const SCHOLARLY_ONLY = [0x0d29, 0x0d3a]; // ഩ NNNA, ഺ TTTA

export const CONSONANTS = Array.from(
  { length: CONSONANT_RANGE_END - CONSONANT_RANGE_START + 1 },
  (_, i) => CONSONANT_RANGE_START + i,
)
  .filter((cp) => !SCHOLARLY_ONLY.includes(cp))
  .map((cp) => String.fromCodePoint(cp));

const RA = 'ര'; // U+0D30

const VOWEL_SIGN_AA = 'ാ'; // U+0D3E, post-base, no reordering
const VOWEL_SIGN_I = 'ി'; // U+0D3F, post-base, no reordering
const VOWEL_SIGN_U = 'ു'; // U+0D41, post-base, no reordering

const PRE_BASE_VOWEL_SIGNS = [
  { name: 'vowelSignE', sign: 'െ' }, // U+0D46
  { name: 'vowelSignEE', sign: 'േ' }, // U+0D47
  { name: 'vowelSignAI', sign: 'ൈ' }, // U+0D48
];

const TWO_PART_VOWEL_SIGNS = [
  { name: 'vowelSignO', sign: 'ൊ' }, // U+0D4A
  { name: 'vowelSignOO', sign: 'ോ' }, // U+0D4B
];

const AU_LENGTH_MARK = 'ൗ'; // U+0D57, reformed/modern AU spelling, used alone
const VIRAMA = '്'; // U+0D4D, candrakkala

const CHILLUS = [
  { name: 'chilluNN', ch: 'ൺ' }, // U+0D7A
  { name: 'chilluN', ch: 'ൻ' }, // U+0D7B
  { name: 'chilluRR', ch: 'ർ' }, // U+0D7C
  { name: 'chilluL', ch: 'ൽ' }, // U+0D7D
  { name: 'chilluLL', ch: 'ൾ' }, // U+0D7E
  { name: 'chilluK', ch: 'ൿ' }, // U+0D7F
];

// A representative, not-following-vowel consonant set for chilluClusterCases -
// three consonants spanning different places of articulation (dental/retroflex
// stop, velar stop) rather than a full 6x36 cross product, matching the
// "curate for what real content needs" approach this catalogue's conjunct
// lists already use.
const CHILLU_FOLLOWERS = ['റ', 'ത', 'ക'];

/** Bare consonant identity - trivial cmap-lookup ink, calibration-diversity input for autoCalibrate. */
export const identityCases = CONSONANTS.map((consonant) => ({
  id: `identity:${consonant}`,
  text: consonant,
}));

/** consonant + a single plain non-reordering vowel sign, for calibration-diversity across two-glyph ink. */
export const simpleVowelCases = CONSONANTS.flatMap((consonant) => [
  { id: `simpleVowel:${consonant}+AA`, text: consonant + VOWEL_SIGN_AA },
  { id: `simpleVowel:${consonant}+I`, text: consonant + VOWEL_SIGN_I },
  { id: `simpleVowel:${consonant}+U`, text: consonant + VOWEL_SIGN_U },
]);

/** consonant + pre-base vowel sign (E/EE/AI), for every consonant x every pre-base sign. */
export const preBaseVowelCases = CONSONANTS.flatMap((consonant) => PRE_BASE_VOWEL_SIGNS.map(({ name, sign }) => ({
  id: `preBaseVowel:${consonant}+${name}`,
  text: consonant + sign,
})));

/** consonant + two-part vowel sign (O/OO), for every consonant x every two-part sign. */
export const twoPartVowelCases = CONSONANTS.flatMap((consonant) => TWO_PART_VOWEL_SIGNS.map(({ name, sign }) => ({
  id: `twoPartVowel:${consonant}+${name}`,
  text: consonant + sign,
})));

/** consonant + reformed/modern AU spelling (length mark alone), for every consonant. See the orthography note above. */
export const auCases = CONSONANTS.map((consonant) => ({
  id: `au:${consonant}+lengthMark`,
  text: consonant + AU_LENGTH_MARK,
}));

/** RA + virama + consonant (reph-like), for every following consonant except RA itself. */
export const rephCases = CONSONANTS.filter((c) => c !== RA).map((consonant) => ({
  id: `reph:RA+virama+${consonant}`,
  text: RA + VIRAMA + consonant,
}));

/** consonant + virama + RA (rakar-like, RA second), for every preceding consonant except RA itself. */
export const rakarCases = CONSONANTS.filter((c) => c !== RA).map((consonant) => ({
  id: `rakar:${consonant}+virama+RA`,
  text: consonant + VIRAMA + RA,
}));

/** Bare chillu letters, alone - trivial cmap-lookup ink for the six modern chillu codepoints. */
export const chilluBareCases = CHILLUS.map(({ name, ch }) => ({
  id: `chilluBare:${name}`,
  text: ch,
}));

/** chillu + virama + consonant - the real "subjoined consonant after a chillu" pattern (e.g. ente/nde). */
export const chilluClusterCases = CHILLUS.flatMap(({ name, ch }) => CHILLU_FOLLOWERS.map((consonant) => ({
  id: `chilluCluster:${name}+virama+${consonant}`,
  text: ch + VIRAMA + consonant,
})));

/**
 * Curated common conjuncts likely in real names/addresses/form content.
 * Excludes anything already covered by rephCases/rakarCases (any cluster
 * built from RA + virama in either order) so this group tests genuinely
 * different conjunct-formation rules rather than duplicating them.
 */
export const conjunctCases = [
  // Geminated (doubled) consonants - very common in ordinary Malayalam words.
  { id: 'conjunct:kka', text: 'ക്ക' },
  { id: 'conjunct:ngnga', text: 'ങ്ങ' },
  { id: 'conjunct:chcha', text: 'ച്ച' },
  { id: 'conjunct:jja', text: 'ജ്ജ' },
  { id: 'conjunct:tta', text: 'ട്ട' },
  { id: 'conjunct:nna', text: 'ണ്ണ' },
  { id: 'conjunct:ttha', text: 'ത്ത' },
  { id: 'conjunct:nnadental', text: 'ന്ന' },
  { id: 'conjunct:ppa', text: 'പ്പ' },
  { id: 'conjunct:mma', text: 'മ്മ' },
  { id: 'conjunct:yya', text: 'യ്യ' },
  { id: 'conjunct:lla', text: 'ല്ല' },
  { id: 'conjunct:vva', text: 'വ്വ' },
  { id: 'conjunct:llaretroflex', text: 'ള്ള' },
  { id: 'conjunct:ssa', text: 'സ്സ' },
  // Common nasal+stop clusters.
  { id: 'conjunct:nka', text: 'ങ്ക' },
  { id: 'conjunct:ncha', text: 'ഞ്ച' },
  { id: 'conjunct:nda_retroflex', text: 'ണ്ട' },
  { id: 'conjunct:ntha', text: 'ന്ത' },
  { id: 'conjunct:nda', text: 'ന്ദ' },
  { id: 'conjunct:mpa', text: 'മ്പ' },
  // The classic three-consonant-derived conjunct, own dedicated glyph in most fonts.
  { id: 'conjunct:ksha', text: 'ക്ഷ' },
  // Malayalam-specific: doubled RRA, spells geminate /t/ with no equivalent
  // in this catalogue's other Brahmic scripts.
  { id: 'conjunct:rra_doubled', text: 'റ്റ' },
  // The non-chillu spelling of the same "nda/nte" cluster chilluClusterCases
  // tests via the chillu spelling (ൻ്റ) - full NA instead of chillu N.
  { id: 'conjunct:na_ra', text: 'ന്റ' },
];

export const MALAYALAM_CORPUS = [
  ...identityCases,
  ...simpleVowelCases,
  ...preBaseVowelCases,
  ...twoPartVowelCases,
  ...auCases,
  ...rephCases,
  ...rakarCases,
  ...chilluBareCases,
  ...chilluClusterCases,
  ...conjunctCases,
];
