import { describe, expect, it } from 'vitest';
import { englishCompressMessages as t } from '../messages';
import { compressHandoffItems, compressHandoffTools } from './handoffs.ts';

describe('Compress hand-offs (ARCH-41)', () => {
  it('sends a finished PDF on to Sign and Merge, never back to Compress', () => {
    expect(compressHandoffTools('pdf')).toEqual(['sign', 'merge']);
  });

  it('offers a photo, or nothing yet, no hand-off at all', () => {
    expect(compressHandoffTools('image')).toEqual([]);
    expect(compressHandoffTools(null)).toEqual([]);
  });

  it('labels the phone chips in the rail row order', () => {
    expect(compressHandoffItems('pdf', t).map(({ tool, label }) => [tool, label])).toEqual([
      ['sign', t.handoffSign],
      ['merge', t.handoffMerge],
    ]);
  });
});
