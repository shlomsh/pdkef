import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { citedPaths, findDeadPaths, scanRepo } from './check-cited-paths.mjs';

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

// DEBT-68: the guard reads the filesystem, so a gitignored file a local tool drops into the worktree
// (the impeccable plugin writes its skill and agent files under .claude) failed it
// while CI, which never has those files, passed.
describe('scanRepo only scans files git knows about', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const put = (root, file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const makeRepo = () => {
    const root = mkdtempSync(join(tmpdir(), 'cited-paths-'));
    git(root, 'init', '-q');
    put(root, '.gitignore', '.claude/*\n!.claude/agents/\n.claude/agents/impeccable-*\n');
    put(root, '.claude/agents/implementer.md', 'cites `src/missing-tracked.ts`\n');
    git(root, 'add', '.gitignore', '.claude/agents/implementer.md');
    return root;
  };
  const deadIn = (root) => scanRepo(root).map((d) => d.file).sort();

  it('flags a tracked file, skips a gitignored one, still flags an untracked unignored one', () => {
    const root = makeRepo();
    try {
      put(root, '.claude/agents/impeccable-applier.md', 'cites `src/App.jsx`\n');
      put(root, '.claude/skills/impeccable/reference/live.md', 'cites `src/page.html`\n');
      expect(deadIn(root)).toEqual(['.claude/agents/implementer.md']);
      put(root, 'docs/new-note.md', 'cites `src/missing-new.ts`\n');
      expect(deadIn(root)).toEqual(['.claude/agents/implementer.md', 'docs/new-note.md']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('judges a cited path by the same git-known set, so a gitignored-only target is dead as on CI', () => {
    const root = makeRepo();
    try {
      put(root, '.claude/skills/impeccable/reference/live.md', 'local only\n');
      put(root, 'src/real/a.ts', 'export {};\n');
      put(root, 'docs/cites.md', 'dir `src/real/`, file `src/real/a.ts`, local `.claude/skills/impeccable/reference/live.md`\n');
      git(root, 'add', 'src/real/a.ts', 'docs/cites.md');
      const dead = scanRepo(root).filter((d) => d.file === 'docs/cites.md').map((d) => d.path);
      expect(dead).toEqual(['.claude/skills/impeccable/reference/live.md']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
