import { describe, expect, it } from 'vitest';
import { MAX_AGE_MS, createDraftRetention, getDraftExpiry, isDraftExpired } from './draftPolicy.js';

describe('workspace draft retention policy', () => {
  it('stamps only the saved timestamp', () => {
    expect(createDraftRetention(100)).toEqual({ savedAt: 100 });
  });

  it('derives expiry from the current retention policy', () => {
    expect(getDraftExpiry(100)).toBe(100 + MAX_AGE_MS);
  });

  it('expires drafts exactly at the derived expiry', () => {
    const savedAt = 100;
    expect(isDraftExpired(savedAt, savedAt + MAX_AGE_MS - 1)).toBe(false);
    expect(isDraftExpired(savedAt, savedAt + MAX_AGE_MS)).toBe(true);
  });

  it('treats an invalid timestamp as expired', () => {
    expect(isDraftExpired(undefined, 100)).toBe(true);
  });
});
