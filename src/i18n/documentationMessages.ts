import type { DocumentationLocaleId } from './documentationLocales';

/**
 * Copy owned by the documentation shell, rather than by an individual guide.
 *
 * This intentionally excludes the PDF editor. Documentation may be localized,
 * while the editor and all of its control labels remain English/LTR by product
 * policy. `openSignTool` therefore calls out that destination explicitly.
 */
export interface DocumentationShellMessages {
  homeAriaLabel: string;
  onDevice: string;
  language: string;
  previewNotice: string;
  stalePreviewNotice: string;
  faqTag: string;
  faqHeading: string;
  otherDevices: string;
  openSignTool: string;
  relatedHeading: string;
  socialImageAlt: string;
  builtWith: string;
  by: string;
  github: string;
  reportBug: string;
  feedbackAndIdeas: string;
  licenses: string;
}

export type AppBarMessages = Pick<DocumentationShellMessages, 'homeAriaLabel' | 'onDevice'>;
export type FaqMessages = Pick<DocumentationShellMessages, 'faqTag' | 'faqHeading'>;
export type OtherGuidesMessages = Pick<DocumentationShellMessages, 'otherDevices' | 'openSignTool'>;
export type RelatedGuidesMessages = Pick<DocumentationShellMessages, 'relatedHeading'>;
export type FooterMessages = Pick<
  DocumentationShellMessages,
  'builtWith' | 'by' | 'github' | 'reportBug' | 'feedbackAndIdeas' | 'licenses'
>;

const englishMessages = {
  homeAriaLabel: 'PDkef home, all tools',
  onDevice: 'On-device',
  language: 'Language',
  previewNotice: 'Preview translation for native review. This page is not indexed.',
  stalePreviewNotice: 'Preview translation needs review after its English source changed. This page is not indexed.',
  faqTag: 'Got questions?',
  faqHeading: 'Frequently asked questions',
  otherDevices: 'Signing on a different device?',
  openSignTool: 'Open the Sign & Fill tool',
  relatedHeading: 'Documentation',
  socialImageAlt: 'PDkef - free PDF tools that run entirely in your browser.',
  builtWith: 'Built with',
  by: 'by',
  github: 'GitHub',
  reportBug: 'Report a bug',
  feedbackAndIdeas: 'Feedback & ideas',
  licenses: 'Licenses',
} satisfies DocumentationShellMessages;

const hebrewMessages = {
  homeAriaLabel: 'דף הבית של PDkef, כל הכלים',
  onDevice: 'במכשיר שלך',
  language: 'שפה',
  previewNotice: 'תרגום בתצוגה מקדימה לבדיקת דוברי עברית. דף זה אינו מאונדקס.',
  stalePreviewNotice: 'התרגום בתצוגה מקדימה דורש בדיקה לאחר שינוי במקור האנגלי. דף זה אינו מאונדקס.',
  faqTag: 'יש שאלות?',
  faqHeading: 'שאלות נפוצות',
  otherDevices: 'חותמים במכשיר אחר?',
  openSignTool: 'פתיחת כלי החתימה והמילוי (באנגלית)',
  relatedHeading: 'מדריכים',
  socialImageAlt: 'PDkef - כלים חינמיים ל-PDF שפועלים במלואם בדפדפן שלך.',
  builtWith: 'נבנה עם',
  by: 'על ידי',
  github: 'GitHub',
  reportBug: 'דיווח על תקלה',
  feedbackAndIdeas: 'משוב ורעיונות',
  licenses: 'רישיונות',
} satisfies DocumentationShellMessages;

/**
 * Adding a locale to `documentationLocales.ts` does not make its documentation
 * publishable. Its reviewed shell copy belongs here too.
 */
export const documentationShellMessages: Partial<Record<DocumentationLocaleId, DocumentationShellMessages>> = {
  en: englishMessages,
  he: hebrewMessages,
};

export function assertDocumentationShellMessages(
  locale: DocumentationLocaleId,
  messages: Partial<DocumentationShellMessages> | undefined,
): asserts messages is DocumentationShellMessages {
  const missing = (Object.keys(englishMessages) as Array<keyof DocumentationShellMessages>)
    .filter((key) => !messages?.[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Documentation shell messages for ${locale} are required before a page can publish. Missing: ${missing.join(', ')}.`,
    );
  }
}

/** Resolves at build time, so published locales can never silently use English shell copy. */
export function getDocumentationShellMessages(locale: DocumentationLocaleId): DocumentationShellMessages {
  const messages = documentationShellMessages[locale];
  assertDocumentationShellMessages(locale, messages);
  return messages;
}
