/**
 * Systematically-generated Gurmukhi (Punjabi) correctness corpus for
 * e2e/sign/gurmukhi-shaping-guard.spec.js.
 *
 * Same discipline as devanagariCorpus.js/bengaliCorpus.js (see those files'
 * headers for the general reasoning): an enumerated corpus targeting the
 * real shaping rules Gurmukhi needs checked, judged only against the same
 * browser's own native rendering, never a hand-derived notion of "correct".
 *
 * Unlike self-calibrating latinNameCorpus.js, this corpus is NOT hand-picked
 * realistic strings - it is a systematic sweep (every consonant crossed with
 * every vowel sign, every consonant with the two nasalization/gemination
 * marks, every consonant in the three "pairin" below-base conjunct forms).
 * `autoCalibrate: true` is still the right mode for it, though: rather than
 * hand-classifying which of these combinations fontkit treats as a plain
 * per-codepoint lookup versus a real contextual (GSUB) substitution -
 * something this project has no in-house Gurmukhi shaping reference to
 * verify by hand the way Bengali's akhn/blwf/vatu/pstf/rphf features could
 * be read off Noto Sans Bengali's own GSUB table - autoCalibrate partitions
 * the corpus by fontkit's own substituted()/not-substituted() judgment, so
 * the calibration set is exactly "everything fontkit didn't change" and the
 * tested set is exactly "everything fontkit chose a different glyph for",
 * which is the only set where the browser and fontkit could disagree at
 * all. See shapingGuardHarness.js's module doc for why this mode exists.
 *
 * **The candidate is Mukta Mahee, not Noto Sans Gurmukhi, and this corpus is
 * what settled that.** Noto Sans Gurmukhi was the obvious first pick (it is
 * what every other script in the catalogue uses) and it does not work:
 * fontkit throws an uncaught
 * `Cannot read properties of null (reading 'xCoordinate')` inside
 * `GPOSProcessor.getAnchor` on 203 of the 500 cases generated below - every
 * vowel sign except AA/I/II on most consonants - and on most ordinary words,
 * ਸਿੰਘ ("Singh") and ਗੁਰੂ ("Guru") included. Confirmed to reach the real
 * export path, not just this harness: `signPdf` on a one-element document
 * rejects with that raw TypeError rather than a clean
 * `UnrepresentableTextError`, so a user would have hit a crashing Download
 * rather than an honest refusal. Confirmed not to be an artifact of
 * instancing the variable font to static Regular/Bold - the upstream
 * `NotoSansGurmukhi[wdth,wght].ttf` crashes identically. This is the same
 * engine limit TODO.md already records for Noto Nastaliq Urdu. Four OFL
 * alternates were then screened against this corpus (Mukta Mahee, Anek
 * Gurmukhi, Noto Serif Gurmukhi, Baloo Paaji 2) and all four shape all 500
 * cases without crashing, so the fault is specific to the Noto Sans face,
 * not to Gurmukhi. Mukta Mahee (Ek Type, OFL 1.1) was picked for shipping
 * real static Regular and Bold files, full coverage of the ordinary Punjabi
 * set plus Latin, already-2-byte-aligned `loca` (no repadding needed), and
 * a clean humanist-sans tone appropriate to a form-filling tool.
 *
 * Letter/mark set sourced directly from Mukta Mahee's own cmap
 * (measured 2026-08-28, not assumed from a textbook alphabet count):
 *
 * 1. `baseConsonants` - the 33 letters Unicode assigns in the U+0A15-U+0A39
 *    range (four codepoints in that range - U+0A29, U+0A31, U+0A34, U+0A37 -
 *    are unassigned, the same shape of gap DEVANAGARI_CONSONANTS documents
 *    in scripts/font-languages.mjs for the mirrored Devanagari block).
 * 2. `nuktaConsonants` - five precomposed nukta letters for Perso-Arabic/
 *    English loan sounds (ਖ਼ ਗ਼ ਜ਼ ਫ਼) plus ੜ RRA, which - unlike Bengali's
 *    equivalent loan sounds, written as base+nukta sequences with no
 *    dedicated codepoint - Unicode gives Gurmukhi its own atomic code
 *    points for (U+0A59, U+0A5A, U+0A5B, U+0A5C, U+0A5E). ੜ (RRA) is not a
 *    loan sound - it is a native Punjabi retroflex flap common in ordinary
 *    words (ਕੁੜੀ "kudi", ਪੜ੍ਹ "paṛh") - but shares this codepoint block with
 *    the four genuine loan letters, so it is tested alongside them.
 * 3. `vowelSignCases` - every base consonant crossed with every vowel sign
 *    (ਾ ਿ ੀ ੁ ੂ ੇ ੈ ੋ ੌ). ਿ (vowel sign I) is Gurmukhi's one pre-base
 *    reordering sign - typed after the consonant, drawn before it - the same
 *    "typed after, drawn before" axis every other Brahmic guard in this
 *    directory checks for its own script; the rest are post-base and
 *    included for the same systematic-sweep reason the other guards include
 *    their non-reordering signs.
 * 4. `nasalizationCases` - every base consonant with ਂ (tippi, U+0A70) and
 *    ੱ (addak, U+0A71), Gurmukhi's two extremely common nasalization/
 *    gemination marks (ਸਿੰਘ "Singh" needs tippi; ਪੱਗ "pagg/turban" needs
 *    addak) - included because a combining mark's attachment point is
 *    exactly the kind of thing a GPOS table can get subtly wrong.
 * 5. `pairinCases` - consonant + virama + {ਰ RA, ਵ VA, ਹ HA}, for every base
 *    consonant. This is Gurmukhi's "pairin"/"pairi akhar" feature: unlike
 *    Devanagari's wide conjunct-ligature repertoire, Gurmukhi's own visible
 *    stacking is essentially limited to these three letters attaching as a
 *    reduced below-base form to the preceding consonant (ਪ੍ਰ "pra" is the
 *    textbook example) - so this is the one place in the script two shapers
 *    could plausibly select a different glyph for a consonant cluster.
 *
 * Adak bindi (ਁ U+0A01), udaat (ੑ U+0A51), yakash (ੵ U+0A75) and the
 * abbreviation sign (੶ U+0A76) are deliberately excluded, mirroring
 * HEBREW_NIQUD's exclusion of meteg/rafe in scripts/font-languages.mjs: all
 * four are historical, Sikh-scripture-specific, or otherwise not part of
 * ordinary modern Punjabi writing (a name, an address, a filled-in form).
 */

const RA = 'ਰ';
const VA = 'ਵ';
const HA = 'ਹ';
const VIRAMA = '੍';

const UNASSIGNED = [0x0a29, 0x0a31, 0x0a34, 0x0a37];
export const BASE_CONSONANTS = Array.from({ length: 0x0a39 - 0x0a15 + 1 }, (_, i) => 0x0a15 + i)
  .filter((cp) => !UNASSIGNED.includes(cp))
  .map((cp) => String.fromCodePoint(cp));

export const NUKTA_CONSONANTS = [0x0a59, 0x0a5a, 0x0a5b, 0x0a5c, 0x0a5e].map((cp) => String.fromCodePoint(cp));

const VOWEL_SIGNS = [0x0a3e, 0x0a3f, 0x0a40, 0x0a41, 0x0a42, 0x0a47, 0x0a48, 0x0a4b, 0x0a4c].map((cp) => String.fromCodePoint(cp));

const TIPPI = 'ਂ';
const ADDAK = 'ੱ';

export const identityCases = [...BASE_CONSONANTS, ...NUKTA_CONSONANTS].map((ch) => ({
  id: `identity:${ch}`,
  text: ch,
}));

export const vowelSignCases = BASE_CONSONANTS.flatMap((consonant) => VOWEL_SIGNS.map((sign) => ({
  id: `vowelSign:${consonant}+${sign.codePointAt(0).toString(16)}`,
  text: consonant + sign,
})));

export const nasalizationCases = BASE_CONSONANTS.flatMap((consonant) => [
  { id: `tippi:${consonant}+tippi`, text: consonant + TIPPI },
  { id: `addak:${consonant}+addak`, text: consonant + ADDAK },
]);

export const pairinCases = BASE_CONSONANTS.flatMap((consonant) => [
  { id: `pairin:${consonant}+virama+RA`, text: consonant + VIRAMA + RA },
  { id: `pairin:${consonant}+virama+VA`, text: consonant + VIRAMA + VA },
  { id: `pairin:${consonant}+virama+HA`, text: consonant + VIRAMA + HA },
]);

export const GURMUKHI_CORPUS = [
  ...identityCases,
  ...vowelSignCases,
  ...nasalizationCases,
  ...pairinCases,
];
