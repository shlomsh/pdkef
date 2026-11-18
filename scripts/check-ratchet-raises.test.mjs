import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raisesSince, oxlintAllowSections } from './check-ratchet-raises.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-ratchet-raises.mjs');
const dirs = [];

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// A throwaway repo whose main branch holds scripts/ratchet-limits.json; each value is one commit.
function repoWithLimits(values) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-raises-'));
  dirs.push(cwd);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  fs.mkdirSync(path.join(cwd, 'scripts'));
  const commits = values.map((value, n) => {
    if (value === null) fs.writeFileSync(path.join(cwd, 'README.md'), `${n}\n`);
    else fs.writeFileSync(path.join(cwd, 'scripts', 'ratchet-limits.json'), `${JSON.stringify({ sizes: { 'a.ts': value } }, null, 2)}\n`);
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-m', `c${n}`);
    return git(cwd, 'rev-parse', 'HEAD');
  });
  return { cwd, commits };
}

describe('raisesSince', () => {
  it('reports a limit raised by a direct push to main', () => {
    const { cwd, commits } = repoWithLimits([10, 12]);
    const result = raisesSince(commits[0], { cwd });
    expect(result.status).toBe('raised');
    expect(result.raises).toEqual([{ path: 'sizes.a.ts', before: 10, after: 12, kind: 'raised' }]);
  });

  it('the real CLI exits 1 and names the path', () => {
    const { cwd, commits } = repoWithLimits([10, 12]);
    const run = spawnSync(process.execPath, [script, '--base', commits[0]], { cwd, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('sizes.a.ts: 10 -> 12');
  });

  it('the real CLI exits 0 when the value is lowered', () => {
    const { cwd, commits } = repoWithLimits([10, 8]);
    const run = spawnSync(process.execPath, [script, '--base', commits[0]], { cwd, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('no limit rose since');
  });

  it('passes a lowered value', () => {
    const { cwd, commits } = repoWithLimits([10, 8]);
    expect(raisesSince(commits[0], { cwd })).toEqual({ status: 'ok', raises: [] });
  });

  it('has nothing to compare when the base has no limits file', () => {
    const { cwd, commits } = repoWithLimits([null, 12]);
    expect(raisesSince(commits[0], { cwd })).toEqual({ status: 'no-base-file', raises: [] });
  });
});

const rc = (allow, rule = 'p/r') => ({ rules: { [rule]: ['error', { allow }] } });

describe('oxlintAllowSections', () => {
  it('returns one section per rule with an allow map', () => {
    const json = { rules: { 'p/r': ['error', { allow: { 'a.ts': 2 } }], 'x/y': ['error', { other: 1 }], z: 'error', w: ['warn'] } };
    expect(oxlintAllowSections(json)).toEqual({ 'oxlint:p/r': { 'a.ts': 2 } });
  });

  it('tolerates a missing rules key and an empty input', () => {
    expect(oxlintAllowSections({})).toEqual({});
    expect(oxlintAllowSections(undefined)).toEqual({});
  });
});

// A throwaway repo: commit 0 has base .oxlintrc.json (or none), the working tree has head.
function repoWithOxlint(base, head) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-oxlint-'));
  dirs.push(cwd);
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Test');
  git(cwd, 'config', 'user.email', 'test@example.com');
  fs.writeFileSync(path.join(cwd, 'README.md'), 'x\n');
  if (base) fs.writeFileSync(path.join(cwd, '.oxlintrc.json'), JSON.stringify(base));
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-m', 'c0');
  fs.mkdirSync(path.join(cwd, 'scripts'));
  fs.writeFileSync(path.join(cwd, 'scripts', 'ratchet-limits.json'), '{}\n');
  fs.writeFileSync(path.join(cwd, '.oxlintrc.json'), JSON.stringify(head));
  return { cwd, base: git(cwd, 'rev-parse', 'HEAD') };
}

describe('raisesSince with .oxlintrc.json allow maps', () => {
  it('flags a raised per-file count and names rule and file', () => {
    const { cwd, base } = repoWithOxlint(rc({ 'a.ts': 1 }), rc({ 'a.ts': 2 }));
    const r = raisesSince(base, { cwd });
    expect(r.status).toBe('raised');
    expect(r.raises).toEqual([{ path: 'oxlint:p/r.a.ts', before: 1, after: 2, kind: 'raised' }]);
  });

  it('flags a new file added to an existing allow map', () => {
    const { cwd, base } = repoWithOxlint(rc({ 'a.ts': 1 }), rc({ 'a.ts': 1, 'b.ts': 1 }));
    expect(raisesSince(base, { cwd }).raises.map((x) => x.path)).toEqual(['oxlint:p/r.b.ts']);
  });

  it('passes a whole new rule with an allow map', () => {
    const { cwd, base } = repoWithOxlint(rc({ 'a.ts': 1 }), { rules: { ...rc({ 'a.ts': 1 }).rules, 'n/new': ['error', { allow: { 'c.ts': 3 } }] } });
    expect(raisesSince(base, { cwd }).status).toBe('ok');
  });

  it('passes lowered and removed entries', () => {
    const { cwd, base } = repoWithOxlint(rc({ 'a.ts': 3, 'b.ts': 1 }), rc({ 'a.ts': 2 }));
    expect(raisesSince(base, { cwd }).status).toBe('ok');
  });

  it('a base with no .oxlintrc.json contributes nothing', () => {
    const { cwd, base } = repoWithOxlint(null, rc({ 'a.ts': 2 }));
    expect(raisesSince(base, { cwd })).toEqual({ status: 'no-base-file', raises: [] });
  });
});
