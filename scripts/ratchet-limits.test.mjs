import { describe, expect, it } from 'vitest';
import { findRaises, parseRenames } from './ratchet-limits.mjs';

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

describe('findRaises with renames', () => {
  const renames = new Map([['src/a.js', 'src/a.ts']]);
  const base = { size: { fileLines: { 'src/a.js': 1156 }, functionLines: { 'src/a.js#Foo.bar': 90 } } };

  it('passes a rename at the same or a lower value', () => {
    const head = { size: { fileLines: { 'src/a.ts': 1148 }, functionLines: { 'src/a.ts#Foo.bar': 90 } } };
    expect(findRaises(base, head, renames)).toEqual([]);
  });

  it('fails a rename with a higher value', () => {
    const head = { size: { fileLines: { 'src/a.ts': 1157 }, functionLines: { 'src/a.ts#Foo.bar': 90 } } };
    expect(findRaises(base, head, renames).map((r) => r.path)).toEqual(['size.fileLines.src/a.ts']);
  });

  it('still fails a new key with no rename', () => {
    const head = { size: { fileLines: { 'src/a.ts': 1148, 'src/new.ts': 1000 }, functionLines: { 'src/a.ts#Foo.bar': 90 } } };
    expect(findRaises(base, head, renames).map((r) => r.path)).toEqual(['size.fileLines.src/new.ts']);
  });

  it('a #function key follows the rename', () => {
    const head = { size: { fileLines: { 'src/a.ts': 1148 }, functionLines: { 'src/a.ts#Foo.bar': 91 } } };
    expect(findRaises(base, head, renames).map((r) => r.path)).toEqual(['size.functionLines.src/a.ts#Foo.bar']);
  });
});

describe('parseRenames', () => {
  it('reads R lines and ignores M/A/D', () => {
    const text = 'R100\tsrc/a.js\tsrc/a.ts\nR087\tsrc/b.js\tsrc/c/b.js\nM\tsrc/m.js\nA\tsrc/n.js\nD\tsrc/d.js\n';
    expect([...parseRenames(text)]).toEqual([['src/a.js', 'src/a.ts'], ['src/b.js', 'src/c/b.js']]);
  });
});
