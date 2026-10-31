import { describe, expect, it } from 'vitest';
import { resolveHighlightDirection } from './resolveDirection.ts';

const text = (t: string, textDirection?: 'ltr' | 'rtl') => ({ type: 'text', text: t, textDirection });

describe('resolveHighlightDirection', () => {
  it('prefers the detected page direction', () => {
    expect(resolveHighlightDirection('rtl', [text('hello')])).toBe('rtl');
    expect(resolveHighlightDirection('ltr', [text('שלום')])).toBe('ltr');
  });
  it('falls back to the most recent non-empty text element', () => {
    expect(resolveHighlightDirection(undefined, [text('hello'), text('שלום'), text('')])).toBe('rtl');
    expect(resolveHighlightDirection(undefined, [text('שלום'), { type: 'highlight' }, text('abc')])).toBe('ltr');
  });
  it('defaults to ltr', () => {
    expect(resolveHighlightDirection(undefined, [])).toBe('ltr');
    expect(resolveHighlightDirection(undefined, [{ type: 'line' }])).toBe('ltr');
  });
});
