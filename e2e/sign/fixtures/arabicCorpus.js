/**
 * Systematically-generated Arabic correctness corpus for
 * e2e/sign/arabic-shaping-guard.spec.js.
 *
 * Modeled on devanagariCorpus.js's "enumerated corpus, not a handful of
 * examples" discipline (TODO.md, "Internationalization: fonts for scripts
 * beyond Hebrew/Latin"), but targets what Arabic actually needs checked:
 * *joining* (init/medi/fina/isol positional forms and cursive connection),
 * not reordering or conjunct formation - Arabic has no equivalent of
 * Devanagari's pre-base vowel signs or reph, and Hebrew never needed a
 * joining state machine at all (see docs/hebrew-text-shaping-export.md, "Why
 * no engine swap fixes this" - the section that names Arabic as the day the
 * bounded-shaper argument expires).
 *
 * Four generated groups, each targeting one real joining rule:
 *
 * 1. `positionalForms` - every dual-joining letter (can take all four forms)
 *    forced into isolated, initial, medial and final position using tatweel
 *    (U+0640, a dedicated joining/elongation character with no letter
 *    identity of its own - the standard technique for testing positional
 *    forms in isolation without a second real letter's own shape
 *    interfering) as a neutral joining neighbor. Verified directly against
 *    fontkit before this file was written: `بـ` (beh+tatweel) shapes beh to
 *    its INITIAL glyph, `ـب` (tatweel+beh) to FINAL, `ـبـ` to MEDIAL, and a
 *    bare `ب` to the isolated/default glyph - matching hand-derived
 *    Unicode joining rules exactly, letter by letter.
 * 2. `nonJoiningForms` - the six letters that only ever take isolated or
 *    final forms (ا د ذ ر ز و - Unicode's "right joining" class, informally
 *    "non-joining" since they never propagate a connection forward), each in
 *    both of the two forms they can actually take. A letter from this set
 *    breaks the chain immediately after it - verified: `ـد` (tatweel+dal)
 *    shapes dal to FINAL and stops there, `دـ` (dal+tatweel) shapes dal to
 *    its bare/isolated glyph and leaves tatweel isolated too, since dal
 *    never joins forward regardless of what follows it.
 * 3. `lamAlefLigatures` - the four mandatory lam-alef ligatures (لا لأ لإ
 *    لآ). These are not optional stylistic ligatures; Arabic orthography
 *    requires them, and a font/shaper that fails to merge lam+alef into one
 *    ligature glyph is not shaping Arabic correctly regardless of how well
 *    it handles ordinary joining.
 * 4. `diacritics` - the common harakat (fatha, damma, kasra, sukun, shadda,
 *    the three tanwin forms) applied to both a dual-joining letter and one
 *    of the non-joining letters, plus a shadda+fatha combination (the most
 *    common two-mark stack in real text, e.g. the doubled letter in
 *    "محمد"'s pattern). Marks are positioned via GPOS mark/mkmk anchoring,
 *    not the GSUB joining state machine, so this exercises a different part
 *    of the pipeline than groups 1-3 and must be checked separately.
 *
 * A fifth, curated group (`realisticStrings`) is not part of the systematic
 * axes above - it is a handful of real words and short phrases (a greeting,
 * a name, a formal salutation) in the spirit of Devanagari's curated common
 * conjuncts: the systematic groups prove the shaping *rules*, this group is
 * a sanity check against what a real user actually types.
 *
 * Every case is verified against the *same browser's own shaping* (see the
 * spec file), never against a hand-derived notion of "correct" Arabic - this
 * file only has to generate the inputs, not judge the outputs.
 */

const TATWEEL = 'ـ'; // U+0640, dedicated joiner/elongation character, no letter identity of its own

// The 22 letters that are "dual-joining" - they can take all four positional
// forms (isolated, initial, medial, final). Excludes the six right-joining
// letters below and the 28-letter alphabet's hamza-seat variants (أ إ ؤ ئ ء),
// which are covered separately where they matter (lam-alef ligatures carry
// three of the four hamza-on-alef combinations already).
export const DUAL_JOINING_LETTERS = [
  'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ',
  'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'ي',
];

// The six letters that only ever take isolated or final forms - Unicode's
// "right joining" class. A shaper that gives one of these an initial or
// medial glyph is wrong regardless of how correct everything else is.
export const NON_JOINING_LETTERS = ['ا', 'د', 'ذ', 'ر', 'ز', 'و'];

/** Every dual-joining letter forced into each of its four positional forms via a tatweel anchor. */
export const positionalFormsCases = DUAL_JOINING_LETTERS.flatMap((letter) => ([
  { id: `isolated:${letter}`, text: letter },
  { id: `initial:${letter}`, text: letter + TATWEEL },
  { id: `medial:${letter}`, text: TATWEEL + letter + TATWEEL },
  { id: `final:${letter}`, text: TATWEEL + letter },
]));

/** Every non-joining letter in the only two forms it can take. */
export const nonJoiningFormsCases = NON_JOINING_LETTERS.flatMap((letter) => ([
  { id: `isolated:${letter}`, text: letter },
  { id: `final:${letter}`, text: TATWEEL + letter },
]));

/** The four mandatory lam-alef ligatures - not optional, Arabic orthography requires the merge. */
export const lamAlefLigatureCases = [
  { id: 'lamAlef:plain', text: 'لا' },
  { id: 'lamAlef:hamzaAbove', text: 'لأ' },
  { id: 'lamAlef:hamzaBelow', text: 'لإ' },
  { id: 'lamAlef:madda', text: 'لآ' },
];

const HARAKAT = [
  { name: 'fatha', mark: 'َ' },
  { name: 'damma', mark: 'ُ' },
  { name: 'kasra', mark: 'ِ' },
  { name: 'sukun', mark: 'ْ' },
  { name: 'shadda', mark: 'ّ' },
  { name: 'tanwinFath', mark: 'ً' },
  { name: 'tanwinDamm', mark: 'ٌ' },
  { name: 'tanwinKasr', mark: 'ٍ' },
];

// One dual-joining letter (ب) and one non-joining letter (د) - marks attach
// via GPOS regardless of the base letter's joining class, but the two are
// worth checking separately since they exercise different glyph variants.
export const diacriticsCases = ['ب', 'د'].flatMap((base) => HARAKAT.map(({ name, mark }) => ({
  id: `diacritic:${base}+${name}`,
  text: base + mark,
}))).concat([
  { id: 'diacritic:shadda+fatha', text: 'بَّ' }, // the doubled-consonant+vowel stack from patterns like مُحَمَّد
]);

/** Curated real words/phrases, not part of the systematic axes above. */
export const realisticStringsCases = [
  { id: 'word:marhaban', text: 'مرحبا' }, // "hello"
  { id: 'word:shukran', text: 'شكرا' }, // "thank you"
  { id: 'phrase:assalamuAlaykum', text: 'السلام عليكم' }, // formal greeting
  { id: 'name:ahmad', text: 'أحمد' },
  { id: 'name:fatima', text: 'فاطمة' }, // exercises teh marbuta (ة) at word end
  { id: 'name:abdullah', text: 'عبد الله' },
  { id: 'word:shams', text: 'شمس' }, // "sun" - three dual/non-joining letters in sequence
  { id: 'phrase:jumhuriya', text: 'الجمهورية العربية' }, // "the Arab Republic" - long compound
  { id: 'word:muhammad', text: 'محمد' },
  { id: 'word:kitab', text: 'كتاب' }, // "book"
];

export const ARABIC_CORPUS = [
  ...positionalFormsCases,
  ...nonJoiningFormsCases,
  ...lamAlefLigatureCases,
  ...diacriticsCases,
  ...realisticStringsCases,
];
