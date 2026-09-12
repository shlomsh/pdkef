/**
 * Cyrillic correctness corpus for e2e/sign/cyrillic-shaping-guard.spec.js
 * (FONT-08b: Neucha, the catalogue's first Cyrillic handwriting face).
 *
 * **Why this corpus is shaped like latinNameCorpus.js, not like the Brahmic
 * corpora (Devanagari, Bengali, Malayalam, ...).** Every Brahmic guard in
 * this directory exists because its script has a shaping *mechanism* -
 * reordering, conjunct formation, mark composition - that a per-codepoint
 * cmap lookup cannot get right on its own. Cyrillic has none of that: it is
 * a simple left-to-right alphabet with no combining marks in ordinary use,
 * the same shape of "nothing to reorder" Latin and Greek already have. And
 * unlike the four Latin handwriting faces `latin-shaping-guard.spec.js`
 * exists for, Neucha ships with **no GSUB table at all** (screened via
 * fontkit: `!!font.GSUB === false`, `availableFeatures` is `['kern']` only,
 * verified against the real bytes at screening time, 2026-09-12) - so there
 * is no `calt`/`liga` mechanism through which fontkit and the browser could
 * ever pick a *different glyph* for the same input. The one thing Neucha
 * actually does beyond a plain cmap lookup is GPOS kerning, which repositions
 * glyphs but never substitutes one, so this corpus's job is proving the
 * *positioning* the browser and fontkit agree on for real Russian and
 * Ukrainian names and form words, not hunting for a letterform disagreement
 * that this font has no mechanism to produce.
 *
 * **`calibrationSet`, not `autoCalibrate`.** `autoCalibrate` partitions a
 * corpus into "fontkit substituted this string" (cases under test) and "it
 * didn't" (calibration) - see shapingGuardHarness.js's own module doc. With
 * no GSUB table, fontkit's `layout()` never substitutes anything here, so
 * every corpus string would land in the calibration bucket and the harness
 * would correctly refuse to run (`substitutingCount === 0`, "this guard has
 * nothing to test for this face"). A hand-picked `calibrationSet` sidesteps
 * that the same way the Devanagari/Arabic guards did before autoCalibrate
 * existed: the corpus below is what's actually judged against tolerance, and
 * `calibrationSet` supplies a maximum-noise sample of the same *kind* of ink
 * (bare letters, for a raster floor, and adjacent-letter pairs, for the
 * antialiasing a font's own GPOS kerning adds to a two-glyph render) to
 * derive that tolerance from - see the module doc there for why a single
 * glyph is the wrong calibration unit.
 *
 * **Coverage note the corpus leans on:** screened at landing, Neucha draws
 * every letter of the Russian, Ukrainian, Belarusian, Bulgarian, Serbian and
 * Macedonian alphabets (all six anchor languages but Kazakh - see
 * scripts/font-manifest.mjs and src/lib/fontCoverageReport.js's
 * cyrillicKazakh row), including the letters that most narrowly distinguish
 * one from another: Ukrainian's ґ/і/ї/є and Russian/Belarusian's ё. Kazakh's
 * eight extra letters (ә, ғ, қ, ң, ө, ұ, ү, һ) are NOT covered and are
 * deliberately absent from this corpus - a missing glyph is a coverage
 * question (`fontCoverage.test.js`), not a shaping one, and this guard only
 * exists to test letters the font actually draws.
 */

export const nameCases = [
  { id: 'name-alexandra', text: 'Александра Смирнова' },
  { id: 'name-vladimir', text: 'Владимир Петров' },
  { id: 'name-natalia', text: 'Наталья Кузнецова' },
  { id: 'name-dmitri', text: 'Дмитрий Соколов' },
  { id: 'name-olga', text: 'Ольга Ёлкина' }, // Ё/ё, initial and medial
  { id: 'name-yosyp', text: "В'ячеслав Гудзик" }, // Ukrainian apostrophe + Ґ/ґ via a surname built on the letter
  { id: 'name-ukrainian-taras', text: 'Тарас Шевченко' },
  { id: 'name-ukrainian-yevheniya', text: 'Євгенія Їжакова' }, // Є/є and Ї/ї together
  { id: 'name-ukrainian-ihor', text: 'Ігор Гриценко' }, // І/і
  { id: 'name-belarusian', text: 'Уладзімір Караткевіч' }, // Ў already screened as part of Belarusian's own full row
];

export const formFieldCases = [
  { id: 'field-date', text: '12.09.2026' },
  { id: 'field-mixed-digits', text: 'дом 17, кв. 4' }, // mixed Cyrillic + digits
  { id: 'field-passport', text: 'серия 45 07 № 123456' }, // mixed Cyrillic + digits + punctuation
  { id: 'field-city', text: 'Київ, Україна' },
  { id: 'field-phone', text: '+7 (495) 123-45-67' },
  { id: 'field-signed', text: 'Підписано: О. Ковальчук' },
  { id: 'field-object', text: "об'єкт №5" }, // plain apostrophe (U+02BC is not in Neucha's cmap - see fontCoverage.test.js)
  { id: 'field-na', text: 'Немає' },
];

export const CYRILLIC_CORPUS = [...nameCases, ...formFieldCases];

// Every base letter of the six anchor alphabets Neucha fully covers
// (Russian + Ukrainian's ҐЄІЇ + Belarusian's Ў; Bulgarian/Serbian/Macedonian
// contribute no letters outside that combined set), each in isolation - the
// "raster floor" half of the calibration, same role Devanagari's bare
// consonants play.
const BASE_ALPHABET = [
  ...'АБВГҐДЕЁЄЖЗИІЇЙКЛМНОПРСТУЎФХЦЧШЩЪЫЬЭЮЯ',
  ...'абвгґдеёєжзиіїйклмнопрстуўфхцчшщъыьэюя',
];

// A handful of adjacent-letter pairs likely to carry a real kerning
// adjustment (Neucha's one non-cmap feature, per its `availableFeatures`) -
// two glyphs, the second usually narrower than the first, the same
// "small second glyph" shape of ink Devanagari's calibration set uses for
// exactly the same reason: single bare glyphs can't expose a positioning
// artifact that only appears once there's a second glyph to place.
const KERNING_PAIRS = ['АВ', 'ТО', 'ГА', 'ЛА', 'РА', 'та', 'ве', 'до', 'ло', 'ра'];

export const CALIBRATION_SET = [...BASE_ALPHABET, ...KERNING_PAIRS];
