import type { DocumentationLocaleId } from '../../i18n/documentationLocales';
import type { PageGridMessages, DownloadMessages } from '../../shell/shellMessages';
import type { PageToolMessages } from '../../shell/pageWorkspace/pageGridMessages.ts';
import type { HistoryButtonsMessages } from '../../shell/HistoryButtons.tsx';

/**
 * The PDF to Image island's strings. English is the source of truth and is
 * byte for byte what PdfToImageTool.tsx rendered before it took a catalogue.
 * `{format}` is PNG or JPG, which stay Latin on every locale. The output file
 * names (`<name>-page-N.png`) are real file names and are never translated.
 */
export interface ToImageMessages extends PageGridMessages, PageToolMessages, DownloadMessages, HistoryButtonsMessages {
  lang: string;
  dir: 'ltr' | 'rtl';
  formatLabel: string;
  qualityLabel: string;
  qualityStandard: string;
  qualityStandardHint: string;
  qualityHigh: string;
  qualityHighHint: string;
  qualityMaximum: string;
  qualityMaximumHint: string;
  layoutLabel: string;
  layoutSeparate: string;
  layoutCombined: string;
  pagesLabel: string;
  pageSelectorPlaceholder: string;
  /** The one-line description under the selected Format option. */
  formatPngHint: string;
  formatJpgHint: string;
  /** The one-line description under the selected Output option. */
  layoutSeparateHint: string;
  layoutCombinedHint: string;
  loadingPages: string;
  downloadPageAria: string;
  /* The shared page-preview dialog, as Split's. */
  openPreview: string;
  previewTitle: string;
  previewClose: string;
  previewPrev: string;
  previewNext: string;
  previewLoading: string;
  convertFailed: string;
  buildFailed: string;
  /** Detail line under the Download above the auto-build page limit, before anything is built. */
  madeOnTap: string;
  /** '{format}' is PNG or JPG. */
  downloadOne: string;
  /** '{count}' images, '{format}' is PNG or JPG. */
  downloadMany: string;
  /* parsePageSelector's errors, rebuilt from its code and params. */
  outOfRange: string;
  rangeOutOfRange: string;
  invalidPart: string;
  noValidPages: string;
  /* The shared page grid's own strings (as Split's). Not the bare Tailwind utility name for invertPages: src/i18n is a Tailwind @source. */
  invertPages: string;
  readyAnnouncement: string;
  /** The visible tooltip word of the per-page save action; its aria-label is downloadPageAria. */
  tipSave: string;
  /* The protected-file state (src/shell/NeedsUnlock.tsx): only a password stops this tool. */
  protectedNeedsPasswordTitle: string;
  protectedNeedsPasswordBody: string;
  protectedUnlockIt: string;
  protectedHandoffFailed: string;
  /** The heading's count: '1 image' / '{count} images'. */
  imageCountOne: string;
  imageCountOther: string;
  /** '{count}' images, '{format}' PNG or JPG: the noun phrase inside savedMany. */
  imagesMany: string;
  /** '{files}' is imagesMany. */
  savedMany: string;
}

export const englishToImageMessages: ToImageMessages = {
  lang: 'en',
  dir: 'ltr',
  formatLabel: 'Format',
  qualityLabel: 'Quality',
  qualityStandard: 'Standard',
  qualityStandardHint: '~72 DPI - smallest file size, fine for screen viewing.',
  qualityHigh: 'High',
  qualityHighHint: '~144 DPI - sharp on most screens, good default for printing.',
  qualityMaximum: 'Maximum',
  qualityMaximumHint: '~216 DPI - largest file size, best for zooming in or large prints.',
  layoutLabel: 'Output',
  layoutSeparate: 'One image per page',
  layoutCombined: 'One tall image',
  pagesLabel: 'Pages',
  pageSelectorPlaceholder: 'All pages, or e.g. 1-3, 5, 8-',
  formatPngHint: 'Sharp text and lines. Larger files.',
  formatJpgHint: 'Smaller files, best for photos.',
  layoutSeparateHint: 'Each page is saved as its own image.',
  layoutCombinedHint: 'The pages are stacked into one long image.',
  loadingPages: 'Loading document pages...',
  downloadPageAria: 'Download page {number}',
  openPreview: 'Open page {number} larger',
  previewTitle: 'Page {number} of {total}',
  previewClose: 'Close',
  previewPrev: 'Previous page',
  previewNext: 'Next page',
  previewLoading: 'Rendering the page…',
  convertFailed: 'The file may be damaged. Try another PDF.',
  buildFailed: 'Could not make the images. Tap to try again.',
  madeOnTap: 'Made when you tap',
  downloadOne: 'Download {format}',
  downloadMany: 'Download {count} {format}s',
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
  pageSkipped: 'Page {number} skipped. It stays here and is left out of the images.',
  previewIncludeAgain: 'Include it again',
  previewSkippedBanner: 'Left out of the images',
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
  tipSave: 'Save',
  protectedNeedsPasswordTitle: 'This PDF has a password',
  protectedNeedsPasswordBody: 'Unlock opens it on your device, then you can turn it into images.',
  protectedUnlockIt: 'Unlock it',
  protectedHandoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
  imageCountOne: '1 image',
  imageCountOther: '{count} images',
  imagesMany: '{count} {format}s',
  savedMany: 'Saved {files}',
  allSkipped: 'Every page is skipped',
  downloadLabel: 'Download 1 image',
  downloadAgain: 'download again',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} rendered',
  savedLabel: 'Saved',
  undo: 'Undo',
  redo: 'Redo',
  undoLabel: 'Undo last change',
  redoLabel: 'Redo last undone change',
  includeAll: 'Include all',
  skipAll: 'Skip all',
  invertPages: 'Invert',
  allIncluded: 'All pages included.',
  inverted: 'Included and skipped pages swapped.',
  documentHeading: 'Your images',
  downloadShort: 'Download',
  readyAnnouncement: 'Your images are ready.',
  sharedSuccessfully: 'Images shared successfully.',
  sharingCanceled: 'Sharing canceled. Your images are still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  undoneAnnouncement: 'Undid last change.',
  redoneAnnouncement: 'Redid last change.',
  loaded: 'Loaded PDF file "{name}" with {count} pages.',
  loadFailed: 'Failed to load PDF file.',
  announceNeedsPassword: 'This PDF has a password',
  closeStrip: 'Close',
  shareLabel: 'Share',
};

// An AI draft, not reviewed copy: pairs with he/pdf-to-image.yaml and awaits
// Shlomi's read. Terms follow Merge's, Compress's and Split's Hebrew
// catalogues for shared ideas (הורדה, שיתוף, עמודים, הסרת נעילה).
export const hebrewToImageMessages: ToImageMessages = {
  lang: 'he',
  dir: 'rtl',
  formatLabel: 'פורמט',
  qualityLabel: 'איכות',
  qualityStandard: 'רגילה',
  qualityStandardHint: 'כ-72 DPI - הקובץ הקטן ביותר, מספיק לצפייה במסך.',
  qualityHigh: 'גבוהה',
  qualityHighHint: 'כ-144 DPI - חדה ברוב המסכים, ברירת מחדל טובה להדפסה.',
  qualityMaximum: 'מקסימלית',
  qualityMaximumHint: 'כ-216 DPI - הקובץ הגדול ביותר, הכי טובה להגדלה או להדפסה גדולה.',
  layoutLabel: 'פלט',
  layoutSeparate: 'תמונה לכל עמוד',
  layoutCombined: 'תמונה אחת ארוכה',
  pagesLabel: 'עמודים',
  // RLI around the sentence, LRI around the example: the input is dir=ltr so typed digits
  // stay in order, and a bare Hebrew placeholder would scramble the range's punctuation there.
  pageSelectorPlaceholder: '\u2067כל העמודים, או לדוגמה \u20661-3, 5, 8-\u2069\u2069',
  formatPngHint: 'טקסט וקווים חדים. קבצים גדולים יותר.',
  formatJpgHint: 'קבצים קטנים יותר, מתאים במיוחד לתמונות.',
  layoutSeparateHint: 'כל עמוד נשמר כתמונה משלו.',
  layoutCombinedHint: 'העמודים מונחים זה על זה בתמונה ארוכה אחת.',
  loadingPages: 'טוענים את עמודי המסמך...',
  downloadPageAria: 'הורדת עמוד {number}',
  openPreview: 'הגדלת עמוד {number}',
  previewTitle: 'עמוד {number} מתוך {total}',
  previewClose: 'סגירה',
  previewPrev: 'העמוד הקודם',
  previewNext: 'העמוד הבא',
  previewLoading: 'מציירים את העמוד…',
  convertFailed: 'ייתכן שהקובץ פגום. נסו קובץ PDF אחר.',
  buildFailed: 'לא הצלחנו ליצור את התמונות. הקישו כדי לנסות שוב.',
  madeOnTap: 'נוצרות כשמקישים',
  downloadOne: 'הורדת {format}',
  downloadMany: 'הורדת {count} קובצי {format}',
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
  pageSkipped: 'דילגנו על עמוד {number}. הוא נשאר כאן ולא ייכלל בתמונות.',
  previewIncludeAgain: 'להחזיר אותו',
  previewSkippedBanner: 'לא ייכלל בתמונות',
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
  tipSave: 'שמירה',
  protectedNeedsPasswordTitle: 'לקובץ ה-PDF הזה יש סיסמה',
  protectedNeedsPasswordBody: 'הסרת הנעילה פותחת אותו במכשיר שלכם, ואז אפשר להפוך אותו לתמונות.',
  protectedUnlockIt: 'הסרת נעילה',
  protectedHandoffFailed: 'לא הצלחנו לפתוח את הקובץ בכלי הסרת הנעילה. פתחו את הכלי ובחרו אותו שם.',
  imageCountOne: 'תמונה אחת',
  imageCountOther: '{count} תמונות',
  imagesMany: '{count} קובצי {format}',
  savedMany: 'נשמרו {files}',
  allSkipped: 'כל העמודים נסתרים',
  downloadLabel: 'הורדת תמונה אחת',
  downloadAgain: 'הורדה שוב',
  preparingPages: '{count} עמודים בעבודה…',
  renderProgress: '{done} מתוך {total} נוצרו',
  savedLabel: 'נשמר',
  undo: 'ביטול',
  redo: 'ביצוע מחדש',
  undoLabel: 'ביטול השינוי האחרון',
  redoLabel: 'ביצוע מחדש של השינוי שבוטל',
  includeAll: 'הוסף הכול',
  skipAll: 'דלג על הכול',
  invertPages: 'היפוך',
  allIncluded: 'כל העמודים כלולים.',
  inverted: 'העמודים הכלולים והנסתרים התחלפו.',
  documentHeading: 'התמונות שלכם',
  downloadShort: 'הורדה',
  readyAnnouncement: 'התמונות שלכם מוכנות.',
  sharedSuccessfully: 'התמונות שותפו.',
  sharingCanceled: 'השיתוף בוטל. התמונות עדיין מוכנות.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  undoneAnnouncement: 'השינוי האחרון בוטל',
  redoneAnnouncement: 'השינוי בוצע מחדש',
  loaded: 'הקובץ "{name}" נטען, {count} עמודים.',
  loadFailed: 'טעינת קובץ ה-PDF נכשלה.',
  announceNeedsPassword: 'ה-PDF הזה מוגן בסיסמה',
  closeStrip: 'סגירה',
  shareLabel: 'שיתוף',
};

const toImageMessages: Partial<Record<DocumentationLocaleId, ToImageMessages>> = {
  en: englishToImageMessages,
  he: hebrewToImageMessages,
};

export function getToImageMessages(locale: DocumentationLocaleId): ToImageMessages {
  return toImageMessages[locale] ?? englishToImageMessages;
}
