// Formatting for the Sign tool's "today's date" field (registry/text.ts creates
// it as an ordinary TextElement with computed initial content - see
// useWorkspaceGestures.ts's 'date' tool branch). A handful of common patterns
// plus a browser-locale default, so a placed date matches how dates are
// written where the person is, with an explicit override remembered for next
// time (preferenceStore.ts's `dateFormat` key).

// No spelled-out-month ('long') option: it bakes in whatever language
// Intl.DateTimeFormat resolves for the browser's own locale, which has no
// relationship to the language of the document the date is being placed on -
// an English "September" on an otherwise-Hebrew form reads as wrong in a way
// the numeric formats below never can, since none of them spell anything out.
//
// 'dmyDigits' is DDMMYYYY with no separators, for boxed date fields that print
// their own dividers (e.g. an 8-cell DD|MM|YYYY comb on Israeli tax forms):
// written with slashes, those would spend two cells on '/' and cut the year.
export type DateFormatId = 'locale' | 'iso' | 'dmy' | 'dmyDigits' | 'mdy';

/** Cycle order for ElementToolbar.tsx's single format-cycling control. */
export const DATE_FORMAT_IDS: readonly DateFormatId[] = ['locale', 'iso', 'dmy', 'dmyDigits', 'mdy'];

export function isDateFormatId(value: unknown): value is DateFormatId {
  return typeof value === 'string' && (DATE_FORMAT_IDS as readonly string[]).includes(value);
}

/**
 * The local calendar day as `YYYY-MM-DD`, stored on the element (`dateValue`)
 * as the anchor a format switch reformats from. Deliberately not
 * `toISOString()`, which converts to UTC and can name the wrong day for
 * whoever is near a date line at the time.
 */
export function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDateString(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/** Best-effort browser locale; `formatDate`'s 'locale' option only. */
export function detectLocale(): string {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  } catch { /* not available (SSR, locked-down environment) */ }
  return 'en-US';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats a `toIsoDateString`-shaped date per `formatId`. */
export function formatDate(isoDate: string, formatId: DateFormatId, locale: string = detectLocale()): string {
  const date = fromIsoDateString(isoDate);
  switch (formatId) {
    case 'iso': return isoDate;
    case 'dmy': return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
    case 'dmyDigits': return `${pad2(date.getDate())}${pad2(date.getMonth() + 1)}${date.getFullYear()}`;
    case 'mdy': return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${date.getFullYear()}`;
    case 'locale':
    default:
      return new Intl.DateTimeFormat(locale).format(date);
  }
}

/** Next format in the cycle order, wrapping - ElementToolbar.tsx's single control. */
export function nextDateFormatId(current: DateFormatId): DateFormatId {
  const index = DATE_FORMAT_IDS.indexOf(current);
  return DATE_FORMAT_IDS[(index + 1) % DATE_FORMAT_IDS.length];
}
