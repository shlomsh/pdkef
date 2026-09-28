import { describe, expect, it } from 'vitest';
import { pictureOnlyNotice } from './pictureOnlyNotice.ts';

describe('pictureOnlyNotice', () => {
  it('returns null for an empty list', () => {
    expect(pictureOnlyNotice([])).toBeNull();
  });

  it('names one page, one-based', () => {
    expect(pictureOnlyNotice([2])).toBe(
      "Page 3 was saved as a picture only, so its text can't be selected.",
    );
  });

  it('joins two pages with "and"', () => {
    expect(pictureOnlyNotice([1, 4])).toBe(
      "Pages 2 and 5 were saved as pictures only, so their text can't be selected.",
    );
  });

  it('joins three or more pages with commas and a final "and"', () => {
    expect(pictureOnlyNotice([1, 4, 6])).toBe(
      "Pages 2, 5 and 7 were saved as pictures only, so their text can't be selected.",
    );
  });

  it('handles four pages the same way', () => {
    expect(pictureOnlyNotice([0, 1, 2, 3])).toBe(
      "Pages 1, 2, 3 and 4 were saved as pictures only, so their text can't be selected.",
    );
  });
});
