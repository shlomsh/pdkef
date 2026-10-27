import { describe, expect, it } from 'vitest';
import { compareJsCounts, countJsFiles, findTypedViolations, isJsSource, nextJsCounts } from './check-js-typed.mjs';

const FOLDERS = ['src/editor/adapters/pdf'];
const typed = '// @ts-check\nexport const a = 1;\n';

describe('findTypedViolations (ARCH-68)', () => {
  it('passes a listed-folder file that starts with @ts-check', () => {
    expect(findTypedViolations({ 'src/editor/adapters/pdf/a.js': typed }, FOLDERS)).toEqual([]);
  });

  it('fails a listed-folder .js without @ts-check', () => {
    const v = findTypedViolations({ 'src/editor/adapters/pdf/a.js': 'export const a = 1;\n' }, FOLDERS);
    expect(v).toEqual([{ file: 'src/editor/adapters/pdf/a.js', reason: 'missing // @ts-check' }]);
  });

  it('fails a suppression, whichever kind', () => {
    for (const s of ['@ts-ignore', '@ts-expect-error', '@ts-nocheck']) {
      const v = findTypedViolations({ 'src/editor/adapters/pdf/a.js': `// @ts-check\n// ${s}\nexport const a = 1;\n` }, FOLDERS);
      expect(v.map((x) => x.reason)).toEqual([`contains ${s}`]);
    }
  });

  it('fails the any / star JSDoc escape hatches', () => {
    for (const t of ['{any}', '{*}', '{Array<any>}', '{Map<string, *>}']) {
      const v = findTypedViolations({ 'src/editor/adapters/pdf/a.js': `// @ts-check\n/** @param ${t} x */\nexport const a = (x) => x;\n` }, FOLDERS);
      expect(v.length).toBe(1);
    }
  });

  it('ignores tests, helpers, other folders and non-js files', () => {
    const files = {
      'src/editor/adapters/pdf/a.test.js': 'x',
      'src/editor/adapters/pdf/b.test-helper.js': 'x',
      'src/editor/adapters/pdf/c.ts': 'x',
      'src/editor/other/d.js': 'x',
    };
    expect(findTypedViolations(files, FOLDERS)).toEqual([]);
  });
});

describe('js file counts (ARCH-68)', () => {
  const paths = ['src/lib/a.js', 'src/lib/b.jsx', 'src/lib/c.test.js', 'src/lib/e2e/d.js', 'src/lib/e.ts', 'src/shell/f.js', 'src/tools/g.js', 'src/tools/x/lib/h.js', 'src/tools/x/lib/h.test.js', 'src/tools/x/e2e/i.js'];

  it('counts non-test .js and .jsx per layer', () => {
    expect(isJsSource('src/lib/a.js')).toBe(true);
    expect(isJsSource('src/lib/a.test-helper.js')).toBe(false);
    expect(countJsFiles(paths)).toEqual({ 'src/lib': 2, 'src/editor': 0, 'src/shell': 1, 'src/tools': 2 });
  });

  it('fails a count above the record', () => {
    const { failures } = compareJsCounts({ 'src/lib': 1, 'src/editor': 0, 'src/shell': 1 }, { 'src/lib': 2, 'src/editor': 0, 'src/shell': 1 });
    expect(failures).toEqual([{ layer: 'src/lib', recorded: 1, current: 2 }]);
  });

  it('passes a lower count and lowers the record', () => {
    const recorded = { 'src/lib': 5, 'src/editor': 3, 'src/shell': 1 };
    const current = { 'src/lib': 4, 'src/editor': 3, 'src/shell': 1 };
    expect(compareJsCounts(recorded, current).failures).toEqual([]);
    expect(nextJsCounts(recorded, current)).toEqual({ 'src/lib': 4, 'src/editor': 3, 'src/shell': 1 });
  });

  it('writes nothing while failing or when nothing fell', () => {
    const r = { 'src/lib': 1, 'src/editor': 1, 'src/shell': 1 };
    expect(nextJsCounts(r, { ...r, 'src/lib': 2, 'src/editor': 0 })).toBeNull();
    expect(nextJsCounts(r, r)).toBeNull();
  });
});
