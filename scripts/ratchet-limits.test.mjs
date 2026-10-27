import { describe, expect, it } from 'vitest';
import { findRaises } from './ratchet-limits.mjs';

describe('findRaises (ARCH-76)', () => {
  const base = { css: { maxPageDeadBytes: 10000, maxFamilyDuplication: 0.65 }, list: { a: 1 } };

  it('passes when nothing changed', () => {
    expect(findRaises(base, structuredClone(base))).toEqual([]);
  });

  it('fails a numeric leaf that rose', () => {
    const head = structuredClone(base);
    head.css.maxPageDeadBytes = 10001;
    expect(findRaises(base, head)).toEqual([{ path: 'css.maxPageDeadBytes', before: 10000, after: 10001, kind: 'raised' }]);
  });

  it('passes a lowered value', () => {
    const head = structuredClone(base);
    head.css.maxPageDeadBytes = 9999;
    expect(findRaises(base, head)).toEqual([]);
  });

  it('passes a removed key', () => {
    const head = structuredClone(base);
    delete head.list.a;
    expect(findRaises(base, head)).toEqual([]);
  });

  it('fails a new key inside an existing top-level section', () => {
    const head = structuredClone(base);
    head.list.b = 5;
    expect(findRaises(base, head)).toEqual([{ path: 'list.b', before: undefined, after: 5, kind: 'added' }]);
  });

  it('fails a new nested key under an existing section', () => {
    const b = { size: { fileLines: { 'a.js': 900 } } };
    const head = { size: { fileLines: { 'a.js': 900, 'b.js': 901 } } };
    expect(findRaises(b, head).map((r) => r.path)).toEqual(['size.fileLines.b.js']);
  });

  it('passes a whole new top-level section', () => {
    const head = { ...structuredClone(base), fresh: { limit: 3 } };
    expect(findRaises(base, head)).toEqual([]);
  });
});
