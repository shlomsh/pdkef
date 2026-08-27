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
 * - Thai: consonants, vowels (pre/post/above/below), tone marks and digits.
 * - Latin: plain ASCII upper/lower, the shared baseline every "+Latin"
 *   combination is judged against.
 * - Latin-Ext: a representative, explicitly non-exhaustive set of the
 *   accented Latin letters common across French/German/Spanish/Portuguese/
 *   Scandinavian/Turkish text. This one is deliberately a sample, not a
 *   claim of completeness - said plainly here rather than left implicit.
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
  thai: {
    label: 'Thai',
    codePoints: codePointsOf(THAI_CONSONANTS + THAI_VOWELS_TONES + THAI_LEADING_AND_MARKS + THAI_DIGITS),
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
