import { describe, expect, it } from 'vitest';
import { englishShellMessages, hebrewShellMessages } from './shellMessages';

describe('shell messages', () => {
  it('declare their direction, which describeFile uses to isolate the file size', () => {
    expect(englishShellMessages.dir).toBe('ltr');
    expect(hebrewShellMessages.dir).toBe('rtl');
  });
});
