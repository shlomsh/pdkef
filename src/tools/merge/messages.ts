import type { DocumentationLocaleId } from '../../i18n/documentationLocales';
import type { PageGridMessages, DownloadMessages } from '#shell/shellMessages.ts';

export interface MergeMessages extends PageGridMessages, DownloadMessages {
  /** Text direction; a size inside a sentence is bidi-isolated when 'rtl'. */
  dir: 'ltr' | 'rtl';
  skippedOne: string;
  skippedMany: string;
  addPageNumbers: string;
  reorderHint: string;
  dragHandleLabel: string;
  removeLabel: string;
  /** Merge's 'one-file' Download state needs it; DownloadMessages leaves it optional. */
  addOneMore: string;
  mergedReady: string;
  filesAddedOne: string;
  filesAddedMany: string;
  fileRemoved: string;
  fileMovedTo: string;
  filesReordered: string;
  cleared: string;
  sharedSuccessfully: string;
  sharingCanceled: string;
  shareError: string;
  fileSummaryOne: string;
  fileSummaryMany: string;
  /* MERGE-06 / MERGE-11 / Direction A wave 2 (Shlomi): one Sort control (a
   * native select), Reverse folded into it as its own option, and an Options
   * disclosure collapsed by default. */
  sortLabel: string;
  /** Visible lead-in for the Sort select where it stands alone in the
   * phone popover, so "As added" reads as an order of files rather than as
   * a setting of its own (Shlomi, 2026-09-13). */
  sortFilesLabel: string;
  sortAsAdded: string;
  sortReversed: string;
  sortNameAsc: string;
  sortNameDesc: string;
  sortDateAsc: string;
  sortDateDesc: string;
  /** MERGE-11 (2026-09-13, Shlomi): the output name is editable in place in
   * the document heading - a WYSIWYG name span, not a bordered input, so
   * there is no separate "rename" button label to carry `{name}`. One label
   * covers the name at rest and while editing: it is a textbox (role
   * changes, the label does not) either way. */
  fileNameEditableLabel: string;
  /* MERGE-12: Download is the only primary control. `preparing` labels the
   * progress ring shown when the tap arrives before the pre-merge finished. */
  /* MERGE-24: the quiet Download in the phone and tablet file bar; one word, as in Sign's toolbar. */
  downloadShort: string;
  preparing: string;
  startAgain: string;
  /* MERGE-04: the failed file is named, with one action. */
  errorUnreadable: string;
  errorEncrypted: string;
  unlockLink: string;
  removeAndMergeRest: string;
  /* A lone protected file shows the shared locked state (src/shell/NeedsUnlock.tsx) in place of the result. */
  protectedNeedsPasswordTitle: string;
  protectedNeedsPasswordBody: string;
  protectedOwnerOnlyTitle: string;
  protectedOwnerOnlyBody: string;
  protectedUnlockIt: string;
  protectedHandoffFailed: string;
  errorTooLarge: string;
  rowUnreadable: string;
  rowEncrypted: string;
  /* GRID-03: the Undo / Redo pair in the document header. */
  undo: string;
  redo: string;
  undoLabel: string;
  redoLabel: string;
  undoneAnnouncement: string;
  redoneAnnouncement: string;
  /* MERGE-07: duplicate nudge. */
  alreadyAdded: string;
  addAnyway: string;
  pageCountUnknown: string;
  /* MERGE-09: once a page crosses a file boundary the list can no longer be
   * dragged as whole files; this note and its one action replace the sort row. */
  pagesRearranged: string;
  resetOrder: string;
  /* MERGE-08 / MERGE-09: the page strip and its per-page controls. */
  pagesHeading: string;
  /** Visible (not sr-only, unlike reorderHint/stripHint above) touch hint:
   * both the phone chip row and the page grid drag on press-and-hold with no
   * grip icon of their own to show it, so mobile has nothing telling anyone
   * dragging works at all. Shown only under a coarse pointer (see
   * `.touch-drag-hint` in PageWorkspace.module.css). */
  touchDragHint: string;
  fileTag: string;
  /* MERGE-14: two quiet verbs under Download (Split was dropped on review:
   * after page-level shuffle and skip it is not the next step); MERGE-17: one
   * quiet line after the first result in this browser. */
  handoffCompress: string;
  /** Direction A: the Share button in the rail's hand-off row; short, since
   * it shares one row with Compress, Sign and Options on a phone. */
  shareLabel: string;
  handoffSign: string;
  handoffFailed: string;
  /** MERGE-24: the close button on the phone done strip. */
  closeStrip: string;
  installLine: string;
  installWithPrompt: string;
  installLink: string;
  installIos: string;
  installOther: string;
  /* Direction A (2026-09-13): the document-centred layout. Document header,
   * rail, per-file captions and the Download element's own states. */
  pickedUp: string;
  startFresh: string;
  documentHeading: string;
  renderedCount: string;
  shortcutsLine: string;
  /* Direction A wave 2 (Shlomi's reduction, 2026-09-13): the drag-anywhere
   * overlay once the add bar is gone, and the phone chip row's "more" menu. */
  dropAnywhereNote: string;
  moreOptions: string;
  /** Shlomi's follow-up (2026-09-13): the empty state's heading and body copy
   * (BasePdfTool's `emptyHeading` / `emptyBody`, rendered by DropzoneEmptyState). */
  emptyHeading: string;
  /** The empty state's own headline, the one a phone shows (MERGE-22: photos too). */
  dropHere: string;
  emptyBody: string;
}

export const englishMergeMessages: MergeMessages = {
  dir: 'ltr',
  skippedOne: 'Skipped "{name}" - not a PDF or a JPEG or PNG photo.',
  skippedMany: 'Skipped {count} files - not PDFs or JPEG or PNG photos.',
  addPageNumbers: 'Add page numbers',
  reorderHint: 'Drag a file by its handle to reorder, or focus a file and press the arrow up or down keys to move it.',
  dragHandleLabel: '{name}, position {position} of {total}. Drag, or press arrow up or down to move.',
  removeLabel: 'Remove {name}',
  addOneMore: 'Add one more file to merge',
  mergedReady: 'Your merged PDF is ready.',
  filesAddedOne: '1 file added.',
  filesAddedMany: '{count} files added.',
  fileRemoved: '{name} removed.',
  fileMovedTo: '{name} moved to position {position} of {total}.',
  filesReordered: 'Files reordered.',
  cleared: 'Cleared. Add PDFs or photos to start again.',
  sharedSuccessfully: 'Merged PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your merged PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  fileSummaryOne: '1 file',
  fileSummaryMany: '{count} files',
  sortLabel: 'Sort',
  sortFilesLabel: 'File order',
  sortAsAdded: 'As added',
  sortReversed: 'Reversed',
  sortNameAsc: 'Name A to Z',
  sortNameDesc: 'Name Z to A',
  sortDateAsc: 'Oldest first',
  sortDateDesc: 'Newest first',
  fileNameEditableLabel: 'File name, editable',
  downloadLabel: 'Download merged PDF',
  downloadShort: 'Download',
  preparing: 'Preparing…',
  startAgain: 'Start again',
  errorUnreadable: '"{name}" could not be read. It may be damaged.',
  errorEncrypted: '"{name}" is password-protected. Remove the password first, on your device, then add it again.',
  unlockLink: 'Open Unlock',
  removeAndMergeRest: 'Remove it and merge the rest',
  protectedNeedsPasswordTitle: 'This PDF has a password',
  protectedNeedsPasswordBody: 'Unlock opens it on your device, then you can merge it.',
  protectedOwnerOnlyTitle: 'This PDF is protected',
  protectedOwnerOnlyBody: "It opens without a password, but Merge can't change it as it is. Unlock takes the protection off on your device, then you can merge it.",
  protectedUnlockIt: 'Unlock it',
  protectedHandoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
  errorTooLarge: 'This set is too large for this device to merge in the browser. Try fewer files at a time.',
  rowUnreadable: 'Could not read',
  rowEncrypted: 'Password-protected',
  undo: 'Undo',
  redo: 'Redo',
  undoLabel: 'Undo last change',
  redoLabel: 'Redo last undone change',
  undoneAnnouncement: 'Undid last change.',
  redoneAnnouncement: 'Redid last change.',
  alreadyAdded: '"{name}" is already in the list.',
  addAnyway: 'Add anyway',
  pageCountUnknown: 'Reading…',
  pagesRearranged: 'Pages moved across files',
  resetOrder: 'Reset order',
  pagesHeading: 'Pages',
  stripHint: 'Drag a page to reorder, or focus a page and press the left or right arrow keys to move it, R to rotate it, Delete to skip it.',
  touchDragHint: 'Touch and hold a file or page, then drag to reorder.',
  fileTag: 'File {number}',
  pageItemLabel: 'Page {number} of {total}, from {file}{state}',
  skippedState: ', skipped',
  skippedBadge: 'Skipped',
  skippedCountOne: '1 page skipped',
  skippedCountOther: '{count} pages skipped',
  rotatePage: 'Rotate page {number}',
  skipPage: 'Hide page {number} from the merged PDF',
  includePage: 'Show page {number} in the merged PDF',
  openPreview: 'Open page {number} larger',
  pageSkipped: 'Page {number} skipped. It stays here and is left out of the download.',
  pageIncluded: 'Page {number} included again.',
  pageRotated: 'Page {number} rotated to {degrees} degrees.',
  pageMoved: 'Page moved to position {position} of {total}.',
  previewTitle: 'Page {number} of {total}',
  previewClose: 'Close',
  previewPrev: 'Previous page',
  previewNext: 'Next page',
  previewLoading: 'Rendering the page…',
  previewSkippedBanner: 'Excluded from the merged file',
  previewSkippedNote: 'Left out of the download.',
  previewIncludeAgain: 'Include it again',
  handoffCompress: 'Compress',
  shareLabel: 'Share',
  handoffSign: 'Sign',
  // MEM-03: handoffConfirm* (the "Replace the saved draft?" warning) is gone
  // - MEM-02 dropped its last consumer in PdfMergeTool.tsx alongside the
  // same one-memory-space change this file's Replace-dialog copy reflects.
  handoffFailed: 'Could not hand the file over. Download it instead.',
  closeStrip: 'Close',
  installLine: 'This page is saved in your browser now, so merging works even without a connection.',
  installWithPrompt: 'You can also {install} it like an app.',
  installLink: 'install',
  installIos: 'To keep it on your home screen, tap Share, then Add to Home Screen.',
  installOther: 'To keep it on your home screen, look for Install or Add to Home Screen in your browser menu.',
  pickedUp: 'Picked up where you left off',
  startFresh: 'Start fresh',
  documentHeading: 'Your merged PDF',
  renderedCount: '{count} rendered',
  shortcutsLine: '← → move · R rotate · Del skip',
  captionPages: 'pages {from} to {to}',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} rendered',
  savedLabel: 'Saved',
  downloadAgain: 'download again',
  buildFailed: 'Fix the file above to merge',
  allSkipped: 'Every page is skipped',
  dropAnywhereNote: 'Drop anywhere, or paste',
  moreOptions: 'More options',
  emptyHeading: 'Drop PDFs or photos here, or paste',
  dropHere: 'Drop PDFs or photos here',
  emptyBody: 'Your pages appear here, in order, before you download. Files never leave your device.',
  tipRotate: 'Rotate',
  tipSkip: 'Hide',
  tipBringBack: 'Show',
  tipOpen: 'Open',
};

// LOC-02's own throwaway draft fixture (proves the route end to end for
// /he/merge/, per LOC-02.md's acceptance list) - not reviewed, not the
// island catalogue LOC-03 will ship. Do not treat these values as approved
// copy; the merge.yaml fixture they pair with is a draft for the same reason.
export const hebrewMergeMessages: MergeMessages = {
  dir: 'rtl',
  skippedOne: 'דילגנו על "{name}" - זה לא PDF ולא תמונת JPEG או PNG.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא PDF ולא תמונות JPEG או PNG.',
  addPageNumbers: 'הוספת מספרי עמודים',
  reorderHint: 'גררו קובץ מהידית שלו כדי לסדר מחדש, או התמקדו בקובץ ולחצו על חץ למעלה או למטה כדי להזיז אותו.',
  dragHandleLabel: '{name}, מקום {position} מתוך {total}. גררו, או לחצו על חץ למעלה או למטה כדי להזיז.',
  removeLabel: 'הסרת {name}',
  addOneMore: 'הוסיפו עוד קובץ אחד כדי לאחד',
  mergedReady: 'ה-PDF המאוחד מוכן.',
  filesAddedOne: 'נוסף קובץ אחד.',
  filesAddedMany: 'נוספו {count} קבצים.',
  fileRemoved: '{name} הוסר.',
  fileMovedTo: '{name} עבר למקום {position} מתוך {total}.',
  filesReordered: 'הקבצים סודרו מחדש.',
  cleared: 'הרשימה נוקתה. הוסיפו קבצי PDF או תמונות כדי להתחיל מחדש.',
  sharedSuccessfully: 'ה-PDF המאוחד שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF המאוחד עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  fileSummaryOne: 'קובץ אחד',
  fileSummaryMany: '{count} קבצים',
  // MERGE-02..12 (2026-09-13): AI draft, not reviewed copy, same caveat as
  // the rest of this catalogue. Flagged for Shlomi's review in the epic report.
  sortLabel: 'מיון',
  sortFilesLabel: 'סדר הקבצים',
  sortAsAdded: 'לפי סדר ההוספה',
  sortReversed: 'הפוך',
  sortNameAsc: 'שם, א עד ת',
  sortNameDesc: 'שם, ת עד א',
  sortDateAsc: 'הישן ביותר קודם',
  sortDateDesc: 'החדש ביותר קודם',
  fileNameEditableLabel: 'שם הקובץ, ניתן לעריכה',
  downloadLabel: 'הורדת ה-PDF המאוחד',
  downloadShort: 'הורדה',
  preparing: 'מכינים…',
  startAgain: 'להתחיל מחדש',
  errorUnreadable: 'לא הצלחנו לקרוא את "{name}". ייתכן שהקובץ פגום.',
  errorEncrypted: '"{name}" מוגן בסיסמה. הסירו קודם את הסיסמה, על המכשיר שלכם, ואז הוסיפו אותו שוב.',
  unlockLink: 'לפתיחת כלי ההסרה',
  removeAndMergeRest: 'להסיר אותו ולאחד את השאר',
  protectedNeedsPasswordTitle: 'לקובץ ה-PDF הזה יש סיסמה',
  protectedNeedsPasswordBody: 'הסרת הנעילה פותחת אותו במכשיר שלכם, ואז אפשר לאחד אותו.',
  protectedOwnerOnlyTitle: 'קובץ ה-PDF הזה נעול',
  protectedOwnerOnlyBody: 'הוא נפתח בלי סיסמה, אבל אי אפשר לאחד אותו כמו שהוא. הסרת הנעילה מורידה את ההגנה במכשיר שלכם, ואז אפשר לאחד אותו.',
  protectedUnlockIt: 'הסרת נעילה',
  protectedHandoffFailed: 'לא הצלחנו לפתוח את הקובץ בכלי הסרת הנעילה. פתחו את הכלי ובחרו אותו שם.',
  errorTooLarge: 'הסט הזה גדול מדי לאיחוד בדפדפן על המכשיר הזה. נסו פחות קבצים בכל פעם.',
  rowUnreadable: 'לא ניתן לקרוא',
  rowEncrypted: 'מוגן בסיסמה',
  undo: 'ביטול',
  redo: 'ביצוע מחדש',
  undoLabel: 'ביטול השינוי האחרון',
  redoLabel: 'ביצוע מחדש של השינוי שבוטל',
  undoneAnnouncement: 'השינוי האחרון בוטל',
  redoneAnnouncement: 'השינוי בוצע מחדש',
  alreadyAdded: '"{name}" כבר ברשימה.',
  addAnyway: 'להוסיף בכל זאת',
  pageCountUnknown: 'קוראים…',
  pagesRearranged: 'העמודים סודרו מחדש בין הקבצים, אז הקבצים כבר לא זזים כיחידה אחת.',
  resetOrder: 'איפוס הסדר',
  pagesHeading: 'עמודים',
  stripHint: 'גררו עמוד כדי לסדר מחדש, או התמקדו בעמוד ולחצו על חץ שמאלה או ימינה כדי להזיז אותו, R כדי לסובב, Delete כדי לדלג עליו.',
  touchDragHint: 'לחצו והחזיקו קובץ או עמוד, ואז גררו כדי לשנות את הסדר.',
  fileTag: 'קובץ {number}',
  pageItemLabel: 'עמוד {number} מתוך {total}, מתוך {file}{state}',
  skippedState: ', נסתר',
  skippedBadge: 'נסתר',
  skippedCountOne: 'עמוד אחד נסתר',
  skippedCountOther: '{count} עמודים נסתרים',
  rotatePage: 'סיבוב עמוד {number}',
  skipPage: 'הסתרת עמוד {number} מה-PDF המאוחד',
  includePage: 'הצגת עמוד {number} ב-PDF המאוחד',
  openPreview: 'הגדלת עמוד {number}',
  pageSkipped: 'דילגנו על עמוד {number}. הוא נשאר כאן ולא ייכלל בהורדה.',
  pageIncluded: 'עמוד {number} הוחזר.',
  pageRotated: 'עמוד {number} סובב ל-{degrees} מעלות.',
  pageMoved: 'העמוד עבר למקום {position} מתוך {total}.',
  previewTitle: 'עמוד {number} מתוך {total}',
  previewClose: 'סגירה',
  previewPrev: 'העמוד הקודם',
  previewNext: 'העמוד הבא',
  previewLoading: 'מציירים את העמוד…',
  previewSkippedBanner: 'לא ייכלל בקובץ המאוחד',
  previewSkippedNote: 'לא ייכלל בהורדה.',
  previewIncludeAgain: 'להחזיר אותו',
  handoffCompress: 'כיווץ',
  shareLabel: 'שיתוף',
  handoffSign: 'חתימה',
  handoffFailed: 'לא הצלחנו להעביר את הקובץ. הורידו אותו במקום.',
  closeStrip: 'סגירה',
  installLine: 'הדף הזה שמור עכשיו בדפדפן, אז האיחוד עובד גם בלי חיבור לאינטרנט.',
  installWithPrompt: 'אפשר גם {install} אותו כמו אפליקציה.',
  installLink: 'להתקין',
  installIos: 'כדי לשמור אותו במסך הבית, לחצו על שיתוף ואז על הוספה למסך הבית.',
  installOther: 'כדי לשמור אותו במסך הבית, חפשו "התקנה" או "הוספה למסך הבית" בתפריט הדפדפן.',
  // Direction A (2026-09-13): AI draft, not reviewed copy, same caveat as the
  // rest of this catalogue.
  pickedUp: 'המשכנו מהמקום שבו הפסקתם',
  startFresh: 'להתחיל מחדש',
  documentHeading: 'ה-PDF המאוחד שלכם',
  renderedCount: '{count} עומדים לרינדור',
  shortcutsLine: '← → הזזה · R סיבוב · Del דילוג',
  captionPages: 'עמודים {from} עד {to}',
  preparingPages: 'מכינים {count} עמודים…',
  renderProgress: '{done} מתוך {total} נוצרו',
  savedLabel: 'נשמר',
  downloadAgain: 'הורדה שוב',
  buildFailed: 'תקנו את הקובץ למעלה כדי לאחד',
  allSkipped: 'כל העמודים נסתרים',
  dropAnywhereNote: 'שחררו בכל מקום, או הדביקו',
  moreOptions: 'עוד אפשרויות',
  emptyHeading: 'שחררו כאן קבצי PDF או תמונות, או הדביקו',
  dropHere: 'גררו לכאן קבצי PDF או תמונות',
  emptyBody: 'העמודים שלכם יופיעו כאן, לפי הסדר, לפני ההורדה. הקבצים לא עוזבים את המכשיר שלכם.',
  tipRotate: 'סיבוב',
  tipSkip: 'הסתרה',
  tipBringBack: 'הצגה',
  tipOpen: 'פתיחה',
};

const mergeMessages: Partial<Record<DocumentationLocaleId, MergeMessages>> = {
  en: englishMergeMessages,
  he: hebrewMergeMessages,
};

export function getMergeMessages(locale: DocumentationLocaleId): MergeMessages {
  return mergeMessages[locale] ?? englishMergeMessages;
}
