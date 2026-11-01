import { describe, expect, it } from 'vitest';
import { englishSignMessages, hebrewSignMessages } from '#editor/registry/signMessages.ts';
import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { PRESET_COLORS, presetColorNames } from './colorNames.ts';
import { highlightColorNames } from './highlight/highlightColorNames.ts';

describe('presetColorNames', () => {
  it('names every Sign preset, keyed by its hex', () => {
    const names = presetColorNames(englishSignMessages);
    expect(Object.keys(names)).toEqual([...PRESET_COLORS]);
    expect(Object.values(names)).toEqual(['Black', 'Red', 'Blue', 'Green', 'Navy', 'White']);
  });
  it('speaks the given language', () => {
    expect(presetColorNames(hebrewSignMessages)['#000000']).toBe('שחור');
  });
});

describe('highlightColorNames', () => {
  it('names the six highlight colors, keyed by their hex', () => {
    const names = highlightColorNames(englishSignMessages);
    expect(Object.keys(names)).toEqual(HIGHLIGHT_COLORS.map((c) => c.hex));
    expect(Object.values(names)).toEqual(['Yellow', 'Orange', 'Pink', 'Red', 'Green', 'Blue']);
  });
});
