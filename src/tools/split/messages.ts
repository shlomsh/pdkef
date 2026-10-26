import type { DocumentationLocaleId } from '../../i18n/documentationLocales';
import type { PageGridMessages, DownloadMessages } from '../../shell/shellMessages';
import type { HistoryButtonsMessages } from '../../shell/HistoryButtons.tsx';

/**
 * The Split island's strings. English is the source of truth and is byte for
 * byte what PdfSplitTool.tsx rendered before it took a catalogue. `{name}`-style
 * tokens are filled with formatMessage; the `{unlock}`, `{name}` slots inside a
 * sentence that also holds a link or a <bdi> are filled by the component.
 * The output file names (`extracted_<name>.pdf`, `<name>-page-N.pdf`) are real
 * file names and are never translated.
 */
export interface SplitMessages extends PageGridMessages, DownloadMessages, HistoryButtonsMessages {
  lang: string;
  dir: 'ltr' | 'rtl';
  skippedOne: string;
  skippedMany: string;
  loadingPages: string;
  splitFailedBody: string;
  protectedNeedsPasswordTitle: string;
  protectedNeedsPasswordBody: string;
  protectedOwnerOnlyTitle: string;
  protectedOwnerOnlyBody: string;
  protectedUnlockIt: string;
  protectedHandoffFailed: string;
  unlockLink: string;
  pdfOne: string;
  pdfOther: string;
  /** aria-label of the editable output name in the combined heading. */
  fileNameEditableLabel: string;
  undo: string;
  pagesLabel: string;
  pageSelectorPlaceholder: string;
  modeGroupLabel: string;
  modeCombined: string;
  modeSeparate: string;
  modeNoteCombined: string;
  modeNoteSeparate: string;
  openPreview: string;
  previewTitle: string;
  previewClose: string;
  previewPrev: string;
  previewNext: string;
  previewLoading: string;
  savedMany: string;
  downloadAgain: string;
  downloadMany: string;
  detailSeparate: string;
  handoffFailed: string;
  announceCombined: string;
  announceSeparate: string;
  /* parsePageSelector's errors, rebuilt from its code and params. */
  outOfRange: string;
  rangeOutOfRange: string;
  invalidPart: string;
  noValidPages: string;
  /* The shared page grid's own strings (Split reads the same Download and Undo/Redo elements). */
  includeAll: string;
  skipAll: string;
  /* Not the bare Tailwind utility name: src/i18n is a Tailwind @source, and that ships a dead rule on every page. */
  invertPages: string;
  documentHeading: string;
  downloadShort: string;
  readyAnnouncement: string;
  sharedSuccessfully: string;
  sharingCanceled: string;
  shareError: string;
  undoneAnnouncement: string;
  redoneAnnouncement: string;
  allIncluded: string;
  inverted: string;
  loaded: string;
  loadFailed: string;
  announceNeedsPassword: string;
  announceRestricted: string;
  closeStrip: string;
  handoffCompress: string;
  handoffSign: string;
  shareLabel: string;
}

export const englishSplitMessages: SplitMessages = {
  lang: 'en',
  dir: 'ltr',
  skippedOne: 'Skipped “{name}” - not a PDF.',
  skippedMany: 'Skipped {count} files - not PDFs.',
  loadingPages: 'Loading document pages...',
  splitFailedBody: 'The split failed. A protected PDF opens in {unlock} first. Otherwise the file may be damaged.',
  protectedNeedsPasswordTitle: 'This PDF has a password',
  protectedNeedsPasswordBody: 'Unlock opens it on your device, then you can split it.',
  protectedOwnerOnlyTitle: 'This PDF is protected',
  protectedOwnerOnlyBody: "It opens without a password, but Split PDF can't change it as it is. Unlock takes the protection off on your device, then you can split it.",
  protectedUnlockIt: 'Unlock it',
  protectedHandoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
  unlockLink: 'Unlock',
  pdfOne: '1 PDF',
  pdfOther: '{count} PDFs',
  fileNameEditableLabel: 'File name, editable',
  undo: 'Undo',
  pagesLabel: 'Pages',
  pageSelectorPlaceholder: 'e.g. 1-3, 5, 8-',
  modeGroupLabel: 'What to save',
  modeCombined: 'One PDF',
  modeSeparate: 'One PDF per page',
  modeNoteCombined: 'Selected pages become a single PDF.',
  modeNoteSeparate: 'Each selected page becomes its own PDF.',
  openPreview: 'Open page {number} larger',
  previewTitle: 'Page {number} of {total}',
  previewClose: 'Close',
  previewPrev: 'Previous page',
  previewNext: 'Next page',
  previewLoading: 'Rendering the page…',
  savedMany: 'Saved {files}',
  downloadAgain: 'download again',
  downloadMany: 'Download {files}',
  detailSeparate: '1 page each · {size}',
  handoffFailed: 'Could not hand the file over. Download it instead.',
  announceCombined: 'Selected pages will become a single PDF.',
  announceSeparate: 'Each selected page will become its own PDF.',
  outOfRange: 'Page number {number} out of range (1-{max})',
  rangeOutOfRange: 'Range {start}-{end} contains out of range page numbers (1-{max})',
  invalidPart: 'Invalid page range or number: "{part}"',
  noValidPages: 'No valid pages selected',
  captionPages: 'pages {from} to {to}',
  includePage: 'Include page {number}',
  pageIncluded: 'Page {number} included again.',
  pageItemLabel: 'Page {number} of {total}{state}',
  pageMoved: 'Page moved to position {position} of {total}.',
  pageRotated: 'Page {number} rotated to {degrees} degrees.',
  pageSkipped: 'Page {number} skipped. It stays here and is left out of the download.',
  previewIncludeAgain: 'Include it again',
  previewSkippedBanner: 'Left out of the split PDF',
  previewSkippedNote: 'Left out of the download.',
  rotatePage: 'Rotate page {number}',
  skipPage: 'Skip page {number}',
  skippedBadge: 'Skipped',
  skippedCountOne: '1 page skipped',
  skippedCountOther: '{count} pages skipped',
  skippedState: ', skipped',
  stripHint: 'Focus a page and press R to rotate it, Delete to skip it, or Enter to open it larger.',
  tipBringBack: 'Show',
  tipOpen: 'Open',
  tipRotate: 'Rotate',
  tipSkip: 'Skip',
  allSkipped: 'Every page is skipped',
  downloadLabel: 'Download 1 PDF',
  buildFailed: 'Could not split this PDF',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} rendered',
  savedLabel: 'Saved',
  redo: 'Redo',
  undoLabel: 'Undo last change',
  redoLabel: 'Redo last undone change',
  includeAll: 'Include all',
  skipAll: 'Skip all',
  invertPages: 'Invert',
  documentHeading: 'Your split PDF',
  downloadShort: 'Download',
  readyAnnouncement: 'Your PDF is ready.',
  sharedSuccessfully: 'Split PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  undoneAnnouncement: 'Undid last change.',
  redoneAnnouncement: 'Redid last change.',
  allIncluded: 'All pages included.',
  inverted: 'Included and skipped pages swapped.',
  loaded: 'Loaded PDF file "{name}" with {count} pages.',
  loadFailed: 'Failed to load PDF file.',
  announceNeedsPassword: 'This PDF has a password',
  announceRestricted: 'This PDF is protected',
  closeStrip: 'Close',
  handoffCompress: 'Compress',
  handoffSign: 'Sign',
  shareLabel: 'Share',
};

// An AI draft, not reviewed copy: pairs with he/split.yaml's own draft status
// and awaits Shlomi's read. Terms follow Merge's and Compress's Hebrew
// catalogues for shared ideas (הורדה, שיתוף, ביטול, סיבוב עמוד, כיווץ, הסרת נעילה).
export const hebrewSplitMessages: SplitMessages = {
  lang: 'he',
  dir: 'rtl',
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא קבצי PDF.',
  loadingPages: 'טוענים את עמודי המסמך...',
  splitFailedBody: 'הפיצול נכשל. קובץ PDF מוגן נפתח קודם ב{unlock}. אם הוא לא מוגן, ייתכן שהקובץ פגום.',
  protectedNeedsPasswordTitle: 'לקובץ ה-PDF הזה יש סיסמה',
  protectedNeedsPasswordBody: 'הסרת הנעילה פותחת אותו במכשיר שלכם, ואז אפשר לפצל אותו.',
  protectedOwnerOnlyTitle: 'קובץ ה-PDF הזה נעול',
  protectedOwnerOnlyBody: 'הוא נפתח בלי סיסמה, אבל אי אפשר לפצל אותו כמו שהוא. הסרת הנעילה מורידה את ההגנה במכשיר שלכם, ואז אפשר לפצל אותו.',
  protectedUnlockIt: 'הסרת נעילה',
  protectedHandoffFailed: 'לא הצלחנו לפתוח את הקובץ בכלי הסרת הנעילה. פתחו את הכלי ובחרו אותו שם.',
  unlockLink: 'הסרת נעילה',
  pdfOne: 'קובץ PDF אחד',
  pdfOther: '{count} קבצי PDF',
  fileNameEditableLabel: 'שם הקובץ, ניתן לעריכה',
  undo: 'ביטול',
  pagesLabel: 'עמודים',
  pageSelectorPlaceholder: 'לדוגמה 1-3, 5, 8-',
  modeGroupLabel: 'מה לשמור',
  modeCombined: 'PDF אחד',
  modeSeparate: 'PDF לכל עמוד',
  modeNoteCombined: 'העמודים שבחרתם יהפכו לקובץ PDF אחד.',
  modeNoteSeparate: 'כל עמוד שבחרתם יהפוך לקובץ PDF משלו.',
  openPreview: 'הגדלת עמוד {number}',
  previewTitle: 'עמוד {number} מתוך {total}',
  previewClose: 'סגירה',
  previewPrev: 'העמוד הקודם',
  previewNext: 'העמוד הבא',
  previewLoading: 'מציירים את העמוד…',
  savedMany: 'נשמרו {files}',
  downloadAgain: 'הורדה שוב',
  downloadMany: 'הורדת {files}',
  detailSeparate: 'עמוד אחד בכל קובץ · {size}',
  handoffFailed: 'לא הצלחנו להעביר את הקובץ. הורידו אותו במקום.',
  announceCombined: 'העמודים שבחרתם יהפכו לקובץ PDF אחד.',
  announceSeparate: 'כל עמוד שבחרתם יהפוך לקובץ PDF משלו.',
  outOfRange: 'עמוד {number} מחוץ לטווח (1-{max})',
  rangeOutOfRange: 'הטווח {start}-{end} כולל עמודים מחוץ לטווח (1-{max})',
  invalidPart: 'טווח או מספר עמוד לא תקין: "{part}"',
  noValidPages: 'לא נבחרו עמודים תקינים',
  captionPages: 'עמודים {from} עד {to}',
  includePage: 'הוספת עמוד {number}',
  pageIncluded: 'עמוד {number} מצורף שוב.',
  pageItemLabel: 'עמוד {number} מתוך {total}{state}',
  pageMoved: 'העמוד עבר למקום {position} מתוך {total}.',
  pageRotated: 'עמוד {number} סובב ל-{degrees} מעלות.',
  pageSkipped: 'דילגנו על עמוד {number}. הוא נשאר כאן ולא ייכלל בהורדה.',
  previewIncludeAgain: 'להחזיר אותו',
  previewSkippedBanner: 'לא ייכלל ב-PDF המפוצל',
  previewSkippedNote: 'לא ייכלל בהורדה.',
  rotatePage: 'סיבוב עמוד {number}',
  skipPage: 'דילוג על עמוד {number}',
  skippedBadge: 'נסתר',
  skippedCountOne: 'עמוד אחד נסתר',
  skippedCountOther: '{count} עמודים נסתרים',
  skippedState: ', נסתר',
  stripHint: 'התמקדו בעמוד ולחצו R כדי לסובב אותו, Delete כדי לדלג עליו, או Enter כדי לפתוח אותו בגודל מלא.',
  tipBringBack: 'הצגה',
  tipOpen: 'פתיחה',
  tipRotate: 'סיבוב',
  tipSkip: 'דילוג',
  allSkipped: 'כל העמודים נסתרים',
  downloadLabel: 'הורדת PDF יחיד',
  buildFailed: 'לא הצלחנו לפצל את ה-PDF הזה',
  preparingPages: '{count} עמודים בעבודה…',
  renderProgress: '{done} מתוך {total} נוצרו',
  savedLabel: 'נשמר',
  redo: 'ביצוע מחדש',
  undoLabel: 'ביטול השינוי האחרון',
  redoLabel: 'ביצוע מחדש של השינוי שבוטל',
  includeAll: 'הוסף הכול',
  skipAll: 'דלג על הכול',
  invertPages: 'היפוך',
  documentHeading: 'ה-PDF המפוצל שלכם',
  downloadShort: 'הורדה',
  readyAnnouncement: 'ה-PDF שלכם מוכן.',
  sharedSuccessfully: 'ה-PDF המפוצל שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  undoneAnnouncement: 'השינוי האחרון בוטל',
  redoneAnnouncement: 'השינוי בוצע מחדש',
  allIncluded: 'כל העמודים כלולים.',
  inverted: 'העמודים הכלולים והנסתרים התחלפו.',
  loaded: 'הקובץ "{name}" נטען, {count} עמודים.',
  loadFailed: 'טעינת קובץ ה-PDF נכשלה.',
  announceNeedsPassword: 'ה-PDF הזה מוגן בסיסמה',
  announceRestricted: 'ה-PDF הזה מוגן',
  closeStrip: 'סגירה',
  handoffCompress: 'כיווץ',
  handoffSign: 'חתימה',
  shareLabel: 'שיתוף',
};

const splitMessages: Partial<Record<DocumentationLocaleId, SplitMessages>> = {
  en: englishSplitMessages,
  he: hebrewSplitMessages,
};

export function getSplitMessages(locale: DocumentationLocaleId): SplitMessages {
  return splitMessages[locale] ?? englishSplitMessages;
}
