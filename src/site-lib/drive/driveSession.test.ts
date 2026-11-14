import { describe, expect, it } from 'vitest';
import { forgetToken, readSavedToken, saveToken } from './driveSession.ts';

function memory(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const throwing = {
  getItem: () => {
    throw new Error('x');
  },
  setItem: () => {
    throw new Error('x');
  },
  removeItem: () => {
    throw new Error('x');
  },
};

describe('driveSession', () => {
  it('round-trips a token', () => {
    const s = memory();
    saveToken(s, 'tok', 3600, 1000);
    expect(readSavedToken(s, 1000)).toBe('tok');
  });
  it('is null with under 60 seconds left', () => {
    const s = memory();
    saveToken(s, 'tok', 3600, 0);
    expect(readSavedToken(s, 3600_000 - 59_000)).toBeNull();
    expect(readSavedToken(s, 3600_000 - 61_000)).toBe('tok');
  });
  it('is null when missing or malformed', () => {
    const s = memory();
    expect(readSavedToken(s, 0)).toBeNull();
    s.setItem('pdkef-drive-token', '{nope');
    expect(readSavedToken(s, 0)).toBeNull();
    s.setItem('pdkef-drive-token', JSON.stringify({ token: 1, until: 'x' }));
    expect(readSavedToken(s, 0)).toBeNull();
  });
  it('gives a token only to the account it was saved for, when an account is asked for', () => {
    const s = memory();
    saveToken(s, 'tok', 3600, 0, 'a');
    expect(readSavedToken(s, 0, 'a')).toBe('tok');
    expect(readSavedToken(s, 0, 'b')).toBeNull();
    expect(readSavedToken(s, 0)).toBe('tok');
  });
  it('does not give a token saved without an account to a named account', () => {
    const s = memory();
    saveToken(s, 'tok', 3600, 0);
    expect(readSavedToken(s, 0, 'a')).toBeNull();
    expect(readSavedToken(s, 0)).toBe('tok');
  });
  it('forgets', () => {
    const s = memory();
    saveToken(s, 'tok', 3600, 0);
    forgetToken(s);
    expect(readSavedToken(s, 0)).toBeNull();
  });
  it('survives throwing storage', () => {
    expect(readSavedToken(throwing, 0)).toBeNull();
    expect(() => saveToken(throwing, 't', 1, 0)).not.toThrow();
    expect(() => forgetToken(throwing)).not.toThrow();
  });
});
