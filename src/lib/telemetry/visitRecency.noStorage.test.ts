import { describe, expect, it } from 'vitest';
import { readAndStampVisits } from './visitRecency.ts';

// Node has no localStorage: reading it throws, as in a browser with storage blocked.
describe('readAndStampVisits without storage', () => {
  it('is undefined when storage throws', () => {
    expect(() => localStorage).toThrow();
    expect(readAndStampVisits()).toBeUndefined();
  });
  it('is undefined without storage', () => {
    expect(() => localStorage).toThrow();
    expect(readAndStampVisits(new Date(2026, 10, 12, 12))).toBeUndefined();
  });
});
