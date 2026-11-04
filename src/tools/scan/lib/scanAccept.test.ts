import { describe, expect, it } from 'vitest';
import { SCAN_ACCEPT, SCAN_ACCEPTED_TYPES } from './scanAccept.ts';

describe('scanAccept', () => {
  it('takes photos and a PDF', () => {
    expect(SCAN_ACCEPTED_TYPES).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'application/pdf']));
    expect(SCAN_ACCEPT.split(',')).toEqual(SCAN_ACCEPTED_TYPES);
  });
});
