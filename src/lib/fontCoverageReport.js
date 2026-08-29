/**
 * GENERATED FILE - do not hand-edit.
 *
 * Produced by scripts/generate-font-coverage-report.mjs from
 * src/lib/fontCoverageTable.js (itself generated from the real font bytes in
 * public/fonts/) and the character-set definitions in
 * scripts/font-languages.mjs. Rerun that script
 * (npm run generate:font-coverage-report) and commit the result whenever a
 * font file or a language definition changes.
 * src/lib/fontCoverageReport.test.js regenerates this in memory and fails if
 * it disagrees with what is committed here.
 *
 * "full" means the family's -Regular.ttf has a glyph for every codepoint the
 * language's real alphabet needs (scripts/font-languages.mjs). "partial"
 * means some but not all, reported as a fraction - never rounded up to full.
 *
 * "Full" is full against a stated alphabet, and two exclusions are worth
 * knowing before quoting a row: Hebrew omits meteg (U+05BD) and rafe
 * (U+05BF), and Devanagari omits the Dravidian-loan letters U+0929/U+0934.
 * Both are reasoned in scripts/font-languages.mjs. Meteg in particular is
 * genuinely absent from Heebo, Assistant, Gveret Levin and Alef, so a
 * "Hebrew: full" row for those four means ordinary vowelized Hebrew, not
 * every mark the block defines - and someone who does type one still gets
 * named the character at typing time (src/lib/textCoverage.js), which is
 * where that honesty is enforced rather than here.
 * A family absent from both lists has zero of that language's codepoints.
 *
 * Not imported by any browser bundle - see the header of
 * generate-font-coverage-report.mjs for why the Sign page's Languages card
 * is instead cross-checked against this at test time
 * (src/lib/languageCoverage.test.js), not fed from it at runtime.
 */

/** @typedef {{ family: string, style: 'handwriting' | 'upright' }} CoveringFamily */
/** @typedef {CoveringFamily & { fraction: number }} PartialCoveringFamily */

/**
 * @type {Record<string, {
 *   label: string,
 *   requiredCodePointCount: number,
 *   full: CoveringFamily[],
 *   partial: PartialCoveringFamily[],
 * }>}
 */
export const LANGUAGE_COVERAGE = {
  "latin": {
    label: "Latin",
    requiredCodePointCount: 52,
    full: [{ family: "Caveat", style: "handwriting" }, { family: "Dancing Script", style: "handwriting" }, { family: "Great Vibes", style: "handwriting" }, { family: "Gveret Levin", style: "handwriting" }, { family: "Kalam", style: "handwriting" }, { family: "Mali", style: "handwriting" }, { family: "Pacifico", style: "handwriting" }, { family: "Sacramento", style: "handwriting" }, { family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "Assistant", style: "upright" }, { family: "Heebo", style: "upright" }, { family: "Alef", style: "upright" }, { family: "PT Sans", style: "upright" }, { family: "Scheherazade New", style: "upright" }, { family: "Noto Sans JP", style: "upright" }, { family: "Noto Sans SC", style: "upright" }, { family: "Noto Sans TC", style: "upright" }, { family: "Noto Sans KR", style: "upright" }, { family: "Noto Sans Bengali", style: "upright" }, { family: "Mukta Mahee", style: "upright" }, { family: "Anek Telugu", style: "upright" }, { family: "Noto Sans Tamil", style: "upright" }, { family: "Mukta", style: "upright" }],
    partial: [],
  },
  "latinExt": {
    label: "Latin Extended (accented, representative sample)",
    requiredCodePointCount: 80,
    full: [{ family: "Kalam", style: "handwriting" }, { family: "Mali", style: "handwriting" }, { family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "Heebo", style: "upright" }, { family: "Alef", style: "upright" }, { family: "PT Sans", style: "upright" }, { family: "Noto Sans Bengali", style: "upright" }, { family: "Mukta Mahee", style: "upright" }, { family: "Noto Sans Tamil", style: "upright" }, { family: "Mukta", style: "upright" }],
    partial: [{ family: "Caveat", style: "handwriting", fraction: 0.738 }, { family: "Dancing Script", style: "handwriting", fraction: 0.738 }, { family: "Great Vibes", style: "handwriting", fraction: 0.738 }, { family: "Pacifico", style: "handwriting", fraction: 0.738 }, { family: "Sacramento", style: "handwriting", fraction: 0.738 }, { family: "Assistant", style: "upright", fraction: 0.875 }, { family: "Scheherazade New", style: "upright", fraction: 0.8 }, { family: "Anek Telugu", style: "upright", fraction: 0.738 }],
  },
  "hebrew": {
    label: "Hebrew",
    requiredCodePointCount: 43,
    full: [{ family: "Gveret Levin", style: "handwriting" }, { family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "Assistant", style: "upright" }, { family: "Heebo", style: "upright" }, { family: "Alef", style: "upright" }],
    partial: [],
  },
  "arabic": {
    label: "Arabic",
    requiredCodePointCount: 45,
    full: [{ family: "Scheherazade New", style: "upright" }],
    partial: [],
  },
  "farsi": {
    label: "Farsi / Dari (Perso-Arabic)",
    requiredCodePointCount: 50,
    full: [{ family: "Scheherazade New", style: "upright" }],
    partial: [],
  },
  "urdu": {
    label: "Urdu",
    requiredCodePointCount: 57,
    full: [{ family: "Scheherazade New", style: "upright" }],
    partial: [],
  },
  "pashto": {
    label: "Pashto",
    requiredCodePointCount: 61,
    full: [{ family: "Scheherazade New", style: "upright" }],
    partial: [],
  },
  "cyrillicRussian": {
    label: "Russian",
    requiredCodePointCount: 66,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "cyrillicUkrainian": {
    label: "Ukrainian",
    requiredCodePointCount: 66,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "cyrillicBelarusian": {
    label: "Belarusian",
    requiredCodePointCount: 64,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "cyrillicBulgarian": {
    label: "Bulgarian",
    requiredCodePointCount: 60,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "cyrillicSerbian": {
    label: "Serbian (Cyrillic)",
    requiredCodePointCount: 60,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "cyrillicMacedonian": {
    label: "Macedonian",
    requiredCodePointCount: 62,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "cyrillicKazakh": {
    label: "Kazakh (Cyrillic)",
    requiredCodePointCount: 82,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
    partial: [],
  },
  "greek": {
    label: "Greek",
    requiredCodePointCount: 66,
    full: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }],
    partial: [{ family: "Kalam", style: "handwriting", fraction: 0.015 }, { family: "Mali", style: "handwriting", fraction: 0.061 }, { family: "Assistant", style: "upright", fraction: 0.045 }, { family: "Heebo", style: "upright", fraction: 0.015 }, { family: "PT Sans", style: "upright", fraction: 0.061 }, { family: "Scheherazade New", style: "upright", fraction: 0.015 }, { family: "Mukta Mahee", style: "upright", fraction: 0.015 }, { family: "Mukta", style: "upright", fraction: 0.015 }],
  },
  "devanagari": {
    label: "Devanagari (Hindi)",
    requiredCodePointCount: 71,
    full: [{ family: "Kalam", style: "handwriting" }, { family: "Mukta", style: "upright" }],
    partial: [],
  },
  "marathi": {
    label: "Marathi (Devanagari + ळ, ऱ)",
    requiredCodePointCount: 71,
    full: [{ family: "Kalam", style: "handwriting" }, { family: "Mukta", style: "upright" }],
    partial: [],
  },
  "thai": {
    label: "Thai",
    requiredCodePointCount: 83,
    full: [{ family: "Mali", style: "handwriting" }],
    partial: [],
  },
  "japanese": {
    label: "Japanese (kana + common punctuation only - see comment above, kanji not modeled here)",
    requiredCodePointCount: 184,
    full: [{ family: "Noto Sans JP", style: "upright" }],
    partial: [{ family: "Noto Sans SC", style: "upright", fraction: 0.033 }, { family: "Noto Sans TC", style: "upright", fraction: 0.033 }, { family: "Noto Sans KR", style: "upright", fraction: 0.033 }],
  },
  "bengali": {
    label: "Bengali (Bangla)",
    requiredCodePointCount: 69,
    full: [{ family: "Noto Sans Bengali", style: "upright" }],
    partial: [],
  },
  "assamese": {
    label: "Assamese (shares the Bengali script and this table's Bengali set, plus RA ৰ and VA ৱ)",
    requiredCodePointCount: 71,
    full: [{ family: "Noto Sans Bengali", style: "upright" }],
    partial: [],
  },
  "vietnamese": {
    label: "Vietnamese",
    requiredCodePointCount: 130,
    full: [{ family: "Mali", style: "handwriting" }, { family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }],
    partial: [{ family: "Caveat", style: "handwriting", fraction: 0.254 }, { family: "Dancing Script", style: "handwriting", fraction: 0.246 }, { family: "Great Vibes", style: "handwriting", fraction: 0.254 }, { family: "Kalam", style: "handwriting", fraction: 0.277 }, { family: "Pacifico", style: "handwriting", fraction: 0.246 }, { family: "Sacramento", style: "handwriting", fraction: 0.246 }, { family: "Assistant", style: "upright", fraction: 0.308 }, { family: "Heebo", style: "upright", fraction: 0.292 }, { family: "Alef", style: "upright", fraction: 0.292 }, { family: "PT Sans", style: "upright", fraction: 0.277 }, { family: "Scheherazade New", style: "upright", fraction: 0.246 }, { family: "Noto Sans Bengali", style: "upright", fraction: 0.292 }, { family: "Mukta Mahee", style: "upright", fraction: 0.292 }, { family: "Anek Telugu", style: "upright", fraction: 0.246 }, { family: "Noto Sans Tamil", style: "upright", fraction: 0.292 }, { family: "Mukta", style: "upright", fraction: 0.292 }],
  },
  "korean": {
    label: "Korean (Hangul)",
    requiredCodePointCount: 11266,
    full: [{ family: "Noto Sans KR", style: "upright" }],
    partial: [],
  },
  "punjabi": {
    label: "Punjabi (Gurmukhi)",
    requiredCodePointCount: 71,
    full: [{ family: "Mukta Mahee", style: "upright" }],
    partial: [],
  },
  "telugu": {
    label: "Telugu",
    requiredCodePointCount: 77,
    full: [{ family: "Anek Telugu", style: "upright" }],
    partial: [],
  },
  "tamil": {
    label: "Tamil",
    requiredCodePointCount: 59,
    full: [{ family: "Noto Sans Tamil", style: "upright" }],
    partial: [],
  },
};

/**
 * The seven named script combinations from
 * docs/wysiwyg-text-architecture.md §4.1 / §8 stage 7 and TODO.md's W7
 * entry. A family appears here only if it fully covers BOTH languages' real
 * character sets, not a loose union.
 *
 * @type {Array<{ a: string, b: string, aLabel: string, bLabel: string, families: CoveringFamily[] }>}
 */
export const COMBINATION_COVERAGE = [
  { a: "hebrew", b: "latin", aLabel: "Hebrew", bLabel: "Latin", families: [{ family: "Gveret Levin", style: "handwriting" }, { family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "Assistant", style: "upright" }, { family: "Heebo", style: "upright" }, { family: "Alef", style: "upright" }] },
  { a: "arabic", b: "latin", aLabel: "Arabic", bLabel: "Latin", families: [{ family: "Scheherazade New", style: "upright" }] },
  { a: "cyrillicRussian", b: "latin", aLabel: "Russian", bLabel: "Latin", families: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }] },
  { a: "greek", b: "latin", aLabel: "Greek", bLabel: "Latin", families: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }] },
  { a: "hebrew", b: "cyrillicRussian", aLabel: "Hebrew", bLabel: "Russian", families: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }] },
  { a: "hebrew", b: "greek", aLabel: "Hebrew", bLabel: "Greek", families: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }] },
  { a: "hebrew", b: "arabic", aLabel: "Hebrew", bLabel: "Arabic", families: [] },
];

/**
 * The concrete anchor from TODO.md's W7 entry: which families fully cover
 * all seven of Russian, Ukrainian, Belarusian, Bulgarian, Serbian,
 * Macedonian and Kazakh at once (whole alphabet, including capitals).
 *
 * @type {{ languages: string[], familiesCoveringAllSeven: CoveringFamily[] }}
 */
export const CYRILLIC_ANCHOR = {
  languages: ["cyrillicRussian","cyrillicUkrainian","cyrillicBelarusian","cyrillicBulgarian","cyrillicSerbian","cyrillicMacedonian","cyrillicKazakh"],
  familiesCoveringAllSeven: [{ family: "Arimo", style: "upright" }, { family: "Tinos", style: "upright" }, { family: "Cousine", style: "upright" }, { family: "PT Sans", style: "upright" }],
};
