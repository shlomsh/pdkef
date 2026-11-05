import { describe, expect, it } from 'vitest';
import { DRIVE_TOKEN_KEY, hasDriveConnection } from './driveSaveLink.ts';

const store = (value: string | null) => ({ getItem: (key: string) => (key === DRIVE_TOKEN_KEY ? value : null) });

describe('hasDriveConnection', () => {
  it('is true for a stored token, expired or not', () => {
    expect(hasDriveConnection(store(JSON.stringify({ token: 't', until: Date.now() + 3_600_000 })))).toBe(true);
    expect(hasDriveConnection(store(JSON.stringify({ token: 't', until: 1 })))).toBe(true);
  });
  it('is false when missing or malformed', () => {
    expect(hasDriveConnection(store(null))).toBe(false);
    expect(hasDriveConnection(store('nope'))).toBe(false);
    expect(hasDriveConnection(store('null'))).toBe(false);
    expect(hasDriveConnection(store(JSON.stringify({ token: 5 })))).toBe(false);
  });
  it('never throws', () => {
    expect(hasDriveConnection({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});
