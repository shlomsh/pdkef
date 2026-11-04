import { describe, expect, it } from 'vitest';
import { describeFile, formatFileSize, isolateLtr, isolateName, kbToBytes } from './format.js';

describe('kbToBytes', () => {
  it('counts a KB as 1,000 bytes, so a limit holds however a portal counts', () => {
    expect(kbToBytes(500)).toBe(500_000);
  });

  it('never asks for less than one byte', () => {
    expect(kbToBytes(0)).toBe(1);
  });
});

describe('formatFileSize', () => {
  it('reads the way the phone share sheet does', () => {
    expect(formatFileSize(512_000)).toBe('512 KB');
  });

  it('formats bytes under 1KB as B', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB and MB with one decimal under 10 units', () => {
    expect(formatFileSize(1500)).toBe('1.5 KB');
    expect(formatFileSize(2_500_000)).toBe('2.5 MB');
  });

  it('drops the decimal at 10 units and above', () => {
    expect(formatFileSize(15_000)).toBe('15 KB');
  });
});

describe('describeFile', () => {
  const file = { size: 1024 * 500 };

  it('returns undefined without a file', () => {
    expect(describeFile(null, 3)).toBeUndefined();
  });

  it('shows the static page count without a current page', () => {
    expect(describeFile(file, 3)).toBe('3 pages · 512 KB');
  });

  it('singularizes a one-page count', () => {
    expect(describeFile(file, 1)).toBe('1 page · 512 KB');
  });

  it('shows "Page X of N" when a current page is given for a multi-page file', () => {
    expect(describeFile(file, 3, 2)).toBe('Page 2 of 3 · 512 KB');
  });

  // "500 KB" reads "KB 500" in a Hebrew line unless the size is one LTR run.
  it('isolates the size as one LTR run when the catalogue is RTL', () => {
    expect(describeFile(file, 3, undefined, { dir: 'rtl', pageCountOther: '{count} עמודים' })).toBe('3 עמודים · \u2066512 KB\u2069');
    expect(describeFile(file, undefined, undefined, { dir: 'rtl' })).toBe('\u2066512 KB\u2069');
  });

  it('leaves the size bare for an LTR catalogue', () => {
    expect(describeFile(file, 3, undefined, { dir: 'ltr' })).toBe('3 pages · 512 KB');
  });

  it('ignores a current page on a single-page file', () => {
    expect(describeFile(file, 1, 1)).toBe('1 page · 512 KB');
  });

  it('falls back to the static count when pageCount is missing', () => {
    expect(describeFile(file, 0, 2)).toBe('512 KB');
  });
});

describe('isolateLtr', () => {
  it('wraps the text in LRI/PDI when the direction is rtl', () => {
    expect(isolateLtr('1.0 MB', 'rtl')).toBe('\u20661.0 MB\u2069');
  });

  it('returns the text unchanged for ltr or an unknown direction', () => {
    expect(isolateLtr('1.0 MB', 'ltr')).toBe('1.0 MB');
    expect(isolateLtr('1.0 MB', undefined)).toBe('1.0 MB');
  });
});

describe('isolateName', () => {
  it('wraps a name in FSI ... PDI for an RTL catalogue, so the name keeps its own direction and its place', () => {
    expect(isolateName('2025-invoice.pdf', 'rtl')).toBe('\u20682025-invoice.pdf\u2069');
  });

  it('returns the name untouched for an LTR catalogue or none', () => {
    expect(isolateName('2025-invoice.pdf', 'ltr')).toBe('2025-invoice.pdf');
    expect(isolateName('2025-invoice.pdf')).toBe('2025-invoice.pdf');
  });
});
