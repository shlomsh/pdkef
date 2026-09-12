/**
 * Cyrillic correctness corpus for e2e/sign/cyrillic-shaping-guard.spec.js.
 *
 * Built for FONT-08 (Amatic SC, Cyrillic's first handwriting face -
 * docs/font-candidate-research-brief.md's "no handwriting option at all"
 * row). Unlike the four Latin `calt` faces in latinNameCorpus.js, Amatic SC
 * shows zero contextual substitution anywhere in this corpus: measured with
 * the same method latin-shaping-guard.spec.js's module doc describes
 * (fontkit's `layout()` glyph ids vs. a plain per-codepoint `cmap` lookup),
 * every one of the 24 strings below shapes identically both ways - `liga`
 * fires on Latin-only ligatures (fi, ffi) the font also carries but none of
 * them occur in Cyrillic text, and `calt` is absent from the font entirely
 * (confirmed against the real bytes: `availableFeatures` lists `aalt, case,
 * ccmp, dlig, frac, liga, ordn, sups, zero, kern, mark, mkmk` - no `calt`).
 * So `autoCalibrate` (which partitions a corpus into "substituting" cases
 * under test and "non-substituting" calibration ink) would find nothing to
 * test - `shapingGuardHarness.js` fails loudly rather than passing vacuously
 * when that happens. This corpus is split by hand instead, the same way
 * devanagariCorpus.js and arabicCorpus.js split theirs: `CALIBRATION_SET`
 * is short, realistic, zero-ambiguity ink (real Cyrillic words, not bare
 * letters - a single glyph understates noise on a hand-drawn face, the
 * lesson latin-shaping-guard.spec.js's module doc already recorded once for
 * Caveat/Pacifico); `CYRILLIC_CORPUS` is longer realistic strings - names,
 * a place name, a form field with digits and punctuation - checked against
 * the floor the calibration set measures. `kern` is a real OpenType feature
 * in this font (confirmed against the bytes), so this guard is actually
 * exercising kerned-advance-vs-browser agreement on Cyrillic ink, not a
 * glyph-selection question this font doesn't have.
 *
 * Every entry uses real Cyrillic given names, surnames, and place names
 * (Russian and Ukrainian), and includes the letters TODO.md's Cyrillic
 * anchor work already treats as the ones some fonts quietly drop: ё
 * (Russian), ґ, ї, є, і (Ukrainian) - see scripts/font-languages.mjs's
 * `cyrillicUkrainian` row for why those four specifically.
 */

export const CALIBRATION_SET = [
  'ёлка', // yolka (fir tree) - Russian ё
  'їжак', // izhak (hedgehog) - Ukrainian ї
  'підпис', // pidpys (signature) - Ukrainian і
  'Київ', // Kyiv - Ukrainian і
  'Ґанджа', // a Ukrainian ge-with-upturn given name spelling - ukrainian ґ
  'Оксана', // Russian/Ukrainian given name, no diacritic letters
  'відповідь', // vidpovid (answer/reply) - Ukrainian і
  'єдність', // yednist (unity) - Ukrainian є
];

export const nameCases = [
  { id: 'name-vladimir-putin', text: 'Владимир Путин' },
  { id: 'name-anna-karenina', text: 'Анна Каренина' },
  { id: 'name-taras-shevchenko', text: 'Тарас Шевченко' },
  { id: 'name-olena-kovalchuk', text: 'Олена Ковальчук' },
  { id: 'name-dmytro-ivanovych', text: 'Дмитро Іванович' },
  { id: 'name-natalia-ivanenko', text: 'Наталія Іваненко' },
  { id: 'name-bohdan-melnyk', text: 'Богдан Мельник' },
  { id: 'name-yelyzaveta', text: 'Єлизавета' },
];

export const formFieldCases = [
  { id: 'field-street-address', text: 'вулиця Хрещатик 1' },
  { id: 'field-apartment', text: 'квартира 5Б' },
  { id: 'field-date', text: 'дата 27.08.2026' },
  { id: 'field-phone', text: 'телефон +380 44 123 4567' },
  { id: 'field-place-belarus', text: 'Білорусь' },
  { id: 'field-place-kishinev', text: 'Кишинёв' },
  { id: 'field-name-surname', text: "ім'я та прізвище" },
  { id: 'field-city', text: 'місто Київ' },
];

export const CYRILLIC_CORPUS = [...nameCases, ...formFieldCases];
