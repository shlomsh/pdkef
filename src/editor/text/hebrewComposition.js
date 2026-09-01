/**
 * Layer 1 of the Hebrew export pipeline (docs/hebrew-text-shaping-export.md,
 * "Layer 1: marks that need composition don't get it"): the browser composes
 * a base letter and its point into the precomposed glyph the font actually
 * has an anchor for; fontkit runs no composition step, so a mark that can't
 * reach its base via a plain adjacent-pair `ccmp` ligature (because another
 * mark sits between them) keeps its raw (0,0) offset and paints at the
 * cluster origin instead of on the letter. Measured: the dagesh of `בְּ`
 * (bet + sheva + dagesh) lands with 0% of its ink inside the letter in
 * Arimo, 33% in Tinos.
 *
 * The fix is NFC (to canonically reorder marks and undo any precomposed
 * input) plus recomposing the ~30 Hebrew presentation forms NFC's own
 * Composition Exclusion Table deliberately leaves decomposed, gated on the
 * font actually having a glyph for the composed character - the same gate
 * HarfBuzz's own Hebrew composer uses (`font->get_nominal_glyph`).
 */

/**
 * Canonical combining class (Unicode Character Database) for every codepoint
 * in the Hebrew accents/points block (U+0591-05C7). Fixed, permanent
 * per-codepoint Unicode data - used only to replicate the "blocked" check
 * from the canonical composition algorithm (UAX #15 D117) below: a mark
 * needing composition is not always adjacent to its base (sheva, ccc 10,
 * sits between bet and dagesh, ccc 21, in `בְּ`'s canonical order), so
 * "adjacent pair" is the wrong test - "no intervening mark with an equal or
 * higher combining class" is the real one.
 */
const HEBREW_CCC = {
  0x0591: 220, 0x0592: 230, 0x0593: 230, 0x0594: 222, 0x0595: 220, 0x0596: 220,
  0x0597: 230, 0x0598: 230, 0x0599: 222, 0x059a: 220, 0x059b: 220, 0x059c: 230,
  0x059d: 230, 0x059e: 230, 0x059f: 230, 0x05a0: 230, 0x05a1: 230, 0x05a2: 220,
  0x05a3: 220, 0x05a4: 220, 0x05a5: 220, 0x05a6: 220, 0x05a7: 220, 0x05a8: 230,
  0x05a9: 230, 0x05aa: 220, 0x05ab: 230, 0x05ac: 230, 0x05ad: 222, 0x05ae: 228,
  0x05af: 228,
  0x05b0: 10, 0x05b1: 11, 0x05b2: 12, 0x05b3: 13, 0x05b4: 14, 0x05b5: 15,
  0x05b6: 16, 0x05b7: 17, 0x05b8: 18, 0x05b9: 19, 0x05ba: 19, 0x05bb: 20,
  0x05bc: 21, 0x05bd: 22, 0x05bf: 23, 0x05c1: 24, 0x05c2: 25, 0x05c4: 230,
  0x05c5: 220, 0x05c7: 18,
};

function combiningClass(codePoint) {
  return HEBREW_CCC[codePoint] ?? 0;
}

/**
 * Hebrew presentation forms (U+FB1D-FB4E) that NFC's own composition step
 * deliberately excludes (Unicode's Composition Exclusion Table), keyed by
 * the decomposed character sequence NFC would otherwise have produced them
 * from - e.g. `"בּ"` (bet + dagesh) -> `"בּ"`.
 *
 * Built from the platform's own canonical decomposition data rather than
 * hand-transcribed: a codepoint in the block is included only when its NFD
 * equals its NFKD, which is exactly "this is a true canonical decomposition,
 * not a compatibility-only mapping" - the `<font>` alternate-glyph variants
 * at FB20-FB29 decompose only under NFKD, and so does the FB4F
 * aleph-lamed ligature. Deriving the table this way, instead of typing out
 * ~30 rows to be re-checked by eye, is what makes it verifiably correct.
 */
const HEBREW_PRESENTATION_FORMS = (() => {
  const map = new Map();
  for (let cp = 0xfb1d; cp <= 0xfb4e; cp++) {
    const ch = String.fromCodePoint(cp);
    const nfd = ch.normalize('NFD');
    const nfkd = ch.normalize('NFKD');
    if (nfd === ch || nfd !== nfkd) continue;
    map.set(nfd, ch);
  }
  return map;
})();

// Hebrew letters (U+05D0-05EA) plus the Yiddish digraph ligatures
// (U+05F0-05F4, e.g. the double-yod FB1F decomposes to) that can start a
// combining sequence a presentation form exists for.
const HEBREW_BASE = /[א-תװ-״]/;
const HEBREW_MARK = /[֑-ׇ]/;

/**
 * Recomposes Hebrew base+mark sequences NFC leaves decomposed (see
 * `HEBREW_PRESENTATION_FORMS` above), so fontkit's shaper gets the same
 * precomposed glyph the browser's own HarfBuzz reaches. NFC-normalizes
 * internally first - that canonical-reordering pass is what makes this
 * order-insensitive: a base+mark sequence typed in any order, or pasted back
 * in already precomposed, normalizes to the same decomposed,
 * canonically-ordered string before the loop below ever runs (verified: all
 * three of the browser's pixel-identical input orders collapse to one NFC
 * form). See docs/hebrew-text-shaping-export.md, "Layer 1".
 *
 * For each Hebrew base character, greedily extends a composed form one mark
 * at a time in canonical order, replicating the "blocked" rule from the
 * Unicode canonical composition algorithm (UAX #15 D117): a mark can combine
 * with the base only if no earlier, not-yet-combined mark has a combining
 * class >= its own. A mark that can't combine (sheva in `בְּ`) is left in
 * place immediately after the (possibly now-composed) base - exactly where
 * a shaper looks for the base a following mark should attach to.
 *
 * Composition is gated on `hasGlyph` actually having the composed character,
 * the same gate HarfBuzz's own Hebrew composer uses - a font missing a
 * presentation-form glyph keeps today's uncomposed path unchanged.
 *
 * @param {string} text
 * @param {(codePoint: number) => boolean} hasGlyph
 * @returns {string}
 */
export function composeHebrewClusters(text, hasGlyph) {
  const chars = Array.from(text.normalize('NFC'));
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const base = chars[i];
    if (!HEBREW_BASE.test(base)) {
      out += base;
      i += 1;
      continue;
    }
    let composed = base;
    let combinedMarks = '';
    const pending = [];
    let j = i + 1;
    while (j < chars.length && HEBREW_MARK.test(chars[j])) {
      const mark = chars[j];
      const markCcc = combiningClass(mark.codePointAt(0));
      const blocked = pending.some((p) => combiningClass(p.codePointAt(0)) >= markCcc);
      const candidate = !blocked && HEBREW_PRESENTATION_FORMS.get(base + combinedMarks + mark);
      if (candidate && hasGlyph(candidate.codePointAt(0))) {
        composed = candidate;
        combinedMarks += mark;
      } else {
        pending.push(mark);
      }
      j += 1;
    }
    out += composed + pending.join('');
    i = j;
  }
  return out;
}

// Exported for tests only - lets the guard corpus and unit tests check
// against the real table/ccc data instead of re-deriving or guessing it.
export const __internal = { HEBREW_PRESENTATION_FORMS, HEBREW_CCC, combiningClass };
