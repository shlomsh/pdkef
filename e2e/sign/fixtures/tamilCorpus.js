/**
 * Systematically-generated Tamil correctness corpus for
 * e2e/sign/tamil-shaping-guard.spec.js.
 *
 * Same discipline as gurmukhiCorpus.js/teluguCorpus.js (see those files'
 * headers for the full reasoning on `autoCalibrate` over a hand-picked
 * calibration set): no in-house Tamil shaping reference exists to
 * hand-classify contextual GSUB substitutions, so the corpus is a
 * systematic sweep and the harness partitions it by fontkit's own judgment.
 *
 * Letter/mark set sourced directly from Noto Sans Tamil's own cmap (measured
 * 2026-08-28). Tamil's consonant inventory is NOT a contiguous Unicode
 * range the way Devanagari/Bengali/Gurmukhi/Telugu's are - modern Tamil
 * uses only 18 native consonants (it has no separate letters for
 * voiced/aspirated stops; one letter covers multiple sounds by context) plus
 * five "Grantha" letters (ஜ ஶ ஷ ஸ ஹ) borrowed to write Sanskrit/English
 * loanwords in ordinary modern print (ஜனவரி "January", ஹலோ "hello") - so
 * `BASE_CONSONANTS` below is a literal list of the 23 covered codepoints,
 * not a range with exclusions:
 *
 * 1. `vowelSignCases` - every consonant crossed with every vowel sign Tamil
 *    ordinarily needs (ா ி ீ ு ூ ெ ே ை ொ ோ ௌ - AA/I/II/U/UU/E/EE/AI/O/OO/AU).
 *    Tamil's AU has two orthographies: `ௌ` (U+0BCC) is the single reformed
 *    codepoint used here, and `ௗ` (AU LENGTH MARK, U+0BD7) is the second
 *    part of the older two-piece "split vowel sign" style (vowel sign O +
 *    length mark) - both are tested (`auTraditionalCases`) since a font can
 *    disagree on either orthography independently.
 * 2. `pulliCases` - every consonant + pulli (Tamil's virama, ், U+0BCD)
 *    alone. Modern Tamil orthography, unlike Devanagari/Bengali/Telugu,
 *    mostly does NOT ligate consonant clusters into a fused conjunct glyph -
 *    a cluster is usually written as consonant + visible pulli + consonant,
 *    each letter kept separate - so the main risk here is simpler than the
 *    other Brahmic guards in this directory: does pulli attach and render
 *    at all, not which glyph a ligature resolves to.
 * 3. `specialLigatureCases` - the handful of genuinely fused traditional
 *    ligatures Tamil print DOES use ("korvai eluthu"): ங்க (nga+pulli+ka),
 *    ஞ்ச (nya+pulli+ca), ண்ட (nna+pulli+tta), ந்த (na+pulli+ta), ன்ற
 *    (nnna+pulli+rra) - and ஸ்ரீ (sa+pulli+ra+ii), the SA+RA+II cluster used
 *    as an auspicious name-prefix in Tamil, conventionally rendered as one
 *    compact Grantha-derived ligature rather than three separate letters.
 *    These are exactly the strings where two shapers could plausibly choose
 *    a different glyph, unlike the ordinary un-ligated clusters above.
 *
 * The Tamil-specific number/fraction/calendar signs (೦-௹, U+0BF0-U+0BFA),
 * the rare Sanskrit-loan anusvara (ஂ, U+0B82) and ௐ (TAMIL OM) are
 * deliberately excluded as historical, specialist, or religious-symbol
 * usage, not part of ordinary modern Tamil form-filling text - mirroring
 * DEVANAGARI_VOWELS' and BENGALI_VOWELS' exclusion of vocalic-L in
 * scripts/font-languages.mjs. ஃ (aytham, U+0B83) IS included below as a
 * base letter - traditionally Tamil's 13th vowel ("uyir ezhuthu"), not a
 * rare mark, and it appears in ordinary loanword transliteration (ஃபோன்
 * "phone").
 */

export const BASE_CONSONANTS = [
  'க', 'ங', 'ச', 'ஜ', 'ஞ', 'ட', 'ண', 'த', 'ந', 'ன',
  'ப', 'ம', 'ய', 'ர', 'ற', 'ல', 'ள', 'ழ', 'வ', 'ஶ', 'ஷ', 'ஸ', 'ஹ',
];

export const AYTHAM = 'ஃ';

const VOWEL_SIGNS = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];
const PULLI = '்';
const AU_LENGTH_MARK = 'ௗ'; // traditional two-part AU: vowel sign O + this

export const identityCases = [...BASE_CONSONANTS, AYTHAM].map((ch) => ({ id: `identity:${ch}`, text: ch }));

export const vowelSignCases = BASE_CONSONANTS.flatMap((consonant) => VOWEL_SIGNS.map((sign) => ({
  id: `vowelSign:${consonant}+${sign.codePointAt(0).toString(16)}`,
  text: consonant + sign,
})));

/** Traditional split-orthography AU: consonant + vowel sign O + AU length mark. */
export const auTraditionalCases = BASE_CONSONANTS.map((consonant) => ({
  id: `auTraditional:${consonant}+O+lengthMark`,
  text: consonant + 'ொ' + AU_LENGTH_MARK,
}));

export const pulliCases = BASE_CONSONANTS.map((consonant) => ({
  id: `pulli:${consonant}+pulli`,
  text: consonant + PULLI,
}));

export const specialLigatureCases = [
  { id: 'ligature:ngka', text: 'ங' + PULLI + 'க' },
  { id: 'ligature:nyca', text: 'ஞ' + PULLI + 'ச' },
  { id: 'ligature:nnta', text: 'ண' + PULLI + 'ட' },
  { id: 'ligature:nta', text: 'ந' + PULLI + 'த' },
  { id: 'ligature:nnnra', text: 'ன' + PULLI + 'ற' },
  { id: 'ligature:sri', text: 'ஸ' + PULLI + 'ரீ' }, // ஸ்ரீ - SA+virama+RA+vowel sign II
];

export const TAMIL_CORPUS = [
  ...identityCases,
  ...vowelSignCases,
  ...auTraditionalCases,
  ...pulliCases,
  ...specialLigatureCases,
];
