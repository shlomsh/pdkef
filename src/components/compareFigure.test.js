import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/components/compareFigure.css', 'utf8');
const rule = (selector) => css.match(new RegExp(`\\${selector} \\{([^}]*)\\}`))?.[1] ?? '';

// The split is physical: the after image is clipped to the right half with
// `left` and `clip-path: inset(...)`, whatever the page direction. Tags placed
// with inset-inline-* flipped on /he/ (2026-10-22), naming the 20KB image
// "המקור" and the original "20 KB".
describe('compare figure tags', () => {
  it('sit on the physical sides of the images they name, in any direction', () => {
    expect(rule('.compare-figure-tag-before')).toMatch(/(^|\s)left:/);
    expect(rule('.compare-figure-tag-after')).toMatch(/(^|\s)right:/);
    expect(css).not.toMatch(/inset-inline-(start|end)/);
  });
});
