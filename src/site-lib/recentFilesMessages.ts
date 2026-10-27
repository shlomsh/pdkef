import type { DocumentationLocaleId } from '../i18n/documentationLocales';

/** RecentFiles.tsx's own strings. Rendered only by FileDropzone
 * (src/site-lib/FileDropzone.tsx:132), so it is passed through from
 * there rather than resolved independently. `Intl.RelativeTimeFormat`'s
 * "N minutes ago"-style phrases already resolve against the *browser's* own
 * locale, independent of the page's content locale - deliberately left
 * alone (docs/home-page-localization-plan.md, section 2 row 8) - only the
 * "just now" fallback below 60 seconds is a literal string this catalogue
 * owns. */
export interface RecentFilesMessages {
  heading: string;
  /** '{name}' placeholder. */
  openSampleAriaLabel: string;
  /** '{name}' placeholder. */
  openRecentAriaLabel: string;
  justNow: string;
  /** MERGE-13: the page count on a saved Merge draft's card. */
  pageCountOne: string;
  pageCountOther: string;
  /** MEM-11 Part B: replaces the relative "saved N ago" line when this
   * entry is within EXPIRY_WARNING_DAYS of the 28-day age limit. */
  expiresInDaysOne: string;
  expiresInDaysOther: string; // '{count}' placeholder
  oldestKeptFile: string; // '{count}' placeholder
}

export const englishRecentFilesMessages: RecentFilesMessages = {
  heading: 'Recent files',
  openSampleAriaLabel: 'Open bundled sample PDF, {name}',
  openRecentAriaLabel: 'Open recent PDF, {name}',
  justNow: 'just now',
  pageCountOne: '1 page',
  pageCountOther: '{count} pages',
  expiresInDaysOne: 'Expires in 1 day',
  expiresInDaysOther: 'Expires in {count} days',
  oldestKeptFile: 'Oldest of {count} files',
};

// LOC-09: reviewed with hebrewFileDropzoneMessages above (LOC-18, 2026-10-22).
const hebrewRecentFilesMessages: RecentFilesMessages = {
  heading: 'קבצים אחרונים',
  openSampleAriaLabel: 'פתיחת קובץ הדוגמה, {name}',
  openRecentAriaLabel: 'פתיחת קובץ אחרון, {name}',
  justNow: 'הרגע',
  pageCountOne: 'עמוד אחד',
  pageCountOther: '{count} עמודים',
  expiresInDaysOne: 'פג תוקף מחר',
  expiresInDaysOther: 'פג תוקף בעוד {count} ימים',
  oldestKeptFile: 'הישן מבין {count} קבצים',
};

const recentFilesMessages: Partial<Record<DocumentationLocaleId, RecentFilesMessages>> = {
  en: englishRecentFilesMessages,
  he: hebrewRecentFilesMessages,
};

export function getRecentFilesMessages(locale: DocumentationLocaleId): RecentFilesMessages {
  return recentFilesMessages[locale] ?? englishRecentFilesMessages;
}
