import { describe, expect, it } from 'vitest';
import { citedPaths, findDeadPaths } from './check-cited-paths.mjs';

const none = () => false;
const dead = (file, text, exists = none) => findDeadPaths({ file, text, exists }).map((d) => d.path);

describe('check-cited-paths', () => {
  it('fails a rule file citing a missing path', () => {
    expect(dead('.claude/rules/x.md', 'See `src/nowhere/missing.ts:12-14`.')).toEqual(['src/nowhere/missing.ts']);
  });
  it('fails a source comment citing a missing path, and ignores code', () => {
    expect(dead('src/a.ts', '// moved to src/nowhere/missing.ts\nconst p = "src/in/code.ts";')).toEqual(['src/nowhere/missing.ts']);
    expect(dead('src/a.ts', `/${'*'} see\n docs/gone.md */`)).toEqual(['docs/gone.md']);
    expect(dead('src/A.astro', '<!-- see docs/gone.md -->')).toEqual(['docs/gone.md']);
  });
  it('passes an existing path', () => {
    expect(dead('CLAUDE.md', '`src/a.ts` and package.json', (p) => p === 'src/a.ts' || p === 'package.json')).toEqual([]);
  });
  it('does not treat globs or patterns as paths', () => {
    expect(citedPaths('`src/tools/*/e2e/` `src/**` `src/tools/<tool>/x.ts` `src/a.{ts,tsx}`')).toEqual([]);
  });
  it('skips docs/archive/ and backlog/ files', () => {
    expect(dead('docs/archive/old.md', '`src/nowhere.ts`')).toEqual([]);
    expect(dead('backlog/tasks/X.md', '`src/nowhere.ts`')).toEqual([]);
  });
  it('skips a path inside a URL or a relative path', () => {
    expect(citedPaths('https://example.com/src/a.ts and ../src/b.ts and ./src/c.ts')).toEqual([]);
  });
  it('strips line suffixes and trailing punctuation', () => {
    expect(citedPaths('(src/a.ts:5-9), then src/b.ts.')).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
