/**
 * The character-set definitions the catalogue coverage report (W7,
 * docs/wysiwyg-text-architecture.md §8 stage 7) is judged against.
 *
 * This file is the one place a "language" is defined. Both
 * generate-font-coverage-report.mjs (which writes the committed report) and
 * src/lib/fontCoverageReport.test.js (which regenerates it in memory to
 * catch drift) import these definitions rather than each hand-maintaining
 * their own copy - the report's whole reason to exist is that "does the
 * catalogue cover X" stops being a claim someone can quietly get wrong.
 *
 * WHAT "REQUIRED" MEANS HERE, AND WHY IT IS NOT A SINGLE PROBE CHARACTER:
 * docs/wysiwyg-text-architecture.md §4.1's matrix used probe codepoints and
 * reported fractions for a reason - a boolean "covers Greek" derived from one
 * probe character is a lie the moment a real document needs a second one
 * (Heebo can draw a bare capital Omega but not an accented lowercase alpha).
 * Every language below is instead the language's real alphabet: upper AND
 * lower case, plus the diacritics/marks/digits that alphabet actually needs
 * to write ordinary text - not a stylized pangram, not a single probe glyph,
 * and not every rare or historical letter Unicode assigns to the block.
 * "full" coverage in the generated report means literally every codepoint
 * listed here has a glyph in that exact font file. Partial coverage is
 * reported as a fraction, never rounded up to "yes".
 *
 * Sources are the standard modern alphabets for each language as taught and
 * published (not exhaustive Unicode blocks, which include historical,
 * liturgical or minority-language letters most fonts never claim to need):
 * - Cyrillic: the seven anchor languages named in TODO.md's W7 entry
 *   (Russian, Ukrainian, Belarusian, Bulgarian, Serbian, Macedonian, Kazakh),
 *   each as its own modern 30-something-letter alphabet, not one shared
 *   Cyrillic superset - Ukrainian needs Ґ/І/Ї/Є and does not use Ы/Э/Ъ, and a
 *   family that covers Russian does not thereby cover Ukrainian.
 * - Hebrew: the 22 base letters plus 5 sofit (final) forms, plus the niqud
 *   (vowel-point) marks the sign editor's own composeHebrewClusters step
 *   cares about.
 * - Arabic: the 28 base letters plus Arabic-Indic digits. Farsi/Dari is kept
 *   as its own language (base Arabic + the four extra letters pe/che/zhe/gaf
 *   + the Extended Arabic-Indic digit block), because those are exactly the
 *   glyphs Arabic coverage alone does not prove.
 * - Greek: the 24-letter monotonic alphabet plus the accented vowel forms
 *   (ά έ ή ί ό ύ ώ ΐ ΰ ϊ ϋ and capitals) real Greek text uses constantly -
 *   this is precisely the set a bare-letter probe misses, which is why
 *   §4.1 measured Heebo and PT Sans as fractional rather than full.
 * - Devanagari: the independent vowels, standard consonants, vowel signs
 *   (matras), virama, anusvara/visarga/candrabindu and digits a Hindi
 *   sentence needs - not the wider block's Marathi/Sanskrit-only letters.
 *   Marathi is kept as its own language definition even though it needs no
 *   codepoint this file doesn't already list for Hindi: ळ (U+0933) and ऱ
 *   (U+0931), the two letters that set Marathi apart, already sit inside
 *   DEVANAGARI_CONSONANTS' U+0915-0939 range and are not among its two
 *   exclusions, so "covers Marathi" is a genuinely separate, checkable claim
 *   from "covers Hindi" even though the two share one codepoint set.
 * - Urdu: the same 28 base Arabic letters plus the four Perso-Arabic extra
 *   letters Farsi also needs, plus seven letters Arabic itself has no glyph
 *   for at all, plus Urdu's own ۰-۹ digits (identical code points to
 *   Farsi's) - kept as its own language for the same reason Farsi/Dari is:
 *   these are exactly the glyphs Arabic coverage alone does not prove.
 * - Pashto: the same 28 base Arabic letters plus the four Perso-Arabic extra
 *   letters Farsi also needs, plus the eleven letters that make Pashto
 *   script-complete and that no bundled font drew before Scheherazade New
 *   (ټ ځ څ ډ ړ ږ ښ ګ ڼ ې ۍ - see TODO.md's Pashto entry), reusing Farsi's
 *   Extended Arabic-Indic digit block since no Pashto-specific digit set is
 *   modeled here yet.
 * - Vietnamese: every tone-and-diacritic Latin letter modern Vietnamese
 *   writing needs, upper and lower case, defined as its own self-contained
 *   set the way every language here is (not a diff against `latinExt`).
 * - Thai: consonants, vowels (pre/post/above/below), tone marks and digits.
 * - Latin: plain ASCII upper/lower, the shared baseline every "+Latin"
 *   combination is judged against.
 * - Latin-Ext: a representative, explicitly non-exhaustive set of the
 *   accented Latin letters common across French/German/Spanish/Portuguese/
 *   Scandinavian/Turkish text. This one is deliberately a sample, not a
 *   claim of completeness - said plainly here rather than left implicit.
 * - Bengali: independent vowels, standard consonants, khanda ta, vowel signs
 *   (matras), candrabindu/anusvara/visarga/nukta/virama and digits a Bengali
 *   sentence needs - not the wider Unicode block's unassigned reserved slots.
 *   Assamese is kept as its own language definition (Bengali's set plus RA ৰ
 *   and VA ৱ, the two letters distinguishing it), since the catalogue's one
 *   Bengali-script font happens to carry both and that is worth stating as
 *   its own measured claim rather than folding silently into "Bengali".
 * - Korean: the modern Hangul syllable block (U+AC00-U+D7A3, all 11,172
 *   precomposed syllables) plus the compatibility jamo block a Korean
 *   keyboard actually types (U+3131-U+318E). Unlike Japanese/Chinese below,
 *   this is a genuinely closed, contiguous set - modern Korean orthography
 *   does not use Hanja (Chinese characters) in ordinary writing, so there is
 *   no open-ended "which characters count" question the way there is for
 *   Han, and Noto Sans KR's coverage of it can be stated as a clean "full"
 *   claim rather than a curated subset, the same shape of claim Devanagari
 *   and Thai above get.
 * - Chinese (Simplified and Traditional) is deliberately NOT a row here, for
 *   the same reason Japanese kanji above is not one: Han has no compact,
 *   closed alphabet the way every other language in this file does, and a
 *   probe-character claim would be exactly the lie this file's header warns
 *   against. Noto Sans SC and Noto Sans TC each carry a large, real, but
 *   curated subset - measured directly against the font bytes at roughly
 *   7,945 and 11,147 Han characters respectively, not derived from a named
 *   government list the way jōyō/jinmeiyō are - stated as prose in
 *   src/data/tools.js's Sign languages card, the same way jōyō/jinmeiyō are,
 *   because this file has no data to check the claim against either.
 */

/** Turns a literal string of characters into a sorted, de-duplicated codepoint array. */
function codePointsOf(str) {
  return [...new Set(Array.from(str, (ch) => ch.codePointAt(0)))].sort((a, b) => a - b);
}

function rangeOf(start, end) {
  const out = [];
  for (let cp = start; cp <= end; cp += 1) out.push(cp);
  return out;
}

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// A representative sample of Western/Central European accented Latin
// letters, not an exhaustive list of every diacritic combination Unicode
// permits - see the file-header note.
const LATIN_EXT =
  'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿŠšŽžŒœŸĄąĆćĘęŁłŃńŚśŹźŻż';

const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ'; // 22 base + 5 sofit forms
// Vowel points + shin/sin dots + qamats qatan that ordinary vowelized
// (niqud) Hebrew text uses - sheva through dagesh (0x05B0-0x05BC), the
// shin/sin dots and qamats qatan. Deliberately excludes meteg (U+05BD) and
// rafe (U+05BF): both are secondary-stress/historical-orthography marks from
// pointed liturgical or Yiddish text, not something ordinary modern
// vowelized Hebrew (a name, an address, a filled-in form) needs. Including
// them was the first draft of this set, and it produced a measured
// disagreement against docs/wysiwyg-text-architecture.md §4.1's "Nikud: Y"
// for every Hebrew-capable font (none of Heebo/Assistant/Gveret Levin embed
// U+05BD; Alef alone also lacks U+05BF) - called out in the W7 report rather
// than silently resolved either way. See the report's REPORT BACK notes for
// the exact numbers.
const HEBREW_NIQUD = [...rangeOf(0x05b0, 0x05bc), ...rangeOf(0x05c1, 0x05c2), 0x05c7];

const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي' + 'ءأإآؤئة'; // 28 base letters + hamza forms
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSO_ARABIC_EXTRA_LETTERS = 'پچژگی'; // pe, che, zhe, gaf, Farsi yeh
const PERSO_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹'; // Extended Arabic-Indic (Farsi/Dari) digits

// Urdu: the same 28 base Arabic letters and hamza forms, the four extra
// Perso-Arabic letters Farsi also needs (pe/che/zhe/gaf, plus the Farsi/Urdu
// yeh), seven letters Arabic has no glyph for at all - the retroflex tteh
// (ٹ), ddal (ڈ), rreh (ڑ), noon ghunna (ں), yeh barree (ے), heh goal (ہ) and
// teh marbuta goal (ۃ) - and Urdu's own ۰-۹ digits, which are the identical
// code points to Farsi's Extended Arabic-Indic digit block above (Urdu and
// Farsi share that digit set even though the two languages otherwise diverge
// in which extra letters they need beyond base Arabic).
const URDU_EXTRA_LETTERS = 'ٹڈڑںےہۃ';

// Pashto: the eleven letters TODO.md names as the only gap between Almarai's
// Arabic coverage and a script-complete Pashto alphabet - ttee (ټ), dhal
// variant hah (ځ), tsse (څ), ddal (ډ), rre (ړ), rre with dot above (ږ), seen
// with dot below/above (ښ), gaf (ګ), nnoon (ڼ), yeh with small v (ې) and yeh
// with tail (ۍ). Everything else in the Pashto alphabet is already the base
// Arabic set plus Farsi's four Perso-Arabic extras (Pashto shares those with
// Dari, its co-official partner in Afghanistan).
const PASHTO_EXTRA_LETTERS = 'ټځڅډړږښګڼېۍ';

const RUSSIAN = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
const UKRAINIAN = 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯабвгґдеєжзиіїйклмнопрстуфхцчшщьюя';
const BELARUSIAN = 'АБВГДЕЁЖЗІЙКЛМНОПРСТУЎФХЦЧШЫЬЭЮЯабвгдеёжзійклмнопрстуўфхцчшыьэюя';
const BULGARIAN = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯабвгдежзийклмнопрстуфхцчшщъьюя';
const SERBIAN = 'АБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШабвгдђежзијклљмнњопрстћуфхцчџш';
const MACEDONIAN = 'АБВГДЃЕЖЗЅИЈКЛЉМНЊОПРСТЌУФХЦЧЏШабвгдѓежзѕијклљмнњопрстќуфхцчџш';
const KAZAKH = RUSSIAN + 'ӘҒҚҢӨҰҮҺәғқңөұүһ';

const GREEK =
  'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψωΆΈΉΊΌΎΏάέήίόύώΐΰϊϋ';

// Independent vowels, standard consonants, matras, virama, anusvara/visarga/
// candrabindu, avagraha, OM, and digits - the set an ordinary Hindi sentence
// needs, not the full Devanagari block (which also carries Marathi/Sanskrit/
// Dravidian-loan letters no bundled font claims).
const DEVANAGARI_VOWELS = 'अआइईउऊऋएऐओऔ';
// क..ह, minus U+0929 (ऩ) and U+0934 (ऴ) - both are precomposed
// Dravidian-loanword letters (Unicode's block is not Hindi-specific), not
// part of the standard Hindi consonant inventory, which represents the same
// sounds via nukta combinations when it needs them at all. Excluding them
// is what made Kalam - the catalogue's only Devanagari-capable face - read
// as "full" rather than 0.973 partial on two letters no ordinary Hindi
// sentence uses; see the REPORT BACK notes for the measured numbers.
const DEVANAGARI_CONSONANTS = rangeOf(0x0915, 0x0939)
  .filter((cp) => cp !== 0x0929 && cp !== 0x0934)
  .map((cp) => String.fromCodePoint(cp))
  .join('');
const DEVANAGARI_MATRAS = 'ािीुूृेैोौ';
const DEVANAGARI_MARKS = 'ंःँ' + 'ॐ' + '्'; // anusvara, visarga, candrabindu, OM, virama
const DEVANAGARI_DIGITS = '०१२३४५६७८९';

const THAI_CONSONANTS = rangeOf(0x0e01, 0x0e2e).map((cp) => String.fromCodePoint(cp)).join(''); // ก..ฮ
const THAI_VOWELS_TONES = rangeOf(0x0e2f, 0x0e3a).map((cp) => String.fromCodePoint(cp)).join('');
const THAI_LEADING_AND_MARKS = rangeOf(0x0e40, 0x0e4e).map((cp) => String.fromCodePoint(cp)).join('');
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

// Japanese: hiragana, katakana and the common CJK/fullwidth punctuation an
// ordinary Japanese sentence uses - deliberately NOT the kanji a real
// sentence also needs. "Japanese" has no single alphabet the way Hebrew or
// Devanagari do: the honest requirement for kanji is Japan's two
// government-published lists (jōyō, 2,136 characters taught for general use,
// and jinmeiyō, 863 more permitted specifically in personal names), not
// Unicode's ~97,000-codepoint Han repertoire, and there is no compact way to
// spell either government list as a literal string or a handful of
// rangeOf() calls the way every other language block in this file does.
// Rather than fake completeness with a handful of probe kanji (the exact
// mistake this file's header warns against - a boolean "covers Japanese"
// derived from one probe character is a lie the moment a real document needs
// a second one), kanji is left out of the measured "required" set entirely
// and disclosed here, the same way HEBREW_NIQUD above discloses meteg/rafe
// and DEVANAGARI_CONSONANTS discloses the two Dravidian-loan exclusions.
// src/data/tools.js's Sign languages card states the kanji scope (jōyō +
// jinmeiyō, 2,999 characters, via the bundled Noto Sans JP subset) as prose
// rather than as something this report measures - it cannot verify a claim
// it has no data to check, and README/CLAUDE.md say so plainly instead of
// letting "full" imply more than kana.
const JAPANESE_HIRAGANA = rangeOf(0x3041, 0x3096).map((cp) => String.fromCodePoint(cp)).join('');
const JAPANESE_KATAKANA = [...rangeOf(0x30a1, 0x30fa), 0x30fc].map((cp) => String.fromCodePoint(cp)).join(''); // ァ..ヺ + ー (prolonged sound mark)
const JAPANESE_PUNCTUATION = '、。「」『』・'; // U+3001 U+3002 U+300C U+300D U+300E U+300F U+30FB

// Independent vowels, standard consonants, khanda ta, vowel signs (matras),
// candrabindu/anusvara/visarga/nukta/virama and digits - the set an ordinary
// Bengali sentence needs, not the full Unicode Bengali block (which also
// carries Assamese-only letters and reserved/unassigned codepoints most
// fonts never claim to draw).
const BENGALI_VOWELS = 'অআইঈউঊঋএঐওঔ'; // 11 independent vowels. Deliberately excludes
// vocalic L (ঌ U+098C) and vocalic LL (ৡ U+09E1), Sanskrit-loan letters
// modern Bengali does not teach as part of its alphabet - the same exclusion
// DEVANAGARI_VOWELS above makes for its own vocalic-L letter.
// ক..হ, minus four codepoints Unicode leaves unassigned in this range
// (0x09A9, 0x09B1, 0x09B3-0x09B5 - reserved slots for retroflex letters
// Bengali's block, unlike Devanagari's, never assigned at all, not
// assigned-but-excluded the way DEVANAGARI_CONSONANTS' two exclusions are).
const BENGALI_CONSONANTS = rangeOf(0x0995, 0x09b9)
  .filter((cp) => ![0x09a9, 0x09b1, 0x09b3, 0x09b4, 0x09b5].includes(cp))
  .map((cp) => String.fromCodePoint(cp))
  .join('');
const BENGALI_KHANDA_TA = 'ৎ'; // U+09CE - outside the consonant range above, taught as its own letter
const BENGALI_VOWEL_SIGNS = 'ািীুূৃেৈোৌ'; // matras, including the AA sign া
const BENGALI_MARKS = 'ঁংঃ' + '়' + '্'; // candrabindu, anusvara, visarga, nukta (ড়/ঢ়/য় are base+nukta sequences, not precomposed codepoints), virama
const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';
// The two letters that distinguish Assamese from Bengali proper - RA (ৰ,
// replacing র) and VA (ৱ). Kept separate from BENGALI_* rather than folded
// in, so "covers Bengali" and "covers Assamese" stay two different claims -
// see CLAUDE.md's Bengali entry for why this line exists at all.
const ASSAMESE_EXTRA_LETTERS = 'ৰৱ';

// Korean: every modern Hangul syllable (U+AC00-U+D7A3, 11,172 precomposed
// blocks) plus the compatibility jamo a Korean keyboard actually types
// (U+3131-U+318E). A closed, contiguous set - see the file-header note on
// why this can be a clean "full" claim the way Han cannot.
const KOREAN_HANGUL_SYLLABLES = rangeOf(0xac00, 0xd7a3).map((cp) => String.fromCodePoint(cp)).join('');
const KOREAN_COMPAT_JAMO = rangeOf(0x3131, 0x318e).map((cp) => String.fromCodePoint(cp)).join('');

// Vietnamese: every accented/tone-marked Latin letter modern Vietnamese
// writing needs, upper and lower case, defined as its own self-contained set
// the way every language row in this file is (not a diff against
// `latinExt`, even though some of these letters happen to also appear
// there). Six tones (unmarked, grave, acute, hook above, tilde, dot below)
// apply to twelve vowel graphemes (a ă â e ê i o ô ơ u ư y). The stacked
// circumflex/breve-plus-tone forms and the hook-above/dot-below forms on
// plain vowels all live in one contiguous Unicode block, Latin Extended
// Additional U+1EA0-U+1EF9 (45 letters x upper/lower - Ạ ạ Ả ả Ấ ấ ... Ỹ ỹ);
// the plain grave/acute/tilde/circumflex forms (à á ã â and so on) and the
// bare ă/ơ/ư/đ live in Latin-1 Supplement, Latin Extended-A and Latin
// Extended-B and are spelled out directly below.
const VIETNAMESE_STACKED = rangeOf(0x1ea0, 0x1ef9).map((cp) => String.fromCodePoint(cp)).join('');
const VIETNAMESE_PLAIN_ACCENTED =
  'ĂăÂâÊêÔôƠơƯưĐđÀàÁáÃãÈèÉéÌìÍíÒòÓóÕõÙùÚúÝý';

/**
 * @typedef {Object} LanguageDef
 * @property {string} label
 * @property {number[]} codePoints
 */

/** @type {Record<string, LanguageDef>} */
export const LANGUAGES = {
  latin: { label: 'Latin', codePoints: codePointsOf(LATIN) },
  latinExt: { label: 'Latin Extended (accented, representative sample)', codePoints: codePointsOf(LATIN_EXT) },
  hebrew: { label: 'Hebrew', codePoints: [...new Set([...codePointsOf(HEBREW_LETTERS), ...HEBREW_NIQUD])].sort((a, b) => a - b) },
  arabic: { label: 'Arabic', codePoints: [...codePointsOf(ARABIC_LETTERS), ...codePointsOf(ARABIC_DIGITS)] },
  farsi: {
    label: 'Farsi / Dari (Perso-Arabic)',
    codePoints: [
      ...codePointsOf(ARABIC_LETTERS),
      ...codePointsOf(PERSO_ARABIC_EXTRA_LETTERS),
      ...codePointsOf(PERSO_ARABIC_DIGITS),
    ].sort((a, b) => a - b),
  },
  urdu: {
    label: 'Urdu',
    codePoints: [
      ...codePointsOf(ARABIC_LETTERS),
      ...codePointsOf(PERSO_ARABIC_EXTRA_LETTERS),
      ...codePointsOf(URDU_EXTRA_LETTERS),
      ...codePointsOf(PERSO_ARABIC_DIGITS),
    ].sort((a, b) => a - b),
  },
  pashto: {
    label: 'Pashto',
    codePoints: [
      ...codePointsOf(ARABIC_LETTERS),
      ...codePointsOf(PERSO_ARABIC_EXTRA_LETTERS),
      ...codePointsOf(PASHTO_EXTRA_LETTERS),
      ...codePointsOf(PERSO_ARABIC_DIGITS),
    ].sort((a, b) => a - b),
  },
  cyrillicRussian: { label: 'Russian', codePoints: codePointsOf(RUSSIAN) },
  cyrillicUkrainian: { label: 'Ukrainian', codePoints: codePointsOf(UKRAINIAN) },
  cyrillicBelarusian: { label: 'Belarusian', codePoints: codePointsOf(BELARUSIAN) },
  cyrillicBulgarian: { label: 'Bulgarian', codePoints: codePointsOf(BULGARIAN) },
  cyrillicSerbian: { label: 'Serbian (Cyrillic)', codePoints: codePointsOf(SERBIAN) },
  cyrillicMacedonian: { label: 'Macedonian', codePoints: codePointsOf(MACEDONIAN) },
  cyrillicKazakh: { label: 'Kazakh (Cyrillic)', codePoints: codePointsOf(KAZAKH) },
  greek: { label: 'Greek', codePoints: codePointsOf(GREEK) },
  devanagari: {
    label: 'Devanagari (Hindi)',
    codePoints: codePointsOf(DEVANAGARI_VOWELS + DEVANAGARI_CONSONANTS + DEVANAGARI_MATRAS + DEVANAGARI_MARKS + DEVANAGARI_DIGITS),
  },
  marathi: {
    label: 'Marathi (Devanagari + ळ, ऱ)',
    // Same set as `devanagari` - ळ (U+0933) and ऱ (U+0931) already sit inside
    // DEVANAGARI_CONSONANTS' range and are not among its two exclusions - but
    // named separately so "covers Marathi" is its own stated, checkable claim.
    codePoints: codePointsOf(DEVANAGARI_VOWELS + DEVANAGARI_CONSONANTS + DEVANAGARI_MATRAS + DEVANAGARI_MARKS + DEVANAGARI_DIGITS),
  },
  thai: {
    label: 'Thai',
    codePoints: codePointsOf(THAI_CONSONANTS + THAI_VOWELS_TONES + THAI_LEADING_AND_MARKS + THAI_DIGITS),
  },
  japanese: {
    label: 'Japanese (kana + common punctuation only - see comment above, kanji not modeled here)',
    codePoints: codePointsOf(JAPANESE_HIRAGANA + JAPANESE_KATAKANA + JAPANESE_PUNCTUATION),
  },
  bengali: {
    label: 'Bengali (Bangla)',
    codePoints: codePointsOf(BENGALI_VOWELS + BENGALI_CONSONANTS + BENGALI_KHANDA_TA + BENGALI_VOWEL_SIGNS + BENGALI_MARKS + BENGALI_DIGITS),
  },
  assamese: {
    label: "Assamese (shares the Bengali script and this table's Bengali set, plus RA ৰ and VA ৱ)",
    codePoints: codePointsOf(BENGALI_VOWELS + BENGALI_CONSONANTS + BENGALI_KHANDA_TA + BENGALI_VOWEL_SIGNS + BENGALI_MARKS + BENGALI_DIGITS + ASSAMESE_EXTRA_LETTERS),
  },
  vietnamese: {
    label: 'Vietnamese',
    codePoints: [...new Set([...codePointsOf(VIETNAMESE_STACKED), ...codePointsOf(VIETNAMESE_PLAIN_ACCENTED)])].sort((a, b) => a - b),
  },
  korean: {
    label: 'Korean (Hangul)',
    codePoints: codePointsOf(KOREAN_HANGUL_SYLLABLES + KOREAN_COMPAT_JAMO),
  },
};

/**
 * The seven Cyrillic-script languages named as the anchor in TODO.md's W7
 * entry - kept as a named group so the report and its test can single them
 * out without re-typing the id list.
 */
export const CYRILLIC_ANCHOR_LANGUAGES = [
  'cyrillicRussian',
  'cyrillicUkrainian',
  'cyrillicBelarusian',
  'cyrillicBulgarian',
  'cyrillicSerbian',
  'cyrillicMacedonian',
  'cyrillicKazakh',
];

/**
 * The seven named combinations from docs/wysiwyg-text-architecture.md §4.1 /
 * §8 stage 7 and TODO.md's W7 entry. `cyrillicRussian` stands in for
 * "Cyrillic" in this table the way §4.1's matrix used one representative
 * probe set - the per-language Cyrillic anchor check above is what actually
 * verifies all seven.
 */
export const NAMED_COMBINATIONS = [
  ['hebrew', 'latin'],
  ['arabic', 'latin'],
  ['cyrillicRussian', 'latin'],
  ['greek', 'latin'],
  ['hebrew', 'cyrillicRussian'],
  ['hebrew', 'greek'],
  ['hebrew', 'arabic'],
];
