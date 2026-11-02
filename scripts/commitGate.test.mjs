import { describe, it, expect } from 'vitest';
import { decide, fingerprintOf } from './commitGate.mjs';

const base = { head: 'abc', diff: 'd1', untracked: [{ path: 'a.txt', content: 'x' }] };

describe('fingerprintOf', () => {
  it('is equal for equal inputs', () => {
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base }));
  });
  it('changes with the diff, the head and an untracked file', () => {
    const f = fingerprintOf(base);
    expect(fingerprintOf({ ...base, diff: 'd2' })).not.toBe(f);
    expect(fingerprintOf({ ...base, head: 'def' })).not.toBe(f);
    expect(fingerprintOf({ ...base, untracked: [] })).not.toBe(f);
    expect(fingerprintOf({ ...base, untracked: [{ path: 'a.txt', content: 'y' }] })).not.toBe(f);
    expect(fingerprintOf({ ...base, untracked: [{ path: 'b.txt', content: 'x' }] })).not.toBe(f);
  });
});

describe('decide', () => {
  it('refuses a FAIL on the same tree', () => {
    const r = decide({ verdict: 'FAIL', failed: 'tsc', fingerprint: 'f' }, 'f');
    expect(r.refuse).toBe(true);
    expect(r.message).toBe('commit refused: check:fast failed at tsc on this exact tree. Fix it, or commit with --no-verify.');
  });
  it('allows a FAIL on a different tree', () => {
    expect(decide({ verdict: 'FAIL', failed: 'tsc', fingerprint: 'f' }, 'g').refuse).toBe(false);
  });
  it('allows a PASS on the same tree', () => {
    expect(decide({ verdict: 'PASS', failed: null, fingerprint: 'f' }, 'f').refuse).toBe(false);
  });
  it('allows with no record or no fingerprint', () => {
    expect(decide(null, 'f').refuse).toBe(false);
    expect(decide({ verdict: 'FAIL', failed: 'x', fingerprint: 'f' }, null).refuse).toBe(false);
  });
});
