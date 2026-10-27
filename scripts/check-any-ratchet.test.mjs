import { describe, expect, it } from 'vitest';
import { compareAny, countAny, nextAnyRecord } from './check-any-ratchet.mjs';

describe('countAny (ARCH-70)', () => {
  it('counts annotations, casts, any arrays and generics', () => {
    const src = 'const a: any = 1;\nconst b = x as any;\nlet c: any[] = [];\nconst d = new Map<any>();\nfunction f(e: any) {}';
    expect(countAny(src)).toBe(5);
  });
  it('counts any inside generics, tuples and unions (wave 4 review)', () => {
    const src = 'let a: Record<string, any>;\nlet b: Map<K, any>;\nlet c = x as [string, any][];\nlet d: X | any;\nlet e: any | X;';
    expect(countAny(src)).toBe(5);
  });
  it('does not count a property, a key or a call named any', () => {
    expect(countAny('const o = { any: 1 };\nif (list.any) {}\nany(x);\nconst anyway = 1;')).toBe(0);
  });
  it('does not count any in a comment or a string', () => {
    const src = "// x: any\n/* y as any */\nconst s = ': any';\nconst t = `as any`;\nconst u = \"<any>\";\nconst v: string = 'any';";
    expect(countAny(src)).toBe(0);
  });
  it('does not count words that only start with any', () => {
    expect(countAny('const a: anyOf = 1; const b = many as company;')).toBe(0);
  });
});

describe('compareAny', () => {
  it('fails when one any is added', () => {
    expect(compareAny(20, 21).failed).toBe(true);
  });
  it('passes at the record', () => {
    expect(compareAny(20, 20)).toEqual({ failed: false, lowered: false });
  });
  it('passes a lower count and lowers the record locally', () => {
    expect(compareAny(20, 15)).toEqual({ failed: false, lowered: true });
    expect(nextAnyRecord(20, 15)).toBe(15);
    expect(nextAnyRecord(20, 21)).toBe(null);
    expect(nextAnyRecord(20, 20)).toBe(null);
  });
});
