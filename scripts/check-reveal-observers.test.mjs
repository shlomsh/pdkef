import { describe, expect, it } from 'vitest';
import { findObservers, isScanned } from './check-reveal-observers.mjs';

describe('check-reveal-observers', () => {
  it('flags an unlisted new IntersectionObserver with file:line', () => {
    const hits = findObservers({ file: 'src/x/Reveal.tsx', text: 'a\nconst io = new IntersectionObserver(cb);', allow: [] });
    expect(hits).toEqual([expect.objectContaining({ file: 'src/x/Reveal.tsx', line: 2 })]);
  });
  it('passes an allowlisted use and ignores comments and tests', () => {
    const allow = [{ file: 'src/x/Reveal.tsx', includes: 'new IntersectionObserver(', reason: 'r' }];
    expect(findObservers({ file: 'src/x/Reveal.tsx', text: 'new IntersectionObserver(cb)', allow })).toEqual([]);
    expect(findObservers({ file: 'src/x/Reveal.tsx', text: '// new IntersectionObserver(cb)', allow: [] })).toEqual([]);
    expect(isScanned('src/x/a.test.js')).toBe(false);
    expect(isScanned('src/test/support/setup.js')).toBe(false);
    expect(isScanned('src/x/e2e/a.spec.js')).toBe(false);
    expect(isScanned('src/x/Reveal.tsx')).toBe(true);
  });
  it('is strict: a second observer, a window-qualified or split constructor, and a stale entry fail', () => {
    const allow = [{ file: 'src/x/Reveal.tsx', includes: 'new IntersectionObserver(', reason: 'r' }];
    const file = 'src/x/Reveal.tsx';
    const one = 'const a = new IntersectionObserver(cb);';
    expect(findObservers({ file, text: `${one}\n${one}`, allow })).toEqual([expect.objectContaining({ line: 2, kind: 'unlisted' })]);
    expect(findObservers({ file, text: `${one}\nnew window.IntersectionObserver(cb)`, allow })).toHaveLength(1);
    expect(findObservers({ file, text: `${one}\nnew globalThis.IntersectionObserver(cb)`, allow })).toHaveLength(1);
    expect(findObservers({ file, text: `${one}\nnew\n  IntersectionObserver\n(cb)`, allow })).toHaveLength(1);
    expect(findObservers({ file, text: 'nothing here', allow })).toEqual([expect.objectContaining({ kind: 'stale' })]);
  });
});
