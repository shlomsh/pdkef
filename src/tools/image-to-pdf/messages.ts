import type { DocumentationLocaleId } from '../../i18n/documentationLocales';

/**
 * The Image to PDF island's strings. English is the source of truth and is
 * byte for byte what PdfImageToPdfTool.tsx rendered before it took a catalogue.
 * File names are the person's own and are never translated. JPG and PNG stay
 * Latin on every locale.
 */
export interface ImageToPdfMessages {
  lang: string;
  dir: 'ltr' | 'rtl';
  dropHere: string;
  addImages: string;
  /** '{name}' is the skipped file's name. */
  skippedOne: string;
  skippedMany: string;
  sortLabel: string;
  sortAriaLabel: string;
  sortCustom: string;
  sortNameAsc: string;
  sortNameDesc: string;
  sortDateAsc: string;
  sortDateDesc: string;
  fileNameLabel: string;
  pageCountOne: string;
  pageCountOther: string;
  reorderHint: string;
  /** '{name}', '{position}' and '{total}' are the file's name and place. */
  tileLabel: string;
  removeLabel: string;
  /** Total image count for the file-info bar and the clear dialog. */
  imageCountOne: string;
  imageCountOther: string;
  buildFailed: string;
  tryAgain: string;
  preparing: string;
  downloadLabel: string;
  shareLabel: string;
  /* Screen-reader announcements. */
  announceAddedOne: string;
  announceAddedMany: string;
  announceRemoved: string;
  announceCleared: string;
  announceMoved: string;
  announceReordered: string;
  announcePreparing: string;
  announceReady: string;
  announceUpdating: string;
  announceShared: string;
  announceShareCanceled: string;
  announceShareError: string;
  /** The hand-off to Scan to PDF (English page only for now, as other Hebrew pages link English tools). */
  scanHandoff: string;
  scanHandoffFailed: string;
}

export const englishImageToPdfMessages: ImageToPdfMessages = {
  lang: 'en',
  dir: 'ltr',
  dropHere: 'Drop images here',
  addImages: 'Add images',
  skippedOne: 'Skipped \u201c{name}\u201d - not a JPG or PNG.',
  skippedMany: 'Skipped {count} files - not JPG or PNG.',
  sortLabel: 'Order',
  sortAriaLabel: 'Order images',
  sortCustom: 'Your order',
  sortNameAsc: 'Name A\u2013Z',
  sortNameDesc: 'Name Z\u2013A',
  sortDateAsc: 'Oldest first',
  sortDateDesc: 'Newest first',
  fileNameLabel: 'PDF file name',
  pageCountOne: 'page',
  pageCountOther: 'pages',
  reorderHint: 'Drag a page to reorder, or focus a page and press the arrow keys to move it.',
  tileLabel: '{name}, page {position} of {total}. Drag, or press an arrow key to move.',
  removeLabel: 'Remove {name}',
  imageCountOne: '{count} image',
  imageCountOther: '{count} images',
  buildFailed: 'A file may be damaged - remove it and try again.',
  tryAgain: 'Try again',
  preparing: 'Preparing\u2026',
  downloadLabel: 'Download PDF',
  shareLabel: 'Share PDF',
  announceAddedOne: '{count} image added.',
  announceAddedMany: '{count} images added.',
  announceRemoved: '{name} removed.',
  announceCleared: 'Cleared. Add images to start again.',
  announceMoved: '{name} moved to position {position} of {total}.',
  announceReordered: 'Images reordered.',
  announcePreparing: 'Preparing your PDF.',
  announceReady: 'Your PDF is ready.',
  announceUpdating: 'Your PDF is updating. Try Share again in a moment.',
  announceShared: 'PDF shared successfully.',
  announceShareCanceled: 'Sharing canceled. Your PDF is still ready.',
  announceShareError: 'Could not open the share sheet. Please try again.',
  scanHandoff: 'Clean it up as a scan',
  scanHandoffFailed: 'Could not open Scan to PDF. Try again.',
};

// An AI draft, not reviewed copy: pairs with he/image-to-pdf.yaml and awaits
// Shlomi's read. Terms follow Merge's and PDF to Image's Hebrew catalogues
// for shared ideas (מיון, הורדה, שיתוף, עמודים, מכינים).
export const hebrewImageToPdfMessages: ImageToPdfMessages = {
  lang: 'he',
  dir: 'rtl',
  dropHere: 'גררו לכאן תמונות',
  addImages: 'הוספת תמונות',
  skippedOne: 'דילגנו על "{name}" - זה לא JPG או PNG.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא JPG או PNG.',
  sortLabel: 'סדר',
  sortAriaLabel: 'סדר התמונות',
  sortCustom: 'הסדר שלכם',
  sortNameAsc: 'שם, א עד ת',
  sortNameDesc: 'שם, ת עד א',
  sortDateAsc: 'הישן ביותר קודם',
  sortDateDesc: 'החדש ביותר קודם',
  fileNameLabel: 'שם קובץ ה-PDF',
  pageCountOne: 'עמוד',
  pageCountOther: 'עמודים',
  reorderHint: 'גררו עמוד כדי לסדר מחדש, או התמקדו בעמוד ולחצו על מקשי החיצים כדי להזיז אותו.',
  tileLabel: '{name}, עמוד {position} מתוך {total}. גררו, או לחצו על מקש חץ כדי להזיז.',
  removeLabel: 'הסרת {name}',
  imageCountOne: '{count} תמונה',
  imageCountOther: '{count} תמונות',
  buildFailed: 'ייתכן שאחד הקבצים פגום. הסירו אותו ונסו שוב.',
  tryAgain: 'ניסיון חוזר',
  preparing: 'מכינים…',
  downloadLabel: 'הורדת PDF',
  shareLabel: 'שיתוף PDF',
  announceAddedOne: '{count} תמונה נוספה.',
  announceAddedMany: '{count} תמונות נוספו.',
  announceRemoved: '{name} הוסר.',
  announceCleared: 'הכול נוקה. הוסיפו תמונות כדי להתחיל מחדש.',
  announceMoved: '{name} הוזז למקום {position} מתוך {total}.',
  announceReordered: 'התמונות סודרו מחדש.',
  announcePreparing: 'מכינים את ה-PDF.',
  announceReady: 'ה-PDF מוכן.',
  announceUpdating: 'ה-PDF מתעדכן. נסו לשתף שוב בעוד רגע.',
  announceShared: 'ה-PDF שותף.',
  announceShareCanceled: 'השיתוף בוטל. ה-PDF עדיין מוכן.',
  announceShareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  scanHandoff: 'לנקות כסריקה',
  scanHandoffFailed: 'לא הצלחנו לפתוח את סריקה ל-PDF. נסו שוב.',
};

const imageToPdfMessages: Partial<Record<DocumentationLocaleId, ImageToPdfMessages>> = {
  en: englishImageToPdfMessages,
  he: hebrewImageToPdfMessages,
};

export function getImageToPdfMessages(locale: DocumentationLocaleId): ImageToPdfMessages {
  return imageToPdfMessages[locale] ?? englishImageToPdfMessages;
}
