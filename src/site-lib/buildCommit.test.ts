import { describe, expect, it } from 'vitest';
import { buildServerTiming, commitFromEnv } from './buildCommit.ts';

const SHA = 'f27c2b71' + 'a'.repeat(32);

describe('commitFromEnv', () => {
  it('is the first 7 characters of a valid sha', () => {
    expect(commitFromEnv({ VERCEL_GIT_COMMIT_SHA: SHA })).toBe('f27c2b7');
    expect(commitFromEnv({ VERCEL_GIT_COMMIT_SHA: 'abc1234' })).toBe('abc1234');
  });
  it('is empty for anything else', () => {
    for (const bad of ['', 'abc123', 'ABC1234', 'zzzzzzz', SHA + 'a', undefined]) {
      expect(commitFromEnv({ VERCEL_GIT_COMMIT_SHA: bad })).toBe('');
    }
    expect(commitFromEnv({})).toBe('');
    expect(commitFromEnv(undefined)).toBe('');
  });
});

describe('buildServerTiming', () => {
  it('names the commit as a build metric', () => {
    expect(buildServerTiming('abc1234')).toBe('build;desc="abc1234"');
  });
  it('is null without a commit', () => {
    expect(buildServerTiming('')).toBeNull();
  });
});
