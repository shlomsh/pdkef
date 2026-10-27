import { describe, expect, it } from 'vitest';
import { englishLines, findViolations } from './check-never-say.mjs';

const find = (file, text) => findViolations({ file, text });

describe('check-never-say', () => {
  it('flags each banned phrase', () => {
    for (const phrase of ['100% private', 'Secure and fast', 'client-side', 'guaranteeing privacy', 'Instantly done', 'Free Forever', 'military-grade', 'a free tier']) {
      expect(find('src/data/tools.js', `x: '${phrase}'`), phrase).toHaveLength(1);
    }
  });
  it('lets legitimate wording through', () => {
    expect(find('src/data/tools.js', 'Target 100 KB. Unlike Chinese, Korean has spaces.')).toEqual([]);
    expect(find('src/data/tools.js', "gridDescription: 'Add a password to secure your PDF or remove it.'")).toEqual([]);
  });
  it('skips code comments and reports file and line', () => {
    const hits = find('src/data/tools.js', '// client-side fit\nok\nb: "100% sure"');
    expect(hits).toEqual([expect.objectContaining({ file: 'src/data/tools.js', line: 3 })]);
  });
  it('scans only English objects in *Messages.ts', () => {
    const text = 'const english = {\n  a: "100% done",\n};\nconst hebrew = {\n  a: "100% done",\n};\n';
    expect(englishLines(text).map((l) => l.line)).toEqual([1, 2, 3]);
    expect(find('src/i18n/xMessages.ts', text).map((h) => h.line)).toEqual([2]);
  });
  it('flags an em dash in copy, and lets an allowlisted line through', () => {
    const dash = '\u2014';
    expect(find('src/data/tools.js', `a: 'one ${dash} two'`)).toEqual([expect.objectContaining({ line: 1 })]);
    expect(find('src/data/tools.js', "a: 'one - two'")).toEqual([]);
    const allowed = findViolations({ file: 'src/data/tools.js', text: `a: 'one ${dash} two'`, emDashAllow: [{ file: 'src/data/tools.js', includes: 'one', reason: 'x' }] });
    expect(allowed).toEqual([]);
  });
});
