import type { DocumentationLocaleId } from '../i18n/documentationLocales';

/**
 * LOC-09: the home page's launcher tile (src/site-lib/FileDropzone.tsx) had
 * no i18n hooks at all - every string was a hardcoded literal, and it took no
 * `messages` prop. Additive and backward compatible: the component defaults
 * to `englishFileDropzoneMessages` when no prop is passed, so every existing
 * caller (the two `<FileDropzone>` instances on the English home page) is
 * unaffected.
 *
 * MEM-03: the "Open this instead?" confirmation this catalogue used to carry
 * (`confirmHandoffTitle`/`confirmHandoffConfirm`/`confirmHandoffBody`,
 * `cancelLabel`/`closeLabel`) is gone. Once a recent file's work lives on its
 * own entry (draftStore.js), opening a different one from the home page
 * overwrites nothing, so there is nothing left to warn about - see
 * FileDropzone.tsx's `handOff`/`openRecent`.
 */
export interface FileDropzoneMessages {
  handoffFailed: string;
  recentFileUnavailable: string;
  sampleLoadFailed: string;
  opening: string;
  chooseFiles: string;
  orDropThenPick: string;
  /** The closing launcher's resting line: no toolbar sits below it. */
  orDropThem: string;
  /** SITE-42: the tile while one file waits for a tool in the toolbar. */
  pickAToolBelow: string;
  change: string;
  /** '{count}' placeholder. */
  fileCount: string;
  /** '{tool}' is the toolbar link's own (localized) label. */
  openingTool: string;
  /** '{names}' placeholder, comma-separated. */
  leftOut: string;
  unsupportedFiles: string;
  /** '{tool}' is filled from the `toolDisplayName` prop, so the destination
   * tool's name is never hardcoded to English ("Sign & Fill") - docs/
   * home-page-localization-plan.md, section 2 row 21. */
  practiceDocumentCaption: string;
}

export const englishFileDropzoneMessages: FileDropzoneMessages = {
  handoffFailed: 'PDkef could not save this file on your device. Please try again.',
  recentFileUnavailable: 'That recent file is no longer available in this browser.',
  sampleLoadFailed: 'The sample could not be loaded. Please try again or choose your own PDF.',
  opening: 'Opening…',
  chooseFiles: 'Choose files',
  orDropThenPick: 'or drop them here, then pick a tool below',
  orDropThem: 'or drop them here',
  pickAToolBelow: 'Now pick a tool below',
  change: 'Change',
  fileCount: '{count} files',
  openingTool: 'Opening {tool}…',
  leftOut: 'Left out: {names}',
  unsupportedFiles: 'Choose PDFs, or JPEG and PNG photos.',
  practiceDocumentCaption: 'Practice document · opens in {tool}',
};

// LOC-09's launcher strings, drafted with src/content/localized-home/he.yaml and
// reviewed with it: Shlomi's read-through of the rendered /he/ page, 2026-10-22
// (LOC-18).
export const hebrewFileDropzoneMessages: FileDropzoneMessages = {
  handoffFailed: 'לא הצלחנו לשמור את הקובץ הזה במכשיר שלכם. נסו שוב.',
  recentFileUnavailable: 'הקובץ הזה כבר לא זמין בדפדפן הזה.',
  sampleLoadFailed: 'לא הצלחנו לטעון את קובץ הדוגמה. נסו שוב או בחרו קובץ PDF משלכם.',
  opening: 'פותחים…',
  chooseFiles: 'בחירת קבצים',
  orDropThenPick: 'או גררו לכאן, ואז בחרו כלי למטה',
  orDropThem: 'או גררו לכאן',
  pickAToolBelow: 'עכשיו בחרו כלי למטה',
  change: 'החלפה',
  fileCount: '{count} קבצים',
  openingTool: 'פותחים את {tool}…',
  leftOut: 'לא נכללו: {names}',
  unsupportedFiles: 'בחרו קבצי PDF, או תמונות JPEG ו-PNG.',
  practiceDocumentCaption: 'מסמך לתרגול · נפתח בכלי {tool}',
};

const fileDropzoneMessages: Partial<Record<DocumentationLocaleId, FileDropzoneMessages>> = {
  en: englishFileDropzoneMessages,
  he: hebrewFileDropzoneMessages,
};

export function getFileDropzoneMessages(locale: DocumentationLocaleId): FileDropzoneMessages {
  return fileDropzoneMessages[locale] ?? englishFileDropzoneMessages;
}
