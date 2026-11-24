import { describe, expect, it } from 'vitest';
import { englishShellMessages, hebrewShellMessages } from '../shellMessages.ts';
import { downloadDetail, pagesLabel, skippedLabel } from './pageCounts.ts';

const skipped = { skippedCountOne: '1 page skipped', skippedCountOther: '{count} pages skipped' };

describe('pagesLabel and skippedLabel', () => {
  it('say one page and several in the catalogue words', () => {
    expect(pagesLabel(1, englishShellMessages)).toBe('1 page');
    expect(pagesLabel(4, englishShellMessages)).toBe('4 pages');
    expect(skippedLabel(1, skipped)).toBe('1 page skipped');
    expect(skippedLabel(3, skipped)).toBe('3 pages skipped');
  });
});

describe('downloadDetail', () => {
  it('wraps the size in LRI and PDI on a right-to-left page', () => {
    const detail = downloadDetail({ status: 'ready', pageCount: 4, size: 2048 }, 4, hebrewShellMessages, 'rtl');
    expect(detail).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);
  });

  it('adds no isolates on a left-to-right page', () => {
    const detail = downloadDetail({ status: 'ready', pageCount: 4, size: 2048 }, 4, englishShellMessages, 'ltr');
    expect(detail).toMatch(/\d (B|KB)/);
    expect(detail).not.toContain('⁦');
    expect(detail).not.toContain('⁩');
  });

  it('counts the output pages with no size while the file is still being built', () => {
    expect(downloadDetail({ status: 'pending' }, 3, englishShellMessages, 'ltr')).toBe('3 pages');
  });
});
