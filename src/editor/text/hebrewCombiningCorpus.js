/**
 * Enumerated Hebrew base+mark cluster corpus for the H8 mark-placement guard
 * (src/editor/registry/hebrewMarkPlacement.test.js), the guard that targets
 * the H7 composition defect Guard A/B are structurally blind to (Hebrew
 * combining marks have `xAdvance` 0 in every catalogued font - see
 * docs/hebrew-text-shaping-export.md, "Layer 1" and "A guard that can see a
 * misplaced mark").
 *
 * Derived from `hebrewComposition.js`'s own presentation-form table rather
 * than hand-typed, the same reason that table is derived from the platform's
 * decomposition data instead of transcribed: an enumerated corpus is only as
 * trustworthy as its generation, and generating it from the same ground
 * truth the fix itself uses means a missing or wrong table entry shows up as
 * a missing or wrong corpus case, not a silent gap in coverage.
 *
 * Each composable cluster gets three canonically-equivalent raw string
 * variants - not because the fix needs to special-case them (NFC's own
 * reordering collapses all three to one string before the fix ever runs),
 * but because a regression that reorders the normalize/compose steps, or
 * drops the NFC call, would only show up as disagreement BETWEEN variants,
 * never as a wrong answer on any single one of them:
 *
 *  - `typed`   - base + SHEVA + mark, the shape a person actually typing
 *    Hebrew produces (SHEVA's ccc 10 sorts before every composable mark's
 *    ccc 14-25, so this is already canonical order).
 *  - `reordered` - base + mark + SHEVA, a non-canonical raw order NFC's own
 *    reordering pass must fix before composition can see it.
 *  - `precomposed` - the presentation-form character itself, plus SHEVA -
 *    tests the decompose-then-recompose round trip for text pasted in
 *    already composed (NFC decomposes it straight back down, per the
 *    Composition Exclusion Table - see hebrewComposition.js's module doc).
 *
 * SHEVA is deliberately not itself a target of any composition (no
 * presentation form combines it with anything) and its ccc (10) sits below
 * every composable mark's, so it plays the same role in every cluster: an
 * intervening, never-composed mark the blocking algorithm has to see past -
 * exactly the shape of the `בְּ` defect that started this epic.
 */
import { __internal } from './hebrewComposition.js';

const SHEVA = 'ְ';

function codePointName(cp) {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** Every base+mark(s) -> composed-character entry, as {base, marks, composed}. */
export const COMPOSABLE_ENTRIES = Array.from(__internal.HEBREW_PRESENTATION_FORMS, ([decomposed, composed]) => ({
  base: decomposed[0],
  marks: decomposed.slice(1),
  composed,
}));

/**
 * Three canonically-equivalent variants per composable entry, grouped so the
 * guard can assert they all shape identically. Entries whose own decomposed
 * form already has more than one mark (FB2C/FB2D, shin+dagesh+shin-or-sin-dot)
 * get SHEVA appended after their own marks instead of inserted between them -
 * inserting it there would just be a second copy of the two-mark case NFC's
 * reordering already has to get right on every other entry, not a new axis.
 */
export const ORDER_VARIANT_GROUPS = COMPOSABLE_ENTRIES.map(({ base, marks, composed }) => {
  const id = `${codePointName(base.codePointAt(0))}+${[...marks].map((m) => codePointName(m.codePointAt(0))).join('+')}`;
  return {
    id,
    base,
    marks,
    composed,
    variants: {
      typed: base + SHEVA + marks,
      reordered: base + marks + SHEVA,
      precomposed: composed + SHEVA,
    },
  };
});

/**
 * SHEVA (U+05B0) is the calibration mark: it is the one intervening mark
 * every corpus case above actually leaves behind after composing, so it is
 * the only mark whose baseline is worth measuring here.
 *
 * The reference has to be taken PER BASE LETTER, not once globally: measured,
 * Tinos positions sheva at only ~32% overlap on bet/kaf/resh but ordinary
 * per-base width differences (vav is narrow, kaf is wide) mean even a single
 * font's own "sheva on a plain, uncomposed base" containment isn't one
 * number - it is a property of the base letter, and the corpus's composable
 * entries span most of the alphabet (see `COMPOSABLE_ENTRIES`). Comparing a
 * composed entry's containment against SHEVA-on-that-SAME-base-letter,
 * uncomposed, isolates exactly the question this guard exists to ask - did
 * composing change how the already-attached mark sits - without conflating
 * it with cross-letter geometry variance a global floor would average away
 * in one direction or the other.
 *
 * This is the same "measure the floor, don't guess it" discipline
 * shapingGuardHarness.js's module doc describes for pixel-diff noise floors,
 * applied to containment instead: some catalogued fonts position marks via
 * glyph design rather than a GPOS anchor (the "survives by glyph design, not
 * by anchor" property docs/hebrew-text-shaping-export.md measures for
 * Cousine's dagesh), so a flat threshold across all seven fonts, or even
 * across one font's own alphabet, would either be loose enough to miss a
 * real regression on the well-anchored letters or tight enough to flag a
 * letter's ordinary, pre-existing rendering as a false failure.
 */
export const CALIBRATION_MARK = 'ְ'; // SHEVA, U+05B0

/** Every distinct base letter a composable entry uses, for building a per-base calibration reference. */
export const COMPOSABLE_BASES = [...new Set(COMPOSABLE_ENTRIES.map((entry) => entry.base))];
