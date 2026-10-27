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
});
