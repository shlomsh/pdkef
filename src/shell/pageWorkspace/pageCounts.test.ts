import { describe, expect, it } from 'vitest';
import { englishMergeMessages, hebrewMergeMessages } from '../../i18n/toolMessages';
import { englishShellMessages as sm } from '../shellMessages';
import { downloadDetail, pagesLabel, skippedLabel } from './pageCounts.ts';

describe('skippedLabel', () => {
  it('reads as a whole phrase in English', () => {
    expect(skippedLabel(1, englishMergeMessages)).toBe('1 page skipped');
    expect(skippedLabel(3, englishMergeMessages)).toBe('3 pages skipped');
  });

  it('agrees in number in Hebrew', () => {
    expect(skippedLabel(1, hebrewMergeMessages)).toBe('עמוד אחד נסתר');
    expect(skippedLabel(3, hebrewMergeMessages)).toBe('3 עמודים נסתרים');
  });
});

describe('pagesLabel', () => {
  it('uses the singular for one page and the plural otherwise', () => {
    expect(pagesLabel(1, sm)).toBe('1 page');
    expect(pagesLabel(0, sm)).toBe('0 pages');
    expect(pagesLabel(12, sm)).toBe('12 pages');
  });
});

describe('downloadDetail', () => {
  it('counts the planned pages until the file is built', () => {
    expect(downloadDetail({ status: 'preparing' }, 3, sm, 'ltr')).toBe('3 pages');
  });

  it('adds the size once the file is ready, from the built page count', () => {
    expect(downloadDetail({ status: 'ready', pageCount: 2, size: 2048 }, 3, sm, 'ltr')).toBe('2 pages · 2.0 KB');
  });

  it('isolates the size in a right-to-left page', () => {
    expect(downloadDetail({ status: 'ready', pageCount: 2, size: 2048 }, 3, sm, 'rtl')).toContain('⁦');
  });
});
