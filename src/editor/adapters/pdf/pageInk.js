import { PDFName } from '@cantoo/pdf-lib';
import { getPageContentBytes } from './pdfObjects.js';
import { tokenize, multiplyMatrix, applyMatrix } from './contentStream.js';

/**
 * Axis-aligned vector ink a page draws, in PDF user space.
 *
 * `contentStream.js` is the lexical layer and says so: graphics-state
 * interpretation is the caller's job. This is that caller for the *path*
 * operators, the same way `pdfObjects.js` is for text and image placements.
 *
 * Three things make this more than a regex over the stream, and each one was a
 * measured finding rather than a guess (see backlog/tasks/MOBI-03.md):
 *
 * 1. **The CTM is not optional.** Income tax form 101 issues 370 `cm` operators
 *    on page 1, so raw operands share no baseline at all. Walking the stream
 *    without composing the current transformation matrix recovers zero of the
 *    seventeen comb runs that are actually there.
 *
 * 2. **The same visual object is drawn with different primitives.** Form 101
 *    rules its comb cells as stroked segments (`m`/`l`/`S`); the National
 *    Insurance health declaration draws them as filled rectangles (`re`/`f*`).
 *    A collector that reports only one of the two finds literally nothing in
 *    the other document, so both are normalized here into the same shapes.
 *
 * 3. **A rectangle is not ink until something paints it.** The health
 *    declaration issues 1,635 `re` operators, of which 1,027 are clipping
 *    paths (`re W* n`) that draw nothing at all. Counting those as boxes
 *    inflates the checkbox count by 76 phantom 13.3x10.8 "squares". `n` ends a
 *    path without painting it, so only the painting operators publish.
 *
 * Deliberately out of scope, because no evidence form needs it and untested
 * recursion is worse than a documented limit: content inside a Form XObject
 * (`/Name Do` where the XObject is a form, not an image) is not walked. Both
 * evidence forms draw their grids in the page's own stream.
 */

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** How far off-axis a segment may sit and still count as horizontal/vertical (PDF points). */
const AXIS_TOLERANCE = 0.6;

/** Path-painting operators. `n` is deliberately absent: it ends a path without drawing it. */
const FILL_OPERATORS = new Set(['f', 'F', 'f*']);
const STROKE_OPERATORS = new Set(['S', 's']);
const FILL_AND_STROKE_OPERATORS = new Set(['B', 'B*', 'b', 'b*']);
const PAINT_OPERATORS = new Set([
  ...FILL_OPERATORS,
  ...STROKE_OPERATORS,
  ...FILL_AND_STROKE_OPERATORS,
  'n',
]);

/**
 * Walks already-tokenized content and reports the axis-aligned ink it paints.
 *
 * Kept separate from the pdf-lib entry point below so the graphics-state walk
 * can be tested against hand-written streams with no document to load.
 *
 * @param {ReturnType<typeof tokenize>} tokens
 * @param {{ baseMatrix?: number[] }} [options] `baseMatrix` composes underneath
 *   every operand, for a caller that has already placed the content somewhere.
 * @returns {{
 *   verticals: Array<{x: number, y0: number, y1: number}>,
 *   horizontals: Array<{y: number, x0: number, x1: number}>,
 *   rects: Array<{x: number, y: number, width: number, height: number, stroked: boolean, filled: boolean}>,
 * }}
 */
export function collectInkFromTokens(tokens, { baseMatrix = IDENTITY } = {}) {
  const verticals = [];
  const horizontals = [];
  const rects = [];

  let ctm = baseMatrix;
  const ctmStack = [];
  let operands = [];

  // Everything since the last path-painting operator. A path is only ink once
  // an operator other than `n` closes it, so these stay pending until then.
  let pendingSegments = [];
  let pendingRects = [];
  let current = null;
  let subpathStart = null;

  const num = (index) => (operands[index]?.type === 'number' ? operands[index].value : 0);
  const point = (x, y) => applyMatrix(ctm, x, y);

  const lineTo = (to) => {
    if (current) pendingSegments.push([current, to]);
    current = to;
  };

  const flushPath = (painted, stroked, filled) => {
    if (painted) {
      for (const [from, to] of pendingSegments) {
        const dx = Math.abs(from[0] - to[0]);
        const dy = Math.abs(from[1] - to[1]);
        if (dx <= AXIS_TOLERANCE && dy > AXIS_TOLERANCE) {
          verticals.push({
            x: (from[0] + to[0]) / 2,
            y0: Math.min(from[1], to[1]),
            y1: Math.max(from[1], to[1]),
          });
        } else if (dy <= AXIS_TOLERANCE && dx > AXIS_TOLERANCE) {
          horizontals.push({
            y: (from[1] + to[1]) / 2,
            x0: Math.min(from[0], to[0]),
            x1: Math.max(from[0], to[0]),
          });
        }
      }
      for (const rect of pendingRects) rects.push({ ...rect, stroked, filled });
    }
    pendingSegments = [];
    pendingRects = [];
    current = null;
    subpathStart = null;
  };

  for (const token of tokens) {
    if (token.type !== 'operator') {
      operands.push(token);
      continue;
    }

    const op = token.value;
    switch (op) {
      case 'q':
        ctmStack.push(ctm);
        break;
      case 'Q':
        ctm = ctmStack.pop() ?? IDENTITY;
        break;
      case 'cm':
        ctm = multiplyMatrix([num(0), num(1), num(2), num(3), num(4), num(5)], ctm);
        break;

      case 'm':
        current = point(num(0), num(1));
        subpathStart = current;
        break;
      case 'l':
        lineTo(point(num(0), num(1)));
        break;
      // A curve's control points are not axis-aligned ink, but the pen still
      // moves: dropping the endpoint would attach the next `l` to a stale
      // position and invent a segment the page never draws.
      case 'c':
        current = point(num(4), num(5));
        break;
      case 'v':
      case 'y':
        current = point(num(2), num(3));
        break;
      case 'h':
        if (subpathStart) lineTo(subpathStart);
        break;

      case 're': {
        const x = num(0);
        const y = num(1);
        const width = num(2);
        const height = num(3);
        const corners = [
          point(x, y),
          point(x + width, y),
          point(x, y + height),
          point(x + width, y + height),
        ];
        const xs = corners.map((corner) => corner[0]);
        const ys = corners.map((corner) => corner[1]);
        pendingRects.push({
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        });
        // `re` leaves the current point at the rectangle's origin.
        current = corners[0];
        subpathStart = corners[0];
        break;
      }

      default:
        if (PAINT_OPERATORS.has(op)) {
          flushPath(
            op !== 'n',
            STROKE_OPERATORS.has(op) || FILL_AND_STROKE_OPERATORS.has(op),
            FILL_OPERATORS.has(op) || FILL_AND_STROKE_OPERATORS.has(op),
          );
        }
        break;
    }

    operands = [];
  }

  return { verticals, horizontals, rects };
}

/**
 * Collects the axis-aligned ink of one pdf-lib page, in PDF user space.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 */
export function collectPageInk(page) {
  return collectInkFromTokens(tokenize(getPageContentBytes(page)));
}

/** The page's visible box, as `coords.ts` wants it. Keeps callers off `page.node`. */
export function pageCropBox(page) {
  const context = page.doc.context;
  const raw = context.lookup(page.node.get(PDFName.of('CropBox')))
    || context.lookup(page.node.get(PDFName.of('MediaBox')));
  const values = raw?.asRectangle?.();
  if (values) return values;
  const { width, height } = page.getSize();
  return { x: 0, y: 0, width, height };
}
