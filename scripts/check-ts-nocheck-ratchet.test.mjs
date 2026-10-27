import { describe, expect, it } from 'vitest';
import { compareNoCheck, countNoCheck, hasNoCheckPragma } from './check-ts-nocheck-ratchet.mjs';

describe('hasNoCheckPragma', () => {
  it('counts a pragma comment at the top', () => {
    expect(hasNoCheckPragma('// @ts-nocheck\nimport x from "y";\n')).toBe(true);
    expect(hasNoCheckPragma('// header\n// @ts-nocheck - reason\nconst a = 1;\n')).toBe(true);
    expect(hasNoCheckPragma('/* @ts-nocheck */\nconst a = 1;\n')).toBe(true);
  });
  it('ignores a pragma mentioned in a string or a later comment', () => {
    expect(hasNoCheckPragma('const s = "// @ts-nocheck";\n')).toBe(false);
    expect(hasNoCheckPragma('const a = 1;\n// @ts-nocheck\n')).toBe(false);
    expect(hasNoCheckPragma('import x from "y";\n/* @ts-nocheck */\n')).toBe(false);
    expect(hasNoCheckPragma('// we never write @ts-nocheck here\nconst a = 1;\n')).toBe(false);
  });
});

describe('countNoCheck and compareNoCheck', () => {
  const sources = { 'src/a.test.ts': '// @ts-nocheck\n', 'src/b.test.ts': 'const x = 1;\n', 'src/c.test.ts': '// @ts-nocheck\n' };
  it('counts files with the pragma', () => {
    expect(countNoCheck(sources)).toBe(2);
  });
  it('fails when one more file carries the pragma', () => {
    expect(compareNoCheck(1, 2)).toEqual({ failed: true, lowered: false });
  });
  it('passes at the record and lowers on a lower count', () => {
    expect(compareNoCheck(2, 2)).toEqual({ failed: false, lowered: false });
    expect(compareNoCheck(5, 2)).toEqual({ failed: false, lowered: true });
  });
});
