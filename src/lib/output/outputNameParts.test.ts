import { describe, expect, it } from 'vitest';
import { outputNameParts } from './outputNameParts.ts';

describe('outputNameParts', () => {
  it('prefixes the source name', () => {
    expect(outputNameParts('Lease.pdf', { prefix: 'signed_' })).toEqual({ prefix: 'signed_', base: 'Lease', fileName: 'signed_Lease.pdf' });
  });
  it('a typed name replaces the base, the prefix stays', () => {
    expect(outputNameParts('Lease.pdf', { prefix: 'signed_', custom: 'Lease final' }).fileName).toBe('signed_Lease final.pdf');
  });
  it('does not chain a prefix when asked, and keeps the first as written', () => {
    const parts = outputNameParts('Redacted_redacted_x.pdf', { prefix: 'redacted_', dedupePrefix: true });
    expect(parts).toEqual({ prefix: 'Redacted_', base: 'x', fileName: 'Redacted_x.pdf' });
  });
  it('chains by default', () => {
    expect(outputNameParts('signed_x.pdf', { prefix: 'signed_' }).fileName).toBe('signed_signed_x.pdf');
  });
  it('a typed name beats the deduped source', () => {
    expect(outputNameParts('redacted_x.pdf', { prefix: 'redacted_', custom: 'y', dedupePrefix: true }).fileName).toBe('redacted_y.pdf');
  });
});
