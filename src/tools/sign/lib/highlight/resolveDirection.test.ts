import { describe, expect, it } from 'vitest';
import { readerTextDirection, resolveHighlightDirection } from './resolveDirection.ts';

const text = (t: string, textDirection?: 'ltr' | 'rtl') => ({ type: 'text', text: t, textDirection });
const resolve = (o: Partial<Parameters<typeof resolveHighlightDirection>[0]>) =>
  resolveHighlightDirection({ page: undefined, pages: [], elements: [], readerDirection: 'ltr', ...o });

describe('resolveHighlightDirection', () => {
  it('prefers the detected page direction over everything', () => {
    expect(resolve({ page: 'rtl', elements: [text('hello')], readerDirection: 'ltr' })).toBe('rtl');
    expect(resolve({ page: 'ltr', pages: ['rtl', 'rtl'], elements: [text('שלום')] })).toBe('ltr');
  });
  it('a scanned page reads in the direction most pages with text have', () => {
    expect(resolve({ page: undefined, pages: [undefined, 'rtl', 'rtl', 'ltr'] })).toBe('rtl');
    expect(resolve({ page: undefined, pages: ['ltr', undefined], readerDirection: 'rtl' })).toBe('ltr');
  });
  it('falls back to the most recent non-empty text element', () => {
    expect(resolve({ elements: [text('hello'), text('שלום'), text('')] })).toBe('rtl');
    expect(resolve({ elements: [text('שלום'), { type: 'highlight' }, text('abc')], readerDirection: 'rtl' })).toBe('ltr');
  });
  it('then the reader language', () => {
    expect(resolve({ readerDirection: 'rtl' })).toBe('rtl');
    expect(resolve({ readerDirection: 'ltr' })).toBe('ltr');
    expect(resolve({ pages: [undefined] })).toBe('ltr');
  });
});

describe('readerTextDirection', () => {
  it('reads an rtl document, else the first language', () => {
    expect(readerTextDirection({ documentDir: 'rtl', languages: ['en-US'] })).toBe('rtl');
    expect(readerTextDirection({ documentDir: '', languages: ['he-IL', 'en-US'] })).toBe('rtl');
    expect(readerTextDirection({ documentDir: '', languages: ['en-US', 'he-IL'] })).toBe('ltr');
    expect(readerTextDirection({ documentDir: '', languages: ['ku-Arab'] })).toBe('rtl');
    expect(readerTextDirection({ documentDir: '', languages: ['ku-Latn'] })).toBe('ltr');
    expect(readerTextDirection({ documentDir: '', languages: ['ar'] })).toBe('rtl');
    expect(readerTextDirection({ documentDir: '', languages: [] })).toBe('ltr');
  });
});
