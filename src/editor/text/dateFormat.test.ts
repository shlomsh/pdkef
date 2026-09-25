import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DATE_FORMAT_IDS,
  dateFormatForComb,
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

  it('formats DDMMYYYY with no separators for dmyDigits, one digit per comb cell', () => {
    expect(formatDate(isoDate, 'dmyDigits')).toBe('15092026');
  });

  it('formats MMDDYYYY with no separators for mdyDigits', () => {
    expect(formatDate(isoDate, 'mdyDigits')).toBe('09152026');
  });

  it('formats month/day/year for mdy', () => {
    expect(formatDate(isoDate, 'mdy')).toBe('09/15/2026');
  });

  it('zero-pads single-digit day and month', () => {
    expect(formatDate('2026-01-05', 'dmy')).toBe('05/01/2026');
    expect(formatDate('2026-01-05', 'mdy')).toBe('01/05/2026');
    expect(formatDate('2026-01-05', 'dmyDigits')).toBe('05012026');
    expect(formatDate('2026-01-05', 'mdyDigits')).toBe('01052026');
  });

  it('follows the given locale for the locale format', () => {
    expect(formatDate(isoDate, 'locale', 'en-US')).toBe('9/15/2026');
    expect(formatDate(isoDate, 'locale', 'en-GB')).toBe('15/09/2026');
  });

  it('defaults to detectLocale() when no locale is passed', () => {
    expect(formatDate(isoDate, 'iso')).toBe(isoDate);
  });
});

describe('dateFormatForComb', () => {
  it('goes digits-only on an 8-cell comb, month-first only for a month-first choice', () => {
    expect(dateFormatForComb('mdy', 8)).toBe('mdyDigits');
    expect(dateFormatForComb('mdyDigits', 8)).toBe('mdyDigits');
    (['locale', 'iso', 'dmy', 'dmyDigits'] as const).forEach((id) => expect(dateFormatForComb(id, 8)).toBe('dmyDigits'));
  });

  it('keeps the remembered format for any other cell count', () => {
    expect(dateFormatForComb('iso', 10)).toBe('iso');
    expect(dateFormatForComb('mdy', 6)).toBe('mdy');
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
