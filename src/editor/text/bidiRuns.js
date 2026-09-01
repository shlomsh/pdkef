import bidiFactory from 'bidi-js';

/**
 * Split one line of text into contiguous same-direction runs, in VISUAL
 * (left-to-right paint) order, per UAX#9.
 *
 * Why this module exists: `shapedWidth`/`drawShapedRun` (and, before them,
 * pdf-lib's own `encodeText`) call fontkit's `font.layout(text)` once on an
 * entire line, mixed directions and all. fontkit only reverses a run into RTL
 * visual order when the *whole string it is given* is judged RTL - so a
 * mixed line either comes out with its Hebrew segment un-reversed (fontkit
 * guesses LTR) or with a Latin/digit segment wrongly reversed along with the
 * Hebrew (fontkit guesses RTL). Passing `direction` explicitly to a single
 * whole-line `layout()` call does not fix this - it was measured, and only
 * changes *which* of those two wrong outputs you get (see the "Step 1
 * measurement" note in the H6 task and docs/hebrew-text-shaping-export.md,
 * "Layer 2: mixed-direction lines don't bidi-reorder"). The fix is to split
 * the line into single-direction runs first, and only then hand each run to
 * fontkit (which shapes and internally reverses a single-direction RTL run
 * correctly on its own - that part was never broken).
 *
 * This module owns exactly two things, both real UAX#9 stages:
 *  - run splitting (contiguous same-embedding-level substrings), and
 *  - run REORDERING (rule L2: reverse contiguous run sequences from the
 *    highest level down to the lowest odd level) - placing shaped runs
 *    left to right in *logical* order is the current bug expressed at run
 *    granularity instead of glyph granularity, so this step is the actual
 *    fix, not a nicety.
 *
 * It deliberately does NOT reverse the characters *inside* a run before
 * handing it to the caller: each returned run's `text` is the original
 * logical (typed) substring, because fontkit's own shaper already reverses
 * an RTL run's glyphs internally once it is given that run's true logical
 * text plus an explicit direction. Reversing the text here first would feed
 * fontkit an already-reversed string and corrupt mark attachment (nikud is a
 * non-spacing mark that attaches to the character adjacent to it in the
 * *logical* string fontkit shapes, not the visual one).
 *
 * `bidi-js` (MIT, already resolved transitively via jsdom, added as a direct
 * dependency for this) does the certified UAX#9 embedding-level computation
 * and L2 reordering; this module only re-derives run *order* from bidi-js's
 * character-level reordering output; see `resolveBidiRuns` below for how.
 */
const bidi = bidiFactory();

/**
 * `paragraphDirection` is REQUIRED and is never auto-detected here - on
 * purpose. The editor renders each text element in a `<textarea
 * dir={textDirection}>` (see TextNode.tsx), where `textDirection` comes from
 * `getEffectiveTextDirection(element)` in signHelpers.js: one fixed base
 * direction for the *whole element*, derived from its first strong
 * character (or the element's own `textDirection`), never re-detected per
 * line. That is an explicit UAX#9 paragraph embedding level (HTML's `dir`
 * attribute), not the auto-detection UAX#9 itself defines as a fallback for
 * when no such override exists. If this module were to auto-detect a line's
 * direction from its own content instead, a line whose own first strong
 * character disagrees with the element's overall direction (e.g. a numeric
 * line inside an otherwise-Hebrew element, or vice versa) would resolve
 * differently from how the browser renders that same line inside the
 * `dir`-fixed textarea, and the export would silently disagree with the
 * screen on exactly the ambiguous lines this module exists to fix. Callers
 * must always pass the element's effective direction (computed once, not
 * per line) - never let this function guess.
 *
 * @param {string} line one line of text (must not contain "\n")
 * @param {'ltr'|'rtl'} paragraphDirection the fixed base direction for this
 *   line - the element's effective direction, not this line's own
 * @returns {{ text: string, direction: 'ltr'|'rtl' }[]} runs in visual
 *   (left-to-right paint) order; each run's `text` is in ORIGINAL logical
 *   (typed) order, ready to hand to `shapedWidth`/`drawShapedRun` with its
 *   own `direction`
 */
export function resolveBidiRuns(line, paragraphDirection) {
  const baseDirection = paragraphDirection === 'rtl' ? 'rtl' : 'ltr';
  const text = line || '';
  if (!text) return [{ text: '', direction: baseDirection }];

  const embeddingLevels = bidi.getEmbeddingLevels(text, baseDirection);
  const { levels } = embeddingLevels;

  // Group into maximal contiguous same-level runs, in logical (typed) order.
  // A "level run" is exactly the unit UAX#9 reorders as a whole (L2 only ever
  // reverses contiguous sequences of characters "at that level or higher",
  // which - because level is piecewise-constant over these runs - always
  // starts and ends on a run boundary, never mid-run).
  const runs = [];
  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i];
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.end = i;
    else runs.push({ start: i, end: i, level });
  }

  if (runs.length <= 1) {
    const level = runs[0]?.level ?? (baseDirection === 'rtl' ? 1 : 0);
    return [{ text, direction: level % 2 ? 'rtl' : 'ltr' }];
  }

  const runIndexOfChar = new Array(levels.length);
  runs.forEach((run, runIndex) => {
    for (let i = run.start; i <= run.end; i += 1) runIndexOfChar[i] = runIndex;
  });

  // bidi-js's own certified rule-L2 implementation, applied at the character
  // level exactly as its README documents: start with the identity order,
  // then reverse every flip range in order. We only read off which RUN each
  // final position belongs to - never the reversed characters themselves -
  // since (per the module doc above) a run's *internal* character order must
  // stay logical for fontkit to shape and reverse it correctly on its own.
  const order = Array.from({ length: levels.length }, (_, i) => i);
  const flips = bidi.getReorderSegments(text, embeddingLevels);
  flips.forEach(([start, end]) => {
    let lo = start;
    let hi = end;
    while (lo < hi) {
      const tmp = order[lo];
      order[lo] = order[hi];
      order[hi] = tmp;
      lo += 1;
      hi -= 1;
    }
  });

  const visualRunOrder = [];
  const seen = new Set();
  order.forEach((charIndex) => {
    const runIndex = runIndexOfChar[charIndex];
    if (!seen.has(runIndex)) {
      seen.add(runIndex);
      visualRunOrder.push(runIndex);
    }
  });

  return visualRunOrder.map((runIndex) => {
    const run = runs[runIndex];
    return { text: text.slice(run.start, run.end + 1), direction: run.level % 2 ? 'rtl' : 'ltr' };
  });
}
