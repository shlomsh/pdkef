import { describe, expect, it } from 'vitest';
import { getToolMessages } from '../../site-lib/toolMessageRegistry';
import { englishShellMessages, hebrewShellMessages } from '#shell/shellMessages.ts';

// Key parity is enforced by each catalogue's TypeScript type; what a type cannot see is a Hebrew
// string that dropped a {placeholder} and any em dash (the house voice has none).
const TOOL_SLUGS = ['merge', 'compress', 'split', 'pdf-to-image', 'image-to-pdf', 'sign'];

const CATALOGUES: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
  ...TOOL_SLUGS.map((slug): [string, Record<string, unknown>, Record<string, unknown>] => [
    slug,
    getToolMessages(slug, 'en') as Record<string, unknown>,
    getToolMessages(slug, 'he') as Record<string, unknown>,
  ]),
  ['shell', englishShellMessages as unknown as Record<string, unknown>, hebrewShellMessages as unknown as Record<string, unknown>],
];

const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe.each(CATALOGUES)('%s message catalogue', (_name, english, hebrew) => {
  it('gives every Hebrew string the same {placeholders} as its English twin', () => {
    for (const [key, value] of Object.entries(hebrew)) {
      if (typeof value !== 'string') continue;
      const expected = tokens(String(english[key]));
      // Hebrew spells a singular ("...One") as a word, so it may drop {count}, never add a token.
      if (key.endsWith('One')) expect(expected, key).toEqual(expect.arrayContaining(tokens(value)));
      else expect(tokens(value), key).toEqual(expected);
    }
  });

  it('uses no em dashes in either language', () => {
    for (const catalogue of [english, hebrew]) {
      for (const [key, value] of Object.entries(catalogue)) {
        if (typeof value === 'string') expect(value, key).not.toContain('\u2014');
      }
    }
  });
});
