/**
 * The values `@cantoo/pdf-lib` exports that are just values, reimplemented here
 * so that reaching for one does not put 628 KiB in every visitor's first paint.
 *
 * DEBT-20: pdf-lib was eager on all eleven tool pages. A large part of the
 * reason was not the PDF work at all. Nine modules that never parse or write a
 * document - the five shape entries in `src/editor/registry/`, and `pageOps.js`
 * shared by Merge, Split and Edit Pages - imported this package for a colour
 * constructor, a rotation constructor, a font name and an enum member. A static
 * import of a pure function is enough to make the whole library eager, and
 * `registry/index.ts` builds its definition map at module top level, so every
 * one of those five was statically reachable from both tool islands.
 *
 * Deferring was not available to them: these are called from `serialize` and
 * from `applyRotation`/`stampPageNumber`, all synchronous by contract, and
 * making them async to `await import()` a colour would have rewritten the
 * registry and every page loop that calls it. Reimplementing was available,
 * because not one of these names is an abstraction over anything:
 *
 *   - `rgb(r, g, b)` returns the literal `{ type: 'RGB', red, green, blue }`
 *     after asserting each channel is in 0..1.
 *   - `degrees(n)` returns the literal `{ type: 'degrees', angle: n }`.
 *   - `StandardFonts.Helvetica` is the string `'Helvetica'`, which pdf-lib
 *     resolves by lookup.
 *   - `LineCapStyle.Round` is the number 1.
 *
 * pdf-lib consumes all four by value: `color.type === ColorTypes.RGB` and
 * `rotation.type === RotationTypes.Degrees` are string comparisons, `lineCap`
 * is validated by an `===` scan over the enum's values, and the font name is a
 * key. No class, no `instanceof`, no identity check anywhere, so a local
 * literal is accepted verbatim.
 *
 * These are copies of someone else's constants, so they can drift silently if
 * pdf-lib changes a shape. `pdfLiterals.test.ts` is the whole defence: it
 * imports the real package, which is free in node where nothing ships, and
 * asserts each value still equals it. If that test fails this file is wrong.
 * Fix it here; do not weaken the test.
 *
 * Anything that needs pdf-lib's actual behaviour - loading, writing, embedding,
 * drawing - imports the package, and does it from a module that is only reached
 * after a file is opened. That boundary is guarded by
 * `scripts/check-lazy-modules.js`.
 */
import type { Degrees, LineCapStyle, RGB, StandardFonts } from '@cantoo/pdf-lib';

/** pdf-lib's own range check, kept so a caller passing 0..255 still fails loudly. */
function assertFraction(value: number, name: string): void {
  if (!(value >= 0 && value <= 1)) {
    throw new TypeError(`${name} must be a number between 0 and 1, got ${value}`);
  }
}

/** Structurally identical to `rgb()` from `@cantoo/pdf-lib`. */
export function rgb(red: number, green: number, blue: number): RGB {
  assertFraction(red, 'red');
  assertFraction(green, 'green');
  assertFraction(blue, 'blue');
  return { type: 'RGB', red, green, blue } as RGB;
}

/** Structurally identical to `degrees()` from `@cantoo/pdf-lib`. */
export function degrees(angle: number): Degrees {
  if (typeof angle !== 'number') {
    throw new TypeError(`degreeAngle must be a number, got ${typeof angle}`);
  }
  return { type: 'degrees', angle } as Degrees;
}

/** `LineCapStyle.Round` from `@cantoo/pdf-lib`. */
export const LINE_CAP_ROUND = 1 as LineCapStyle;

/** `StandardFonts.Helvetica` from `@cantoo/pdf-lib`. */
export const HELVETICA = 'Helvetica' as StandardFonts;
