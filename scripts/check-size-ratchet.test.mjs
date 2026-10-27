import { describe, expect, it } from 'vitest';
import { compareSize, isSizeScoped, measureSource, nextRecords, snapshot } from './check-size-ratchet.mjs';

const lines = (n) => Array.from({ length: n }, (_, i) => `  const v${i} = ${i};`).join('\n');

describe('measureSource (ARCH-50)', () => {
  it('counts file lines, not the trailing newline', () => {
    expect(measureSource('a\nb\nc\n', 'x.js').fileLines).toBe(3);
    expect(measureSource('a\nb\nc', 'x.js').fileLines).toBe(3);
  });

  it('measures a function declaration first line to last', () => {
    const m = measureSource(`function big() {\n${lines(5)}\n}\n`, 'x.js');
    expect(m.functions).toEqual([{ name: 'big', lines: 7, depth: 0 }]);
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
      { name: '(anonymous)', lines: 3, depth: 0 },
      { name: '(anonymous)~2', lines: 4, depth: 0 },
    ]);
  });

  it('takes a property name for a function expression in an object', () => {
    const src = `const o = {\n  go: function () {\n    return 1;\n  },\n};\n`;
    expect(measureSource(src, 'x.js').functions).toEqual([{ name: 'go', lines: 3, depth: 0 }]);
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
    ['src/layouts/HomePageLayout.astro', true],
    ['src/a/b.test.js', false],
    ['src/a/b.spec.ts', false],
    ['src/tools/x/e2e/y.js', false],
    ['src/types.d.ts', false],
    ['src/a/style.css', false],
    ['docs/x.js', false],
  ])('%s -> %s', (file, expected) => expect(isSizeScoped(file)).toBe(expected));
});

describe('function length tier at 150 and nesting depth (ARCH-105)', () => {
  const th = { fileThreshold: 800, functionThreshold: 150, nestingCap: 4 };
  const rec = (functionLines = {}, nesting = {}) => ({ fileLines: {}, functionLines, nesting });
  const fn = (body) => `function f() {\n${body}\n}\n`;
  const depthOf = (src) => measureSource(src, 'x.js').functions.find((f) => f.name === 'f').depth;

  it('fails an unrecorded 151-line function, passes a 150-line one', () => {
    const big = measureSource(fn(lines(149)), 'x.js'); // 151 lines
    const ok = measureSource(fn(lines(148)), 'x.js'); // 150 lines
    const snap = (m) => snapshot({ 'a.js': m }, th);
    expect(snap(big).functionLines).toEqual({ 'a.js#f': 151 });
    expect(snap(ok).functionLines).toEqual({});
    expect(compareSize(rec(), snap(big), th).failures).toEqual([{ key: 'a.js#f', kind: 'function', recorded: 150, current: 151 }]);
  });

  it('fails a recorded function that grew and lowers one that shrank', () => {
    expect(compareSize(rec({ 'a.js#f': 200 }), rec({ 'a.js#f': 201 }), th).failures).toHaveLength(1);
    expect(compareSize(rec({ 'a.js#f': 200 }), rec({ 'a.js#f': 190 }), th).lowered).toEqual([{ key: 'a.js#f', kind: 'function', from: 200, to: 190 }]);
    expect(nextRecords(rec({ 'a.js#f': 200 }), rec({ 'a.js#f': 190 }), th).functionLines).toEqual({ 'a.js#f': 190 });
  });

  it('measures depth: 4 levels is at the cap, 5 is over it', () => {
    const four = fn('if (a) { for (;;) { while (b) { if (c) { x(); } } } }');
    const five = fn('if (a) { for (;;) { while (b) { if (c) { try { x(); } catch (e) {} } } } }');
    expect(depthOf(four)).toBe(4);
    expect(depthOf(five)).toBe(5);
    const snap = (src) => snapshot({ 'a.js': measureSource(src, 'x.js') }, th);
    expect(snap(four).nesting).toEqual({});
    expect(snap(five).nesting).toEqual({ 'a.js#f': 5 });
    expect(compareSize(rec(), snap(five), th).failures).toEqual([{ key: 'a.js#f', kind: 'nesting', recorded: 4, current: 5 }]);
    expect(compareSize(rec({}, { 'a.js#f': 6 }), snap(five), th).lowered).toEqual([{ key: 'a.js#f', kind: 'nesting', from: 6, to: 5 }]);
  });

  it('counts an else-if chain once', () => {
    expect(depthOf(fn('if (a) { x(); } else if (b) { y(); } else if (c) { z(); } else { w(); }'))).toBe(1);
  });

  it('counts catch and finally at the try level, switch cases at the switch level, and a bare block', () => {
    expect(depthOf(fn('try { a(); } catch (e) { b(); } finally { c(); }'))).toBe(1);
    expect(depthOf(fn('switch (a) { case 1: { if (b) { c(); } } }'))).toBe(3);
    expect(depthOf(fn('{ { x(); } }'))).toBe(2);
    expect(depthOf(fn('do { x(); } while (a);'))).toBe(1);
    expect(depthOf(fn('for (const k of o) { for (const j in k) { x(); } }'))).toBe(2);
  });

  it('counts a nested arrow separately under its own key and ignores JSX', () => {
    const src = fn('if (a) { if (b) { run(() => { if (c) { x(); } }); } }');
    const fs = measureSource(src, 'x.js').functions;
    expect(fs).toEqual([
      { name: 'f', lines: 3, depth: 2 },
      { name: 'f.(anonymous)', lines: 1, depth: 1 },
    ]);
    const jsx = 'export function C() {\n  return <div>{a ? <p>{b ? <i/> : null}</p> : null}</div>;\n}\n';
    expect(measureSource(jsx, 'c.tsx').functions[0].depth).toBe(0);
  });
});

describe('compareSize', () => {
  const th = { fileThreshold: 800, functionThreshold: 300, nestingCap: 4 };
  const rec = (fileLines = {}, functionLines = {}) => ({ fileLines, functionLines, nesting: {} });

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

describe('nextRecords', () => {
  const th = { fileThreshold: 800, functionThreshold: 300, nestingCap: 4 };
  const rec = (fileLines = {}, functionLines = {}) => ({ fileLines, functionLines, nesting: {} });

  it('returns null when one file shrank but another grew (nothing may be written)', () => {
    const recorded = rec({ 'a.js': 900, 'b.js': 850 });
    const current = rec({ 'a.js': 880, 'b.js': 860 });
    expect(nextRecords(recorded, current, th)).toBeNull();
  });

  it('lowers only the shrunk entry and leaves the others exactly as recorded', () => {
    const recorded = rec({ 'a.js': 900, 'b.js': 850, 'c.js': 820 }, { 'a.js#f': 310 });
    const current = rec({ 'a.js': 880, 'b.js': 850, 'c.js': 830 }, { 'a.js#f': 310 });
    expect(nextRecords(recorded, current, th)).toBeNull();
    const ok = rec({ 'a.js': 880, 'b.js': 850 }, { 'a.js#f': 310 });
    expect(nextRecords(recorded, ok, th)).toEqual({ fileLines: { 'a.js': 880, 'b.js': 850 }, functionLines: { 'a.js#f': 310 }, nesting: {} });
  });

  it('returns null when nothing was lowered', () => {
    const r = rec({ 'a.js': 900 });
    expect(nextRecords(r, r, th)).toBeNull();
  });
});

describe('snapshot', () => {
  it('keeps only what is over the thresholds', () => {
    const measured = {
      'a.js': { fileLines: 801, functions: [{ name: 'f', lines: 301 }, { name: 'g', lines: 300 }] },
      'b.js': { fileLines: 800, functions: [] },
    };
    expect(snapshot(measured, { fileThreshold: 800, functionThreshold: 300, nestingCap: 4 })).toEqual({
      fileLines: { 'a.js': 801 },
      functionLines: { 'a.js#f': 301 },
      nesting: {},
    });
  });
});
