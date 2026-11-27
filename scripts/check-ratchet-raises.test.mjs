import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { raisesSince, oxlintAllowSections, main } from './check-ratchet-raises.mjs';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-ratchet-raises.mjs');
const dirs = [];

afterAll(() => {
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

const capture = () => {
  const out = [];
  const errs = [];
  return { out, errs, io: (cwd) => ({ cwd, log: (l) => out.push(String(l)), err: (l) => errs.push(String(l)) }) };
};

describe('raisesSince', () => {
  // The three histories are only read, so each is built once.
  let raised;
  let lowered;
  let noBase;
  let cli;

  beforeAll(() => {
    raised = repoWithLimits([10, 12]);
    lowered = repoWithLimits([10, 8]);
    noBase = repoWithLimits([null, 12]);
    cli = spawnSync(process.execPath, [script, '--base', raised.commits[0]], { cwd: raised.cwd, encoding: 'utf8' });
  });

  it('reports a limit raised by a direct push to main', () => {
    const result = raisesSince(raised.commits[0], { cwd: raised.cwd });
    expect(result.status).toBe('raised');
    expect(result.raises).toEqual([{ path: 'sizes.a.ts', before: 10, after: 12, kind: 'raised' }]);
  });

  it('the real CLI exits 1 and names the path', () => {
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('sizes.a.ts: 10 -> 12');
  });

  it('main returns 1 and names the path', () => {
    const c = capture();
    expect(main(['--base', raised.commits[0]], c.io(raised.cwd))).toBe(1);
    expect(c.errs.join('\n')).toContain('sizes.a.ts: 10 -> 12');
  });

  it('main returns 0 when the value is lowered', () => {
    const c = capture();
    expect(main(['--base', lowered.commits[0]], c.io(lowered.cwd))).toBe(0);
    expect(c.out.join('\n')).toContain('no limit rose since');
  });

  it('passes a lowered value', () => {
    expect(raisesSince(lowered.commits[0], { cwd: lowered.cwd })).toEqual({ status: 'ok', raises: [] });
  });

  it('has nothing to compare when the base has no limits file', () => {
    expect(raisesSince(noBase.commits[0], { cwd: noBase.cwd })).toEqual({ status: 'no-base-file', raises: [] });
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
  let rawRaised;
  let newFile;
  let newRule;
  let lowered;
  let noBase;

  beforeAll(() => {
    rawRaised = repoWithOxlint(rc({ 'a.ts': 1 }), rc({ 'a.ts': 2 }));
    newFile = repoWithOxlint(rc({ 'a.ts': 1 }), rc({ 'a.ts': 1, 'b.ts': 1 }));
    newRule = repoWithOxlint(rc({ 'a.ts': 1 }), { rules: { ...rc({ 'a.ts': 1 }).rules, 'n/new': ['error', { allow: { 'c.ts': 3 } }] } });
    lowered = repoWithOxlint(rc({ 'a.ts': 3, 'b.ts': 1 }), rc({ 'a.ts': 2 }));
    noBase = repoWithOxlint(null, rc({ 'a.ts': 2 }));
  });

  it('flags a raised per-file count and names rule and file', () => {
    const r = raisesSince(rawRaised.base, { cwd: rawRaised.cwd });
    expect(r.status).toBe('raised');
    expect(r.raises).toEqual([{ path: 'oxlint:p/r.a.ts', before: 1, after: 2, kind: 'raised' }]);
  });

  it('flags a new file added to an existing allow map', () => {
    expect(raisesSince(newFile.base, { cwd: newFile.cwd }).raises.map((x) => x.path)).toEqual(['oxlint:p/r.b.ts']);
  });

  it('passes a whole new rule with an allow map', () => {
    expect(raisesSince(newRule.base, { cwd: newRule.cwd }).status).toBe('ok');
  });

  it('passes lowered and removed entries', () => {
    expect(raisesSince(lowered.base, { cwd: lowered.cwd }).status).toBe('ok');
  });

  it('a base with no .oxlintrc.json contributes nothing', () => {
    expect(raisesSince(noBase.base, { cwd: noBase.cwd })).toEqual({ status: 'no-base-file', raises: [] });
  });
});
