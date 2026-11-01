import { describe, expect, it } from 'vitest';
import { directionAtPoint, readerTextDirection, resolveHighlightDirection } from './resolveDirection.ts';

const text = (t: string, textDirection?: 'ltr' | 'rtl') => ({ type: 'text', text: t, textDirection });
const resolve = (o: Partial<Parameters<typeof resolveHighlightDirection>[0]>) =>
  resolveHighlightDirection({ page: undefined, pages: [], elements: [], readerDirection: 'ltr', ...o });

describe('resolveHighlightDirection', () => {
  it('prefers the detected page direction over everything', () => {
    expect(resolve({ page: 'rtl', elements: [text('hello')], readerDirection: 'ltr' })).toBe('rtl');
    expect(resolve({ page: 'ltr', pages: ['rtl', 'rtl'], elements: [text('שלום')] })).toBe('ltr');
  });
  it('prefers the direction at the press over the page direction', () => {
    expect(resolve({ atPress: 'ltr', page: 'rtl' })).toBe('ltr');
    expect(resolve({ atPress: 'rtl', page: 'ltr' })).toBe('rtl');
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

describe('directionAtPoint', () => {
  const run = (str: string, left: number, top = 10, width = 20, height = 2) => ({ str, left, top, width, height });
  it('reads the run under the press, whatever the page direction', () => {
    expect(directionAtPoint([run('שלום עולם', 10)], { x: 15, y: 11 })).toBe('rtl');
    expect(directionAtPoint([run('hello world', 10)], { x: 15, y: 11 })).toBe('ltr');
  });
  it('a press between two runs on the row picks the nearer', () => {
    const runs = [run('שלום', 0, 10, 20), run('hello', 60, 10, 20)];
    expect(directionAtPoint(runs, { x: 30, y: 11 })).toBe('rtl');
    expect(directionAtPoint(runs, { x: 50, y: 11 })).toBe('ltr');
  });
  it('is undefined with no run on the row or no letters in the runs', () => {
    expect(directionAtPoint([run('hello', 10)], { x: 15, y: 50 })).toBeUndefined();
    expect(directionAtPoint([run('2024 / 10', 10)], { x: 15, y: 11 })).toBeUndefined();
    expect(directionAtPoint([], { x: 15, y: 11 })).toBeUndefined();
  });
  it('skips a nearer run without letters for the next one', () => {
    expect(directionAtPoint([run('123', 10), run('hello', 40)], { x: 15, y: 11 })).toBe('ltr');
  });
});
