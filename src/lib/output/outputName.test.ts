import { describe, expect, it } from 'vitest';
import { outputBase, outputName, stripExtension, withAffixes } from './outputName.ts';

describe('stripExtension', () => {
  it.each([
    ['pdf', 'a.PDF', 'a'], ['pdf', 'a.png', 'a.png'], ['pdf', 'a.pdf.pdf', 'a.pdf'],
    ['extension', 'a.b.png', 'a.b'], ['extension', 'a.', 'a.'], ['extension', '.hidden', ''],
    ['extension-or-bare-dot', 'a.', 'a'], ['extension-or-bare-dot', 'notes', 'notes'],
    ['extension-keep-dotfile', '.hidden', '.hidden'], ['extension-keep-dotfile', 'a.b.c', 'a.b'],
  ] as const)('%s: %s -> %s', (mode, name, expected) => {
    expect(stripExtension(name, mode)).toBe(expected);
  });
});

describe('outputBase / withAffixes / outputName', () => {
  it('falls back only when nothing is left, after sanitising', () => {
    expect(outputBase('.pdf', { fallback: 'split' })).toBe('split');
    expect(outputBase('+.pdf', { sanitize: true, fallback: 'merged' })).toBe('merged');
  });

  it('builds prefix, base, suffix and extension, with no extension when ext is null', () => {
    expect(withAffixes('x', { prefix: 'p_', suffix: '_s' })).toBe('p_x_s.pdf');
    expect(withAffixes('x', { ext: null })).toBe('x');
    expect(outputName('x.PDF', { suffix: '-compressed', ext: 'png' })).toBe('x-compressed.png');
  });

  it('collapses a repeated prefix into the first one, as written', () => {
    const dedupe = (n: string) => withAffixes(n, { prefix: 'redacted_', ext: null, dedupePrefix: true });
    expect(dedupe('x.pdf')).toBe('redacted_x.pdf');
    expect(dedupe('Redacted_redacted_x.pdf')).toBe('Redacted_x.pdf');
  });
});
