import { describe, expect, it } from 'vitest';
import { defaultScanName } from './scanName.ts';

describe('defaultScanName', () => {
  it('writes the day without a leading zero, the short English month and the year', () => {
    expect(defaultScanName(new Date(2026, 10, 3))).toBe('Scan 3 Nov 2026');
    expect(defaultScanName(new Date(2027, 0, 21))).toBe('Scan 21 Jan 2027');
    expect(defaultScanName(new Date(2026, 11, 31))).toBe('Scan 31 Dec 2026');
  });
});
