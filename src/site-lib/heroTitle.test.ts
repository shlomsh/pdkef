import { describe, expect, it } from 'vitest';
import { splitHeroTitle } from './heroTitle';

describe('splitHeroTitle', () => {
  it('splits a title that starts with the name and a space', () => {
    expect(splitHeroTitle('Merge PDF Online Free: Combine Files', 'Merge PDF')).toEqual({
      name: 'Merge PDF',
      rest: 'Online Free: Combine Files',
    });
  });

  it('returns null when there is no name', () => {
    expect(splitHeroTitle('Merge PDF Online Free')).toBeNull();
    expect(splitHeroTitle('Merge PDF Online Free', '')).toBeNull();
  });

  it('returns null when the name is not a prefix of the title', () => {
    expect(splitHeroTitle('Merge PDF Online Free', 'Split PDF')).toBeNull();
    expect(splitHeroTitle('Merge PDFs Online', 'Merge PDF')).toBeNull();
  });

  it('returns null when nothing follows the name', () => {
    expect(splitHeroTitle('Merge PDF', 'Merge PDF')).toBeNull();
    expect(splitHeroTitle('Merge PDF ', 'Merge PDF')).toBeNull();
  });
});
