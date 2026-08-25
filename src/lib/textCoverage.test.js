/**
 * The shared coverage policy: which characters a document cannot draw, and the
 * two sentences the app says about fonts.
 *
 * Exercised against the real bundled TTFs rather than a stub font, because the
 * whole question this module answers is "does this specific file have a glyph
 * for this specific character" - a fake font would make every assertion here
 * true by construction.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { resolveFontSubstitution } from './fonts.js';
import {
  describeFontSubstitution,
  describeUnrepresentableText,
  findUnrepresentableCharacters,
} from './textCoverage.js';

const FONT_DIR = join(process.cwd(), 'public', 'fonts');
const cache = new Map();

// Mirrors what liveFontCoverage's loader hands the policy: a fontkit instance
// wrapped so it looks like a pdf-lib font's `.embedder.font`.
async function loadFont(family) {
  const file = `${family.replace(/\s+/g, '')}-Regular.ttf`;
  if (!cache.has(file)) cache.set(file, fontkit.create(readFileSync(join(FONT_DIR, file))));
  return { embedder: { font: cache.get(file) } };
}

const text = (over) => ({ type: 'text', id: 'a', pageIndex: 0, fontFamily: 'Arimo', text: '', ...over });

describe('findUnrepresentableCharacters', () => {
  it('stays quiet on text every bundled font can draw', async () => {
    const found = await findUnrepresentableCharacters([text({ text: 'Shlomi Shemesh 1975' })], loadFont);
    expect(found).toEqual({ characters: [], pageNumbers: [] });
  });

  // The point of running the policy through resolveFontFamily: by the time
  // this check happens the script substitution has already rescued the text,
  // so it must NOT be reported. Before the substitution table existed, every
  // one of these was a refused download.
  it.each([
    ['Devanagari in the default font', 'नमस्ते भारत'],
    ['Thai in the default font', 'สวัสดี'],
    ['Hebrew in a Latin-only handwriting font', 'שלום'],
    ['Ukrainian in a Hebrew-only font', 'Привіт'],
    ['Arabic in a Latin-only handwriting font', 'مرحبا'],
  ])('does not flag %s, because a substitution already rescued it', async (_label, value) => {
    const found = await findUnrepresentableCharacters([text({ text: value, fontFamily: 'Caveat' })], loadFont);
    expect(found.characters).toEqual([]);
  });

  it('flags what no bundled font can draw, and says which page', async () => {
    const found = await findUnrepresentableCharacters([text({ text: '中文', pageIndex: 2 })], loadFont);
    expect(found.characters.length).toBeGreaterThan(0);
    expect(found.pageNumbers).toEqual([3]);
  });

  it('deduplicates across elements, in first-seen order, and collects every page', async () => {
    const found = await findUnrepresentableCharacters([
      text({ id: 'a', text: '中文', pageIndex: 0 }),
      text({ id: 'b', text: '中文', pageIndex: 4 }),
    ], loadFont);
    expect(new Set(found.characters).size).toBe(found.characters.length);
    expect(found.pageNumbers).toEqual([1, 5]);
  });

  it('ignores elements that are not text, or that are empty', async () => {
    const found = await findUnrepresentableCharacters([
      { type: 'signature', id: 's', pageIndex: 0 },
      text({ id: 'blank', text: '   ' }),
    ], loadFont);
    expect(found).toEqual({ characters: [], pageNumbers: [] });
  });

  // A comb renders slice(0, cellCount) and silently drops the rest, so judging
  // the whole string would refuse a document over a character that was never
  // going to reach the page.
  it('judges only the comb cells that actually render', async () => {
    const content = 'ab中文';
    const comb = text({ text: content, width: 40, combCells: 2 });
    const found = await findUnrepresentableCharacters([comb], loadFont);
    expect(found.characters).toEqual([]);

    // Non-vacuity: the same string outside a comb must still be flagged, or
    // this passes for the wrong reason (a mistyped comb field, say) while
    // proving nothing about the slicing.
    const asPlainText = await findUnrepresentableCharacters([text({ text: content })], loadFont);
    expect(asPlainText.characters.length).toBeGreaterThan(0);
  });

  it('skips an element whose font will not load rather than inventing a warning', async () => {
    const found = await findUnrepresentableCharacters([text({ text: '中文' })], async () => null);
    expect(found).toEqual({ characters: [], pageNumbers: [] });
  });
});

describe('describeFontSubstitution', () => {
  it('says nothing when the picked font was left alone', () => {
    expect(describeFontSubstitution(resolveFontSubstitution('Arimo', 'Hello'))).toBe('');
    expect(describeFontSubstitution(resolveFontSubstitution('Arimo', 'שלום'))).toBe('');
  });

  it('names the old font, the new font and the script, so the swap is explainable', () => {
    const message = describeFontSubstitution(resolveFontSubstitution('Arimo', 'नमस्ते'));
    expect(message).toContain('Arimo');
    expect(message).toContain('Kalam');
    expect(message).toContain('Devanagari');
  });

  // CLAUDE.md's voice rules: plain and warm, and no em dashes anywhere in copy.
  it('carries no em dash', () => {
    expect(describeFontSubstitution(resolveFontSubstitution('Caveat', 'สวัสดี'))).not.toContain('—');
  });
});

describe('describeUnrepresentableText', () => {
  it('names the characters, and the page to look on', () => {
    expect(describeUnrepresentableText(['م'], [2])).toContain('on page 2');
    expect(describeUnrepresentableText(['م'], [1, 3])).toContain('on pages 1 and 3');
    expect(describeUnrepresentableText(['م'], [1, 2, 3])).toContain('on pages 1, 2 and 3');
    expect(describeUnrepresentableText(['م'], [])).not.toContain('page');
  });

  it('is a heads-up while typing and a refusal when saving', () => {
    expect(describeUnrepresentableText(['م'], [1])).not.toContain('save again');
    expect(describeUnrepresentableText(['م'], [1], { saving: true })).toContain('save again');
  });

  it('carries no em dash', () => {
    expect(describeUnrepresentableText(['م'], [1])).not.toContain('—');
    expect(describeUnrepresentableText(['م'], [1], { saving: true })).not.toContain('—');
  });
});
