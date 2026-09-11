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
  /** LOC-02: ToolCrossLinks' own chrome (kicker/heading/subhead) - the
   * "everything the crawler reads" list in LOC-02.md names cross-link cards
   * explicitly. The individual tool names/descriptions inside each card stay
   * English (src/data/tools.js is untouched by this ticket) since they link
   * to tool pages that are not themselves localized yet. */
  crossLinksKicker: string;
  crossLinksHeading: string;
  crossLinksSubhead: string;
  /** ToolAboutCard's own chrome around the per-tool steps/lead. The
   * open-source paragraph is the one string here carrying markup: one
   * external `<a>` to the repo, rendered with set:html like its English
   * original, so keep it to that. */
  howItWorks: string;
  freeForEveryone: string;
  openSourceNote: string;
  socialImageAlt: string;
  builtWith: string;
  by: string;
  github: string;
  reportBug: string;
  feedbackAndIdeas: string;
  licenses: string;
  /** LOC-02: shown on a localized tool page whose island has no reviewed
   * message catalogue yet (see LOCALIZED_TOOL_ISLANDS in localizedTools.ts) -
   * the same "editor stays English" pilot decision as Sign/Redact, stated on
   * the page rather than left for the visitor to discover mid-task. */
  toolControlsEnglishNotice: string;
}

export type AppBarMessages = Pick<DocumentationShellMessages, 'homeAriaLabel' | 'onDevice'>;
export type FaqMessages = Pick<DocumentationShellMessages, 'faqTag' | 'faqHeading'>;
export type OtherGuidesMessages = Pick<DocumentationShellMessages, 'otherDevices' | 'openSignTool'>;
export type RelatedGuidesMessages = Pick<DocumentationShellMessages, 'relatedHeading'>;
export type CrossLinksMessages = Pick<DocumentationShellMessages, 'crossLinksKicker' | 'crossLinksHeading' | 'crossLinksSubhead'>;
export type AboutCardMessages = Pick<DocumentationShellMessages, 'howItWorks' | 'freeForEveryone' | 'openSourceNote'>;
export type FooterMessages = Pick<
  DocumentationShellMessages,
  'builtWith' | 'by' | 'github' | 'reportBug' | 'feedbackAndIdeas' | 'licenses' | 'language'
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
  crossLinksKicker: 'Same suite',
  crossLinksHeading: 'More PDF tools',
  crossLinksSubhead: "Every one of these runs on your device, free, with nothing uploaded.",
  howItWorks: 'How it works',
  freeForEveryone: 'Free for everyone',
  openSourceNote:
    'It\'s open source under the MIT license, so anyone can read the code, <a class="font-medium text-[var(--color-primary-text)]" href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">fork it on GitHub</a>, or share it. Simple PDF tools should be free for everyone.',
  socialImageAlt: 'PDkef - free PDF tools that run entirely in your browser.',
  builtWith: 'Built with',
  by: 'by',
  github: 'GitHub',
  reportBug: 'Report a bug',
  feedbackAndIdeas: 'Feedback & ideas',
  licenses: 'Licenses',
  toolControlsEnglishNotice: "This tool's buttons and menus are still in English.",
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
  crossLinksKicker: 'מאותו ארגז כלים',
  crossLinksHeading: 'עוד כלי PDF',
  crossLinksSubhead: 'כל אחד מהם רץ על המכשיר שלכם, בחינם, בלי להעלות שום דבר.',
  howItWorks: 'איך זה עובד',
  freeForEveryone: 'חינם לכולם',
  openSourceNote:
    'הקוד פתוח ברישיון MIT, אז כל אחד יכול לקרוא אותו, <a class="font-medium text-[var(--color-primary-text)]" href="https://github.com/shlomsh/pdkef" target="_blank" rel="noopener noreferrer">לעשות לו fork ב-GitHub</a> או לשתף אותו. כלים פשוטים ל-PDF צריכים להיות חינם לכולם.',
  socialImageAlt: 'PDkef - כלים חינמיים ל-PDF שפועלים במלואם בדפדפן שלך.',
  builtWith: 'נבנה עם',
  by: 'על ידי',
  github: 'GitHub',
  reportBug: 'דיווח על תקלה',
  feedbackAndIdeas: 'משוב ורעיונות',
  licenses: 'רישיונות',
  toolControlsEnglishNotice: 'הכפתורים והתפריטים של הכלי עדיין באנגלית.',
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
