import { describe, expect, it } from 'vitest';
import { describeFile, formatFileSize } from './format.js';

describe('formatFileSize', () => {
  it('formats bytes under 1KB as B', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB and MB with one decimal under 10 units', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('drops the decimal at 10 units and above', () => {
    expect(formatFileSize(1024 * 15)).toBe('15 KB');
  });
});

describe('describeFile', () => {
  const file = { size: 1024 * 500 };

  it('returns undefined without a file', () => {
    expect(describeFile(null, 3)).toBeUndefined();
  });

  it('shows the static page count without a current page', () => {
    expect(describeFile(file, 3)).toBe('3 pages · 500 KB');
  });

  it('singularizes a one-page count', () => {
    expect(describeFile(file, 1)).toBe('1 page · 500 KB');
  });

  it('shows "Page X of N" when a current page is given for a multi-page file', () => {
    expect(describeFile(file, 3, 2)).toBe('Page 2 of 3 · 500 KB');
  });

  it('ignores a current page on a single-page file', () => {
    expect(describeFile(file, 1, 1)).toBe('1 page · 500 KB');
  });

  it('falls back to the static count when pageCount is missing', () => {
    expect(describeFile(file, 0, 2)).toBe('500 KB');
  });
});
