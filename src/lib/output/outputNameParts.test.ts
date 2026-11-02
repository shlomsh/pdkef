import { describe, expect, it } from 'vitest';
import { outputNameParts } from './outputNameParts.ts';

describe('outputNameParts', () => {
  it('the default is the prefix plus the source name', () => {
    expect(outputNameParts('Lease.pdf', { prefix: 'signed_' })).toEqual({ name: 'signed_Lease', fileName: 'signed_Lease.pdf' });
  });
  it('a typed name replaces all of it, the prefix too', () => {
    expect(outputNameParts('Lease.pdf', { prefix: 'signed_', custom: 'Lease final' }).fileName).toBe('Lease final.pdf');
  });
  it('does not chain a prefix when asked, and keeps the first as written', () => {
    expect(outputNameParts('Redacted_redacted_x.pdf', { prefix: 'redacted_', dedupePrefix: true })).toEqual({ name: 'Redacted_x', fileName: 'Redacted_x.pdf' });
  });
  it('chains by default', () => {
    expect(outputNameParts('signed_x.pdf', { prefix: 'signed_' }).fileName).toBe('signed_signed_x.pdf');
  });
  it('a typed name is kept as typed, even one that starts with the prefix', () => {
    expect(outputNameParts('x.pdf', { prefix: 'redacted_', custom: 'redacted_y', dedupePrefix: true }).fileName).toBe('redacted_y.pdf');
  });
});
