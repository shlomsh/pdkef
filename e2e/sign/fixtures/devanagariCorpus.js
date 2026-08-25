/**
 * Systematically-generated Devanagari correctness corpus for
 * e2e/sign/devanagari-shaping-guard.spec.js.
 *
 * This is the "enumerated corpus, not a handful of examples" the Kalam
 * follow-up spike (TODO.md, "Internationalization: fonts for scripts beyond
 * Hebrew/Latin") called for before a Devanagari font could be proposed for
 * the catalogue. It targets the two axes Devanagari actually needs checked
 * (glyph *selection* and *visual order*, via reordering/ligation) rather than
 * porting Hebrew's Tier 1/2/3 guards, which were built around Hebrew's
 * different question (mark position, given shaping order was already right).
 *
 * Four generated groups, each targeting one real shaping rule:
 *
 * 1. `preBaseVowel` - every base consonant crossed with each vowel sign that
 *    has a pre-base visual component (matra ि repositions fully before the
 *    consonant; ो/ौ split into a pre-base part plus a post-base part). This
 *    is the "pre-base vowel-sign reordering" axis from the 6-string spike's
 *    `कि`, scaled from one consonant to all of them.
 * 2. `reph` - RA + virama + consonant, syllable-initial, for every following
 *    consonant. This is the `र्क` axis.
 * 3. `subjoinedRa` - consonant + virama + RA (RA second, not syllable
 *    initial), for every preceding consonant. This is the `शर्मा`-family
 *    axis: same two input characters (RA, virama) as reph, opposite order,
 *    a different rule, and the two must not be confused with each other.
 * 4. `conjuncts` - a curated list of the Devanagari conjuncts most likely to
 *    appear in real names, addresses and form content. Not every
 *    mathematically possible consonant cluster - Devanagari has dozens - just
 *    the common ones, the same "curate for what real content needs" approach
 *    CLAUDE.md's font catalogue already applies.
 *
 * Every case is verified against the *same browser's own shaping* (see the
 * spec file), never against a hand-derived notion of "correct" Devanagari -
 * this file only has to generate the inputs, not judge the outputs.
 */

// The 33 base consonants in conventional teaching order. Deliberately
// excludes the four rare/regional codepoints in the same Unicode block
// (U+0929 ऩ, U+0931 ऱ, U+0933 ळ, U+0934 ऴ) that most fonts, Kalam included,
// were not built to carry - the catalogue-is-ours-to-curate rule (CLAUDE.md)
// applies to which characters we test as much as which fonts we ship.
export const CONSONANTS = [
  'क', 'ख', 'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ',
  'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध', 'न',
  'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व',
  'श', 'ष', 'स', 'ह',
];

const VIRAMA = '्';
const RA = 'र';

// Vowel signs with a pre-base visual component. ि (I) moves fully before its
// consonant; ो (O) and ौ (AU) are visually two-part (a pre-base left
// component plus ा post-base), so a shaper that only got post-base signs
// right could still fail these silently.
const PRE_BASE_VOWEL_SIGNS = [
  { name: 'vowelSignI', sign: 'ि' },
  { name: 'vowelSignO', sign: 'ो' },
  { name: 'vowelSignAU', sign: 'ौ' },
];

/** consonant + pre-base vowel sign, for every consonant x every pre-base sign. */
export const preBaseVowelCases = CONSONANTS.flatMap((consonant) => PRE_BASE_VOWEL_SIGNS.map(({ name, sign }) => ({
  id: `preBaseVowel:${consonant}+${name}`,
  text: consonant + sign,
})));

/** RA + virama + consonant (reph), for every following consonant except RA itself. */
export const rephCases = CONSONANTS.filter((c) => c !== RA).map((consonant) => ({
  id: `reph:RA+virama+${consonant}`,
  text: RA + VIRAMA + consonant,
}));

/** consonant + virama + RA (subjoined/"eyelash" RA), for every preceding consonant except RA itself. */
export const subjoinedRaCases = CONSONANTS.filter((c) => c !== RA).map((consonant) => ({
  id: `subjoinedRa:${consonant}+virama+RA`,
  text: consonant + VIRAMA + RA,
}));

/**
 * Curated common conjuncts likely in real names/addresses/form content.
 * Excludes anything already covered by rephCases/subjoinedRaCases (any
 * cluster built from RA + virama in either order) so this group tests
 * genuinely different conjunct-formation rules rather than duplicating them.
 */
export const conjunctCases = [
  { id: 'conjunct:ksha', text: 'क्ष' },
  { id: 'conjunct:jnya', text: 'ज्ञ' },
  { id: 'conjunct:dya', text: 'द्य' },
  { id: 'conjunct:ddha', text: 'द्ध' },
  { id: 'conjunct:dva', text: 'द्व' },
  { id: 'conjunct:sta', text: 'स्त' },
  { id: 'conjunct:sva', text: 'स्व' },
  { id: 'conjunct:sna', text: 'स्न' },
  { id: 'conjunct:tta', text: 'ट्ट' },
  { id: 'conjunct:dda', text: 'ड्ड' },
  { id: 'conjunct:nna', text: 'न्न' },
  { id: 'conjunct:tta2', text: 'त्त' },
  { id: 'conjunct:kta', text: 'क्त' },
  { id: 'conjunct:pta', text: 'प्त' },
  { id: 'conjunct:lla', text: 'ल्ल' },
  { id: 'conjunct:hna', text: 'ह्न' },
  { id: 'conjunct:hma', text: 'ह्म' },
  { id: 'conjunct:hya', text: 'ह्य' },
  { id: 'conjunct:shta', text: 'ष्ट' },
  { id: 'conjunct:stha', text: 'स्थ' },
  { id: 'conjunct:nha', text: 'न्ह' },
  { id: 'conjunct:gna', text: 'ग्न' },
];

export const DEVANAGARI_CORPUS = [
  ...preBaseVowelCases,
  ...rephCases,
  ...subjoinedRaCases,
  ...conjunctCases,
];
