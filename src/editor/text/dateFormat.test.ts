import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DATE_FORMAT_IDS,
  detectLocale,
  formatDate,
  isDateFormatId,
  nextDateFormatId,
  toIsoDateString,
  type DateFormatId,
} from './dateFormat.ts';

describe('toIsoDateString', () => {
  it('formats the local calendar day as YYYY-MM-DD, zero-padded', () => {
    expect(toIsoDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('isDateFormatId', () => {
  it('accepts every id in DATE_FORMAT_IDS and rejects everything else', () => {
    DATE_FORMAT_IDS.forEach((id) => expect(isDateFormatId(id)).toBe(true));
    expect(isDateFormatId('yyyy')).toBe(false);
    expect(isDateFormatId(undefined)).toBe(false);
    expect(isDateFormatId(42)).toBe(false);
  });
});

describe('formatDate', () => {
  const isoDate = '2026-09-15';

  it('returns the stored ISO string unchanged for the iso format', () => {
    expect(formatDate(isoDate, 'iso')).toBe(isoDate);
  });

  it('formats day/month/year for dmy', () => {
    expect(formatDate(isoDate, 'dmy')).toBe('15/09/2026');
  });

  it('formats month/day/year for mdy', () => {
    expect(formatDate(isoDate, 'mdy')).toBe('09/15/2026');
  });

  it('zero-pads single-digit day and month', () => {
    expect(formatDate('2026-01-05', 'dmy')).toBe('05/01/2026');
    expect(formatDate('2026-01-05', 'mdy')).toBe('01/05/2026');
  });

  it('follows the given locale for the locale format', () => {
    expect(formatDate(isoDate, 'locale', 'en-US')).toBe('9/15/2026');
    expect(formatDate(isoDate, 'locale', 'en-GB')).toBe('15/09/2026');
  });

  it('defaults to detectLocale() when no locale is passed', () => {
    expect(formatDate(isoDate, 'iso')).toBe(isoDate);
  });
});

describe('nextDateFormatId', () => {
  it('cycles through every id in order and wraps back to the first', () => {
    const sequence = DATE_FORMAT_IDS.reduce<DateFormatId[]>((acc, _, index) => {
      const previous = index === 0 ? DATE_FORMAT_IDS[DATE_FORMAT_IDS.length - 1] : acc[index - 1];
      return [...acc, nextDateFormatId(previous)];
    }, []);
    expect(sequence).toEqual([...DATE_FORMAT_IDS]);
  });
});

describe('detectLocale', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads navigator.language when available', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(detectLocale()).toBe('fr-FR');
  });

  it('falls back to en-US when navigator.language is unavailable', () => {
    vi.stubGlobal('navigator', {});
    expect(detectLocale()).toBe('en-US');
  });
});
