import { describe, expect, it } from 'vitest';
import { regionName } from './regionName.js';

describe('regionName', () => {
  it('names the codes Vercel reports', () => {
    expect(regionName('KE', '31')).toBe('Nakuru');
    expect(regionName('IL', 'TA')).toBe('Tel Aviv');
    expect(regionName('AU', 'VIC')).toBe('Victoria');
  });
  it('is undefined for a code it does not know', () => {
    expect(regionName('TW', '04')).toBeUndefined();
    expect(regionName('ZZ', 'X')).toBeUndefined();
  });
});
