import { describe, expect, it } from 'vitest';
import { deployArgs, parseArgs, validateTree } from './deploy-prod.mjs';

const SHA = 'f27c2b71' + 'a'.repeat(32);

describe('deployArgs', () => {
  it('is the forced production deploy with the commit as a build env', () => {
    expect(deployArgs({ sha: SHA, extra: [] })).toEqual([
      'deploy', '--prod', '--force', '--build-env', `VERCEL_GIT_COMMIT_SHA=${SHA}`,
    ]);
  });
  it('passes extra arguments through after its own', () => {
    expect(deployArgs({ sha: SHA, extra: ['--with-cache'] }).slice(-1)).toEqual(['--with-cache']);
  });
  it('refuses a value that is not a commit', () => {
    expect(() => deployArgs({ sha: 'HEAD', extra: [] })).toThrow(/commit/);
    expect(() => deployArgs({ sha: '', extra: [] })).toThrow(/commit/);
    expect(() => deployArgs({ sha: 'f27c2b7; rm -rf /', extra: [] })).toThrow(/commit/);
  });
});

describe('parseArgs', () => {
  it('splits --dry-run from what is passed to vercel', () => {
    expect(parseArgs(['--dry-run', '--with-cache'])).toEqual({ dryRun: true, extra: ['--with-cache'] });
    expect(parseArgs([])).toEqual({ dryRun: false, extra: [] });
  });
});

describe('validateTree', () => {
  it('refuses a dirty tree: a stamp must name the commit the build was made from', () => {
    expect(validateTree({ dirty: true, head: SHA, originMain: SHA }).error).toMatch(/uncommitted/);
  });
  it('is fine on a clean tree at the tip of origin/main', () => {
    expect(validateTree({ dirty: false, head: SHA, originMain: SHA })).toEqual({ error: null, note: null });
  });
  it('allows a clean tree that is not the tip, and says so', () => {
    const r = validateTree({ dirty: false, head: SHA, originMain: 'b'.repeat(40) });
    expect(r.error).toBeNull();
    expect(r.note).toMatch(/not the tip of origin\/main/);
  });
  it('says so when origin/main cannot be read, without refusing', () => {
    const r = validateTree({ dirty: false, head: SHA, originMain: null });
    expect(r.error).toBeNull();
    expect(r.note).toMatch(/origin\/main/);
  });
});
