import { describe, expect, it } from 'vitest';
import { compareSize, isSizeScoped, measureSource, snapshot } from './check-size-ratchet.mjs';

const lines = (n) => Array.from({ length: n }, (_, i) => `  const v${i} = ${i};`).join('\n');

describe('measureSource (ARCH-50)', () => {
  it('counts file lines, not the trailing newline', () => {
    expect(measureSource('a\nb\nc\n', 'x.js').fileLines).toBe(3);
    expect(measureSource('a\nb\nc', 'x.js').fileLines).toBe(3);
  });

  it('measures a function declaration first line to last', () => {
    const m = measureSource(`function big() {\n${lines(5)}\n}\n`, 'x.js');
    expect(m.functions).toEqual([{ name: 'big', lines: 7 }]);
  });

  it('names a method by its class and an arrow by its variable', () => {
    const src = `class Foo {\n  bar() {\n    return 1;\n  }\n}\nconst baz = () => {\n  return 2;\n};\n`;
    const names = measureSource(src, 'x.ts').functions.map((f) => f.name).sort();
    expect(names).toEqual(['Foo.bar', 'baz']);
  });

  it('names a nested function after its enclosing chain', () => {
    const src = `function outer() {\n  function inner() {\n    return 1;\n  }\n  return inner;\n}\n`;
    expect(measureSource(src, 'x.js').functions.map((f) => f.name).sort()).toEqual(['outer', 'outer.inner']);
  });

  it('calls a function passed as an argument (anonymous) and numbers duplicates in source order', () => {
    const src = `run(() => {\n  a();\n});\nrun(() => {\n  b();\n  c();\n});\n`;
    expect(measureSource(src, 'x.js').functions).toEqual([
      { name: '(anonymous)', lines: 3 },
      { name: '(anonymous)~2', lines: 4 },
    ]);
  });

  it('takes a property name for a function expression in an object', () => {
    const src = `const o = {\n  go: function () {\n    return 1;\n  },\n};\n`;
    expect(measureSource(src, 'x.js').functions).toEqual([{ name: 'go', lines: 3 }]);
  });

  it('parses tsx', () => {
    const src = `export function C() {\n  return <div onClick={() => 1}>x</div>;\n}\n`;
    expect(measureSource(src, 'c.tsx').functions.map((f) => f.name).sort()).toEqual(['C', 'C.(anonymous)']);
  });
});

describe('isSizeScoped', () => {
  it.each([
    ['src/a/b.ts', true],
    ['scripts/x.mjs', true],
    ['api/report.ts', true],
    ['middleware.ts', true],
    ['src/a/b.test.js', false],
    ['src/a/b.spec.ts', false],
    ['src/tools/x/e2e/y.js', false],
    ['src/types.d.ts', false],
    ['src/a/style.css', false],
    ['docs/x.js', false],
  ])('%s -> %s', (file, expected) => expect(isSizeScoped(file)).toBe(expected));
});

describe('compareSize', () => {
  const th = { fileThreshold: 800, functionThreshold: 300 };
  const rec = (fileLines = {}, functionLines = {}) => ({ fileLines, functionLines });

  it('passes when nothing changed', () => {
    const r = rec({ 'a.js': 900 }, { 'a.js#f': 310 });
    expect(compareSize(r, r, th)).toEqual({ failures: [], lowered: [] });
  });

  it('fails a recorded file that grew and names it', () => {
    const { failures } = compareSize(rec({ 'a.js': 900 }), rec({ 'a.js': 901 }), th);
    expect(failures).toEqual([{ key: 'a.js', kind: 'file', recorded: 900, current: 901 }]);
  });

  it('fails an unrecorded function over the threshold', () => {
    const { failures } = compareSize(rec(), rec({}, { 'a.js#g': 301 }), th);
    expect(failures).toEqual([{ key: 'a.js#g', kind: 'function', recorded: 300, current: 301 }]);
  });

  it('lowers a shrunk record and drops one that fell below the threshold or vanished', () => {
    const recorded = rec({ 'a.js': 900, 'b.js': 850, 'gone.js': 820 }, {});
    const current = rec({ 'a.js': 880 }, {});
    const { failures, lowered } = compareSize(recorded, current, th);
    expect(failures).toEqual([]);
    expect(lowered).toEqual([
      { key: 'a.js', kind: 'file', from: 900, to: 880 },
      { key: 'b.js', kind: 'file', from: 850, to: null },
      { key: 'gone.js', kind: 'file', from: 820, to: null },
    ]);
  });
});

describe('snapshot', () => {
  it('keeps only what is over the thresholds', () => {
    const measured = {
      'a.js': { fileLines: 801, functions: [{ name: 'f', lines: 301 }, { name: 'g', lines: 300 }] },
      'b.js': { fileLines: 800, functions: [] },
    };
    expect(snapshot(measured, { fileThreshold: 800, functionThreshold: 300 })).toEqual({
      fileLines: { 'a.js': 801 },
      functionLines: { 'a.js#f': 301 },
    });
  });
});
