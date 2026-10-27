import { describe, expect, it } from 'vitest';
import { pickLastTwo } from './lastDeploys.mjs';

const d = (id, sha) => ({ id, sha });

describe('pickLastTwo', () => {
  it('returns the two newest successful, distinct deploys', () => {
    const list = [d(3, 'c'), d(2, 'b'), d(1, 'a')];
    expect(pickLastTwo(list, { 3: 'success', 2: 'success', 1: 'success' })).toEqual({ before: 'b', after: 'c' });
  });

  it('skips failed and pending deploys', () => {
    const list = [d(4, 'd'), d(3, 'c'), d(2, 'b'), d(1, 'a')];
    expect(pickLastTwo(list, { 4: 'in_progress', 3: 'failure', 2: 'success', 1: 'success' })).toEqual({ before: 'a', after: 'b' });
  });

  it('dedupes a repeated sha (a redeploy)', () => {
    const list = [d(3, 'b'), d(2, 'b'), d(1, 'a')];
    expect(pickLastTwo(list, { 3: 'success', 2: 'success', 1: 'success' })).toEqual({ before: 'a', after: 'b' });
  });

  it('returns null with only one success', () => {
    const list = [d(2, 'b'), d(1, 'a')];
    expect(pickLastTwo(list, { 2: 'failure', 1: 'success' })).toBeNull();
  });
});
