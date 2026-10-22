import { describe, expect, it } from 'vitest';
import { deletedTerms, foldLabel, uniqueTerms } from './deletedTerms.ts';
import type { CheckTerm } from './types.ts';

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

  it('looks for the text of a deleted Sign mark too (RED-55)', () => {
    expect(deletedTerms([
      { type: 'delete', kind: 'mark', preview: 'Dana Levi' },
      { type: 'delete', kind: 'mark' },
    ]).map((term) => term.label)).toEqual(['Dana Levi']);
  });
});

describe('foldLabel and uniqueTerms', () => {
  it('gives one term for case and spacing variants', () => {
    expect(deletedTerms([
      { type: 'delete', kind: 'text', preview: 'Hello rating' },
      { type: 'delete', kind: 'text', preview: 'hello  Rating' },
    ])).toHaveLength(1);
  });

  it('keeps the first of a deleted word that is also covered', () => {
    const t = (label: string, source: 'covered' | 'deleted') => ({ label, source, finder: () => [] }) as CheckTerm;
    const out = uniqueTerms([t('Haifa', 'covered'), t('haifa ', 'deleted'), t('Other', 'deleted')]);
    expect(out.map((term) => [term.label, term.source])).toEqual([['Haifa', 'covered'], ['Other', 'deleted']]);
    expect(foldLabel('  A   B ')).toBe('a b');
  });
});
