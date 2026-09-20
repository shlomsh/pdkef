import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../geometry/coords.ts';
import { toPageTextRuns } from './textRuns.js';

/**
 * The conversion two callers share: the sign tool's hook in the browser, and
 * the scored corpus in Node. The point of the shared module is that both get
 * the same numbers, so these pin the arithmetic rather than the plumbing.
 */
const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 400 } });
const run = (str, e, f, width, height) => ({ str, transform: [1, 0, 0, 1, e, f], width, height });

describe('toPageTextRuns', () => {
  it('puts a run where the page does, measured from the top left', () => {
    // A run sitting at x=50, with its baseline at y=300 in PDF space (origin
    // bottom-left), is a quarter of the way down a 400pt page.
    const [only] = toPageTextRuns([run('שלום', 50, 300, 40, 20)], geometry);
    expect(only).toEqual({ str: 'שלום', left: 25, top: 20, width: 20, height: 5 });
  });

  it('skips marked-content entries and blank runs, which carry no glyphs', () => {
    const items = [
      { type: 'beginMarkedContent' },
      run('   ', 10, 10, 5, 5),
      run('real', 10, 10, 5, 5),
    ];
    expect(toPageTextRuns(items, geometry).map((r) => r.str)).toEqual(['real']);
  });

  it('reads a rotated page through the same geometry the ink pass uses', () => {
    // Not a separate code path: the guarantee is that text and ink land in one
    // coordinate space, which is the whole reason cells can be matched to
    // labels at all.
    const rotated = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 400 }, rotation: 90 });
    const [only] = toPageTextRuns([run('a', 50, 300, 40, 20)], rotated);
    expect(only.left).toBeGreaterThanOrEqual(0);
    expect(only.top).toBeGreaterThanOrEqual(0);
    expect(only).not.toEqual(toPageTextRuns([run('a', 50, 300, 40, 20)], geometry)[0]);
  });
});
