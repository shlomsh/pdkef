/**
 * Systematically-generated Telugu correctness corpus for
 * e2e/sign/telugu-shaping-guard.spec.js.
 *
 * Same discipline as gurmukhiCorpus.js (see that file's header for the full
 * reasoning on why `autoCalibrate` - not a hand-picked calibration set - is
 * the right mode here): this project has no in-house Telugu shaping
 * reference to hand-classify which combinations are contextual GSUB
 * substitutions versus plain per-codepoint lookups, so the corpus is a
 * systematic sweep and the harness itself partitions it by fontkit's own
 * substituted()/not-substituted() judgment.
 *
 * **The candidate is Anek Telugu, not Noto Sans Telugu, and this corpus is
 * what settled that.** Noto Sans Telugu crashes fontkit with the same
 * uncaught `Cannot read properties of null (reading 'xCoordinate')` inside
 * `GPOSProcessor.getAnchor` that ruled out Noto Sans Gurmukhi (see
 * gurmukhiCorpus.js for the fuller write-up and the Nastaliq precedent).
 * Telugu's version is far narrower - 4 of the 630 cases below, all
 * consonant+virama+RA - but that group is not obscure: ప్ర "pra" is in
 * ఆంధ్రప్రదేశ్ ("Andhra Pradesh"), the state's own name, which fails. Noto
 * Serif Telugu fails the identical four cases, so this is a Noto-family
 * fault, not a Telugu one; six other OFL faces screened against this corpus
 * (Mallanna, Mandali, Anek Telugu, Ramabhadra, NTR, Suranna) crash on none
 * of the 630. Hind Guntur also shapes cleanly but was rejected on coverage:
 * it lacks all ten Telugu digits (U+0C66-U+0C6F). Anek Telugu (OFL 1.1) was
 * picked for full coverage of the ordinary Telugu set plus Latin, a Bold
 * instance available from its variable source, and a neutral UI-sans tone.
 * Its instanced statics needed the same `glyf` padding = 4 repadding Kalam
 * got (505 and 550 odd `loca` offsets), verified outline-, cmap- and
 * metrics-identical across all 738 outlined glyphs before landing.
 *
 * Letter/mark set sourced directly from Anek Telugu's own cmap
 * (measured 2026-08-28):
 *
 * 1. `baseConsonants` - the 36 letters Unicode assigns in the U+0C15-U+0C39
 *    range (one gap, U+0C29, unassigned - the same relative position
 *    DEVANAGARI_CONSONANTS and Gurmukhi's base range both exclude). Unlike
 *    Devanagari's U+0934 exclusion, Telugu's ఴ LLLA (U+0C34) and ఱ RRA
 *    (U+0C31) are both included: they are native Telugu letters, not
 *    Dravidian-loan exclusions the way Devanagari's equivalent slot is.
 * 2. `vowelSignCases` - every base consonant crossed with every vowel sign
 *    Telugu ordinarily needs (ా ి ీ ు ూ ృ ె ే ై ొ ో ౌ - AA/I/II/U/UU/
 *    vocalic-R-sign/E/EE/AI/O/OO/AU). Telugu's short e/o vowel signs (ె/ొ)
 *    and AI/AU are the ones most likely to carry a reordering or two-part
 *    rendering rule; this sweep does not presuppose which, and lets the
 *    harness's own substituted() check decide.
 * 3. `anusvaraVisargaCases` - every base consonant with ం (anusvara) and ః
 *    (visarga), Telugu's two common nasalization/aspiration marks.
 * 4. `raYaConjunctCases` - consonant + virama + {ర RA, య YA}, for every base
 *    consonant. Telugu's virama triggers pervasive below-base reduced
 *    ("vottu") consonant forms, and RA/YA second members are the two most
 *    common in ordinary text (ప్ర "pra", విద్య "vidya") - the same shape of
 *    axis as Bengali's ra-phala/ya-phala and Gurmukhi's pairin groups.
 * 5. `conjunctCases` - a curated list of common Telugu conjuncts likely in
 *    real names/addresses/form content, including క్ష (KSSA) and జ్ఞ (JNYA),
 *    both of which - as in Devanagari and Bengali - are their own dedicated
 *    glyphs in most Telugu fonts rather than a mechanical stack.
 *
 * Vocalic L/LL/RR (ఌ ఽ ౠ ౡ and their vowel-sign forms), the archaic
 * dialectal letters added in Unicode 6.0 (ఘ-block TSA/DZA/RRRA/NAKAARA
 * POLLU, U+0C58-U+0C5D) and the fraction/era signs (U+0C77-U+0C7F) are
 * deliberately excluded as historical or specialist, not part of ordinary
 * modern Telugu writing - mirroring DEVANAGARI_VOWELS' exclusion of vocalic
 * L in scripts/font-languages.mjs.
 */

const RA = 'ర';
const YA = 'య';
const VIRAMA = '్';

const UNASSIGNED = [0x0c29];
export const BASE_CONSONANTS = Array.from({ length: 0x0c39 - 0x0c15 + 1 }, (_, i) => 0x0c15 + i)
  .filter((cp) => !UNASSIGNED.includes(cp))
  .map((cp) => String.fromCodePoint(cp));

const VOWEL_SIGNS = [0x0c3e, 0x0c3f, 0x0c40, 0x0c41, 0x0c42, 0x0c43, 0x0c46, 0x0c47, 0x0c48, 0x0c4a, 0x0c4b, 0x0c4c]
  .map((cp) => String.fromCodePoint(cp));

const ANUSVARA = 'ం';
const VISARGA = 'ః';

export const identityCases = BASE_CONSONANTS.map((ch) => ({ id: `identity:${ch}`, text: ch }));

export const vowelSignCases = BASE_CONSONANTS.flatMap((consonant) => VOWEL_SIGNS.map((sign) => ({
  id: `vowelSign:${consonant}+${sign.codePointAt(0).toString(16)}`,
  text: consonant + sign,
})));

export const anusvaraVisargaCases = BASE_CONSONANTS.flatMap((consonant) => [
  { id: `anusvara:${consonant}+anusvara`, text: consonant + ANUSVARA },
  { id: `visarga:${consonant}+visarga`, text: consonant + VISARGA },
]);

export const raYaConjunctCases = BASE_CONSONANTS.flatMap((consonant) => [
  { id: `raConjunct:${consonant}+virama+RA`, text: consonant + VIRAMA + RA },
  { id: `yaConjunct:${consonant}+virama+YA`, text: consonant + VIRAMA + YA },
]);

/**
 * Curated common conjuncts likely in real names/addresses/form content.
 * Excludes anything already covered by raYaConjunctCases (any cluster built
 * from RA or YA in second position) so this group tests genuinely different
 * conjunct-formation rules rather than duplicating them.
 */
export const conjunctCases = [
  { id: 'conjunct:kssa', text: 'క్ష' }, // KA+virama+SSA - classic three-part conjunct, own dedicated glyph
  { id: 'conjunct:jnya', text: 'జ్ఞ' }, // JA+virama+NYA
  { id: 'conjunct:nta', text: 'న్త' },
  { id: 'conjunct:nda', text: 'న్ద' },
  { id: 'conjunct:mpa', text: 'మ్ప' },
  { id: 'conjunct:mba', text: 'మ్బ' },
  { id: 'conjunct:tta', text: 'త్త' },
  { id: 'conjunct:ttha', text: 'త్థ' },
  { id: 'conjunct:sta', text: 'స్త' },
  { id: 'conjunct:ska', text: 'స్క' },
  { id: 'conjunct:kta', text: 'క్త' },
  { id: 'conjunct:kka', text: 'క్క' },
  { id: 'conjunct:ngka', text: 'ఙ్క' },
  { id: 'conjunct:ncha', text: 'ఞ్చ' },
  { id: 'conjunct:ddha', text: 'ద్ధ' },
  { id: 'conjunct:shcha', text: 'శ్చ' },
  { id: 'conjunct:hna', text: 'హ్న' },
  { id: 'conjunct:hma', text: 'హ్మ' },
];

export const TELUGU_CORPUS = [
  ...identityCases,
  ...vowelSignCases,
  ...anusvaraVisargaCases,
  ...raYaConjunctCases,
  ...conjunctCases,
];
