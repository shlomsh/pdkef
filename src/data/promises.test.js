/**
 * The four promises are the one source PromiseStickers draws from. These
 * tests pin the shape and the voice rules (no dashes, short lines), not the
 * editorial wording itself.
 */
import { describe, it, expect } from 'vitest';
import { PROMISE_KINDS, promises } from './promises.js';

const TONES = ['paper', 'citron', 'mint'];

describe('promises', () => {
  it('has exactly the kinds in PROMISE_KINDS', () => {
    expect(Object.keys(promises).sort()).toEqual([...PROMISE_KINDS].sort());
  });

  it('gives every kind a title, icon, tone and line', () => {
    for (const kind of PROMISE_KINDS) {
      const p = promises[kind];
      expect(p.title, kind).toBeTruthy();
      expect(p.icon, kind).toBeTruthy();
      expect(p.tone, kind).toBeTruthy();
      expect(p.line, kind).toBeTruthy();
    }
  });

  it('uses a known tone', () => {
    for (const kind of PROMISE_KINDS) expect(TONES).toContain(promises[kind].tone);
  });

  it('has no em or en dashes in titles or lines', () => {
    for (const kind of PROMISE_KINDS) {
      expect(promises[kind].title).not.toMatch(/[–—]/);
      expect(promises[kind].line).not.toMatch(/[–—]/);
    }
  });

  it('keeps every line at 80 characters or fewer', () => {
    for (const kind of PROMISE_KINDS) expect(promises[kind].line.length).toBeLessThanOrEqual(80);
  });

  it('links only the open-source promise, to the repository', () => {
    const linked = PROMISE_KINDS.filter((kind) => promises[kind].href);
    expect(linked).toEqual(['open-source']);
    expect(promises['open-source'].href).toBe('https://github.com/shlomsh/pdkef');
  });
});
