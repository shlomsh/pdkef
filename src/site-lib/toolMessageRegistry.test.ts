import { describe, expect, it } from 'vitest';
import { getToolMessages } from './toolMessageRegistry';
import { englishMergeMessages, hebrewMergeMessages } from '../tools/merge/messages';
import { englishCompressMessages, hebrewCompressMessages } from '../tools/compress/messages';
import { englishSplitMessages, hebrewSplitMessages } from '../tools/split/messages';
import { englishToImageMessages, hebrewToImageMessages } from '../tools/to-image/messages';
import { englishImageToPdfMessages, hebrewImageToPdfMessages } from '../tools/image-to-pdf/messages';
import { englishSignMessages, hebrewSignMessages } from '../tools/sign/messages';

// ARCH-35: the registry is the one place a tool slug resolves to that tool's own messages module.
describe('getToolMessages', () => {
  it.each([
    ['merge', englishMergeMessages, hebrewMergeMessages],
    ['compress', englishCompressMessages, hebrewCompressMessages],
    ['split', englishSplitMessages, hebrewSplitMessages],
    ['pdf-to-image', englishToImageMessages, hebrewToImageMessages],
    ['image-to-pdf', englishImageToPdfMessages, hebrewImageToPdfMessages],
    ['sign', englishSignMessages, hebrewSignMessages],
  ])('serves %s in English and Hebrew', (slug, english, hebrew) => {
    expect(getToolMessages(slug, 'en')).toBe(english);
    expect(getToolMessages(slug, 'he')).toBe(hebrew);
  });

  it('has no catalogue for a locale a tool has not been translated into, so a published page fails the build', () => {
    expect(getToolMessages('merge', 'hi')).toBeUndefined();
  });

  it('has nothing for a tool without a localized island', () => {
    expect(getToolMessages('redact', 'en')).toBeUndefined();
  });
});
