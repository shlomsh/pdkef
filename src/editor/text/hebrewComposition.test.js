/**
 * Pure-logic tests for the H7 composition pre-pass (docs/hebrew-text-shaping-
 * export.md, "Layer 1"): the table is built correctly and the blocking
 * algorithm behaves correctly, both checked against synthetic `hasGlyph`
 * stubs so these run with no font files and no fontkit instance. The guard
 * that proves this actually fixes real fonts is
 * src/editor/registry/hebrewMarkPlacement.test.js (H8).
 */
import { describe, expect, it } from 'vitest';
import { composeHebrewClusters, __internal } from './hebrewComposition.js';

const BET = 'ב';
const SHEVA = 'ְ'; // U+05B0, ccc 10 - never itself composed, always the "intervening mark"
const DAGESH = 'ּ'; // U+05BC, ccc 21
const FB31 = String.fromCodePoint(0xfb31); // HEBREW LETTER BET WITH DAGESH
const alwaysHasGlyph = () => true;
const neverHasGlyph = () => false;

describe('HEBREW_PRESENTATION_FORMS table', () => {
  it('contains exactly the Unicode-verified 34 canonical (non-<font>, non-ligature) entries in U+FB1D-FB4E', () => {
    // Locks the table size so a future edit to the generation range can't
    // silently drop or add entries without a test noticing. 34 was computed
    // independently by checking NFD===NFKD for every codepoint in the block.
    expect(__internal.HEBREW_PRESENTATION_FORMS.size).toBe(34);
  });

  it('maps bet+dagesh to U+FB31, the exact pair measured at 0% containment in Arimo', () => {
    expect(__internal.HEBREW_PRESENTATION_FORMS.get(BET + DAGESH)).toBe(FB31);
  });

  it('excludes every <font> alternate-glyph variant (FB20-FB29), which decompose only under NFKD', () => {
    for (let cp = 0xfb20; cp <= 0xfb29; cp++) {
      expect(__internal.HEBREW_PRESENTATION_FORMS.has(String.fromCodePoint(cp))).toBe(false);
    }
  });

  it('excludes the FB4F aleph-lamed ligature, a compatibility mapping, not a base+mark composition', () => {
    for (const [, composed] of __internal.HEBREW_PRESENTATION_FORMS) {
      expect(composed).not.toBe('ﭏ');
    }
  });

  it('includes both two-mark shin entries (FB2C, FB2D), keyed by the full three-character decomposition', () => {
    const SHIN = 'ש';
    const SHIN_DOT = 'ׁ';
    const SIN_DOT = 'ׂ';
    expect(__internal.HEBREW_PRESENTATION_FORMS.get(SHIN + DAGESH + SHIN_DOT)).toBe('שּׁ');
    expect(__internal.HEBREW_PRESENTATION_FORMS.get(SHIN + DAGESH + SIN_DOT)).toBe('שּׂ');
  });
});

describe('composeHebrewClusters: the blocking algorithm', () => {
  it('composes an adjacent base+mark pair with no intervening mark', () => {
    expect(composeHebrewClusters(BET + DAGESH, alwaysHasGlyph)).toBe(FB31);
  });

  it('sees past an intervening, non-composable mark to reach the composable one - the exact בְּ shape', () => {
    // sheva (ccc 10) sits between the base and dagesh (ccc 21) in canonical
    // order; a naive adjacent-pair scan would never reach the dagesh.
    expect(composeHebrewClusters(BET + SHEVA + DAGESH, alwaysHasGlyph)).toBe(FB31 + SHEVA);
  });

  it('is order-insensitive: typed, non-canonically reordered, and precomposed-plus-remainder all agree', () => {
    const typed = BET + SHEVA + DAGESH;
    const reordered = BET + DAGESH + SHEVA;
    const precomposed = FB31 + SHEVA;
    const outputs = [typed, reordered, precomposed].map((t) => composeHebrewClusters(t, alwaysHasGlyph));
    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toBe(FB31 + SHEVA);
  });

  it('leaves text unchanged when hasGlyph refuses the composed character - the font-doesn\'t-have-it gate', () => {
    expect(composeHebrewClusters(BET + SHEVA + DAGESH, neverHasGlyph)).toBe(BET + SHEVA + DAGESH);
  });

  it('composes the two-mark shin case only when the font has the intermediate AND final glyph', () => {
    const SHIN = 'ש';
    const SHIN_DOT = 'ׁ';
    const hasFB49Only = (cp) => cp === 0xfb49; // has shin+dagesh, not the further shin+dagesh+dot
    expect(composeHebrewClusters(SHIN + DAGESH + SHIN_DOT, hasFB49Only)).toBe('שּ' + SHIN_DOT);
  });

  it('composes fully to FB2C when the font has every intermediate glyph', () => {
    const SHIN = 'ש';
    const SHIN_DOT = 'ׁ';
    expect(composeHebrewClusters(SHIN + DAGESH + SHIN_DOT, alwaysHasGlyph)).toBe('שּׁ');
  });

  it('a mark whose combining class is not lower than a still-pending mark is blocked from composing out of order', () => {
    // Two composable-in-principle marks arriving in an order where the
    // second has a LOWER ccc than the first would, if composed, is exactly
    // the case the "blocked" check exists for. Shin+dagesh(21)+shindot(24) in
    // REVERSE raw order (shindot typed before dagesh) still normalizes via
    // NFC to canonical order first, so this exercises normalize, not a gap
    // in the algorithm itself.
    const SHIN = 'ש';
    const SHIN_DOT = 'ׁ';
    const rawReversed = SHIN + SHIN_DOT + DAGESH;
    expect(composeHebrewClusters(rawReversed, alwaysHasGlyph)).toBe('שּׁ');
  });

  it('does not touch non-Hebrew text', () => {
    expect(composeHebrewClusters('Tel Aviv, 1250', alwaysHasGlyph)).toBe('Tel Aviv, 1250');
  });

  it('does not touch Hebrew letters with no following mark', () => {
    expect(composeHebrewClusters('שלום', alwaysHasGlyph)).toBe('שלום');
  });

  it('composes only the Hebrew portion of a mixed line, leaving the rest untouched', () => {
    const mixed = `Tel Aviv ${BET}${SHEVA}${DAGESH} 17`;
    expect(composeHebrewClusters(mixed, alwaysHasGlyph)).toBe(`Tel Aviv ${FB31}${SHEVA} 17`);
  });

  it('a mark with no base before it is left alone rather than throwing', () => {
    expect(composeHebrewClusters(DAGESH + BET, alwaysHasGlyph)).toBe(DAGESH + BET);
  });
});
