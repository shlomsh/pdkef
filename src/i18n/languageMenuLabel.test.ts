import { describe, expect, it } from 'vitest';
import { languageMenuLabel } from './languageMenuLabel';

describe('languageMenuLabel', () => {
  it('starts with the visible language name so voice control can match it', () => {
    expect(languageMenuLabel('English', 'Language')).toBe('English, Language');
  });

  it('keeps a native name in its own script', () => {
    expect(languageMenuLabel('עברית', 'Language')).toBe('עברית, Language');
  });
});
