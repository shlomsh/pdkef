import { describe, expect, it } from 'vitest';
import { englishCompressMessages as t } from './messages';

const IMAGE_PATH_CARD_KEY = /^(slightGain|images[A-Z]|alreadySmallTitle|lockedTitle|unsupportedTitle$)/;

describe('compress messages', () => {
  it('no image-path result card string mentions links or drawings', () => {
    const cardStrings = Object.entries(t).filter(([key, value]) => IMAGE_PATH_CARD_KEY.test(key) && typeof value === 'string');
    expect(cardStrings.length).toBeGreaterThanOrEqual(12);
    for (const [key, text] of cardStrings) expect({ key, text }).toEqual({ key, text: expect.not.stringMatching(/links|drawings/) });
  });
});
