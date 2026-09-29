import { describe, expect, it } from 'vitest';
import { deletedTerms } from './deletedTerms.ts';

describe('deletedTerms', () => {
  it('turns each deleted text run into a term to look for', () => {
    const terms = deletedTerms([
      { type: 'delete', kind: 'text', preview: 'Green Valley Ltd' },
      { type: 'delete', kind: 'text', preview: 'Made with  TrialScan Free' },
    ]);
    expect(terms.map((term) => [term.label, term.source])).toEqual([
      ['Green Valley Ltd', 'deleted'],
      ['Made with TrialScan Free', 'deleted'],
    ]);
    expect(terms[0].finder('Employer: Green Valley Ltd')).toHaveLength(1);
  });

  it('skips images, boxes, short runs and repeats', () => {
    expect(deletedTerms([
      { type: 'delete', kind: 'image', preview: 'Logo image' },
      { type: 'blackout', preview: 'Secret words' },
      { type: 'delete', kind: 'text', preview: '8' },
      { type: 'delete', kind: 'text', preview: 'Haifa' },
      { type: 'delete', kind: 'text', preview: 'Haifa' },
    ]).map((term) => term.label)).toEqual(['Haifa']);
  });
});
