/**
 * LOC-02: message catalogues for the tool islands that have one. Mirrors
 * documentationMessages.ts's shape (a typed English-default object per
 * locale, in one file the reviewer pass touches) but for the strings a
 * Preact island itself renders, rather than the static shell around it.
 *
 * These are NOT part of the localizedTools content collection: the YAML
 * entries own the page's crawlable copy (title, h1, FAQ...), validated
 * against src/data/tools.js by content.config.ts's schema. An island's
 * button labels and live-region announcements are a different surface with
 * a different reviewer concern (they're never read by a crawler, since the
 * island's client-side interactions are what produces them), so they get
 * their own small table here instead of being smuggled into the SEO schema.
 *
 * Every string may carry `{placeholder}` tokens; interpolate with `format()`
 * rather than template-literal-ing user data into the object itself, so the
 * object stays a plain, JSON-serializable prop (Astro serializes island
 * props as JSON - a function couldn't cross that boundary at all).
 */
import type { DocumentationLocaleId } from './documentationLocales';

export function formatMessage(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

/**
 * LOC-16: the one place a Sign element/tool id resolves to its displayed
 * name, reused everywhere a description or announcement would otherwise
 * interpolate a raw id (`.claude/rules/editor.md`'s "never interpolate a raw
 * tool id into copy" - the bug this ticket's useWorkspaceGestures.ts fix and
 * PdfSignTool.tsx/PdfWorkspace.tsx's history descriptions all share). Takes
 * the already-merged `SignMessages` so callers outside SignToolbar.tsx (which
 * builds its own richer TOOL_COPY for arm-hints) get the same button/shape
 * labels without a second catalogue of tool names.
 */
export function signElementTypeLabel(t: SignMessages, type: string): string {
  switch (type) {
    case 'text': return t.textButton;
    case 'symbol': return t.symbolsButton;
    case 'signature': return t.signButton;
    case 'whiteout': return t.whiteoutButton;
    case 'ellipse': return t.ellipseLabel;
    case 'rectangle': return t.rectangleLabel;
    case 'line': return t.lineLabel;
    default: return type;
  }
}

export interface MergeMessages {
  skippedOne: string;
  skippedMany: string;
  addPageNumbers: string;
  reorderHint: string;
  dragHandleLabel: string;
  removeLabel: string;
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
  downloadLabel: string;
  preparing: string;
  startAgain: string;
  /* MERGE-04: the failed file is named, with one action. */
  errorUnreadable: string;
  errorEncrypted: string;
  unlockLink: string;
  removeAndMergeRest: string;
  errorTooLarge: string;
  rowUnreadable: string;
  rowEncrypted: string;
  /* MERGE-07: undo on remove, duplicate nudge. */
  removedUndo: string;
  undo: string;
  alreadyAdded: string;
  addAnyway: string;
  pageCountUnknown: string;
  /* MERGE-09: once a page crosses a file boundary the list can no longer be
   * dragged as whole files; this note and its one action replace the sort row. */
  pagesRearranged: string;
  resetOrder: string;
  /* MERGE-08 / MERGE-09: the page strip and its per-page controls. */
  pagesHeading: string;
  stripHint: string;
  /** Visible (not sr-only, unlike reorderHint/stripHint above) touch hint:
   * both the phone chip row and the page grid drag on press-and-hold with no
   * grip icon of their own to show it, so mobile has nothing telling anyone
   * dragging works at all. Shown only under a coarse pointer (see
   * `.touch-drag-hint` in MergeDocument.module.css). */
  touchDragHint: string;
  fileTag: string;
  pageItemLabel: string;
  skippedState: string;
  skippedBadge: string;
  rotatePage: string;
  skipPage: string;
  includePage: string;
  openPreview: string;
  pageSkipped: string;
  pageIncluded: string;
  pageRotated: string;
  pageMoved: string;
  previewTitle: string;
  previewClose: string;
  previewPrev: string;
  previewNext: string;
  previewLoading: string;
  previewSkippedBanner: string;
  previewSkippedNote: string;
  previewIncludeAgain: string;
  /* MERGE-14: two quiet verbs under Download (Split was dropped on review:
   * after page-level shuffle and skip it is not the next step); MERGE-17: one
   * quiet line after the first result in this browser. */
  handoffCompress: string;
  /** Direction A: the Share button in the rail's hand-off row; short, since
   * it shares one row with Compress it, Sign it and Options on a phone. */
  shareLabel: string;
  handoffSign: string;
  handoffFailed: string;
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
  captionPages: string;
  preparingPages: string;
  renderProgress: string;
  savedLabel: string;
  downloadAgain: string;
  fixFileToMerge: string;
  pageSkippedUndo: string;
  pageRotatedUndo: string;
  pageMovedUndo: string;
  /* Direction A wave 2 (Shlomi's reduction, 2026-09-13): the drag-anywhere
   * overlay once the add bar is gone, and the phone chip row's "more" menu. */
  dropAnywhereNote: string;
  moreOptions: string;
  /** Shlomi's follow-up (2026-09-13): the desktop-only empty-state band
   * (BasePdfTool's `emptyVariant="band"`, DropzoneEmptyState's band copy). */
  emptyHeading: string;
  emptyBody: string;
  /** Same follow-up, item 6: a small always-in-the-DOM tooltip word inside
   * each page action button (rotate/skip/open), shown on hover/focus - the
   * button's `aria-label` stays the real accessible name. */
  tipRotate: string;
  tipSkip: string;
  tipBringBack: string;
  tipOpen: string;
}

const englishMergeMessages: MergeMessages = {
  skippedOne: 'Skipped "{name}" - not a PDF.',
  skippedMany: 'Skipped {count} files - not PDFs.',
  addPageNumbers: 'Add page numbers',
  reorderHint: 'Drag a file by its handle to reorder, or focus a file and press the arrow up or down keys to move it.',
  dragHandleLabel: '{name}, position {position} of {total}. Drag, or press arrow up or down to move.',
  removeLabel: 'Remove {name}',
  addOneMore: 'Add one more PDF to merge',
  mergedReady: 'Your merged PDF is ready.',
  filesAddedOne: '1 file added.',
  filesAddedMany: '{count} files added.',
  fileRemoved: '{name} removed.',
  fileMovedTo: '{name} moved to position {position} of {total}.',
  filesReordered: 'Files reordered.',
  cleared: 'Cleared. Add PDFs to start again.',
  sharedSuccessfully: 'Merged PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your merged PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  fileSummaryOne: '1 PDF',
  fileSummaryMany: '{count} PDFs',
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
  preparing: 'Preparing…',
  startAgain: 'Start again',
  errorUnreadable: '"{name}" could not be read. It may be damaged, or not a PDF after all.',
  errorEncrypted: '"{name}" is password-protected. Remove the password first, on your device, then add it again.',
  unlockLink: 'Open Unlock',
  removeAndMergeRest: 'Remove it and merge the rest',
  errorTooLarge: 'This set is too large for this device to merge in the browser. Try fewer files at a time.',
  rowUnreadable: 'Could not read',
  rowEncrypted: 'Password-protected',
  removedUndo: 'Removed {name}',
  undo: 'Undo',
  alreadyAdded: '"{name}" is already in the list.',
  addAnyway: 'Add anyway',
  pageCountUnknown: 'Reading…',
  pagesRearranged: 'Pages were rearranged across files, so the files no longer move as a whole.',
  resetOrder: 'Reset order',
  pagesHeading: 'Pages',
  stripHint: 'Drag a page to reorder, or focus a page and press the left or right arrow keys to move it, R to rotate it, Delete to skip it.',
  touchDragHint: 'Press and hold to drag files or pages into a new order.',
  fileTag: 'File {number}',
  pageItemLabel: 'Page {number} of {total}, from {file}{state}',
  skippedState: ', skipped',
  skippedBadge: 'Skipped',
  rotatePage: 'Rotate page {number}',
  skipPage: 'Skip page {number}',
  includePage: 'Include page {number} again',
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
  handoffCompress: 'Compress it',
  shareLabel: 'Share',
  handoffSign: 'Sign it',
  // MEM-03: handoffConfirm* (the "Replace the saved draft?" warning) is gone
  // - MEM-02 dropped its last consumer in PdfMergeTool.tsx alongside the
  // same one-memory-space change this file's Replace-dialog copy reflects.
  handoffFailed: 'Could not hand the file over. Download it instead.',
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
  fixFileToMerge: 'Fix the file above to merge',
  pageSkippedUndo: 'Skipped page {number}',
  pageRotatedUndo: 'Rotated page {number}',
  pageMovedUndo: 'Moved page {number}',
  dropAnywhereNote: 'Drop anywhere, or paste',
  moreOptions: 'More options',
  emptyHeading: 'Drop PDFs here, or paste',
  emptyBody: 'Your pages appear here, in order, before you download. Files never leave your device.',
  tipRotate: 'Rotate',
  tipSkip: 'Skip',
  tipBringBack: 'Bring back',
  tipOpen: 'Open',
};

// LOC-02's own throwaway draft fixture (proves the route end to end for
// /he/merge/, per LOC-02.md's acceptance list) - not reviewed, not the
// island catalogue LOC-03 will ship. Do not treat these values as approved
// copy; the merge.yaml fixture they pair with is a draft for the same reason.
const hebrewMergeMessages: MergeMessages = {
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא PDF.',
  addPageNumbers: 'הוספת מספרי עמודים',
  reorderHint: 'גררו קובץ מהידית שלו כדי לסדר מחדש, או התמקדו בקובץ ולחצו על חץ למעלה או למטה כדי להזיז אותו.',
  dragHandleLabel: '{name}, מקום {position} מתוך {total}. גררו, או לחצו על חץ למעלה או למטה כדי להזיז.',
  removeLabel: 'הסרת {name}',
  addOneMore: 'הוסיפו עוד PDF אחד כדי לאחד',
  mergedReady: 'ה-PDF המאוחד מוכן.',
  filesAddedOne: 'נוסף קובץ אחד.',
  filesAddedMany: 'נוספו {count} קבצים.',
  fileRemoved: '{name} הוסר.',
  fileMovedTo: '{name} עבר למקום {position} מתוך {total}.',
  filesReordered: 'הקבצים סודרו מחדש.',
  cleared: 'הרשימה נוקתה. הוסיפו קבצי PDF כדי להתחיל מחדש.',
  sharedSuccessfully: 'ה-PDF המאוחד שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF המאוחד עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  fileSummaryOne: 'PDF אחד',
  fileSummaryMany: '{count} קבצי PDF',
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
  preparing: 'מכינים…',
  startAgain: 'להתחיל מחדש',
  errorUnreadable: 'לא הצלחנו לקרוא את "{name}". ייתכן שהקובץ פגום, או שהוא בכלל לא PDF.',
  errorEncrypted: '"{name}" מוגן בסיסמה. הסירו קודם את הסיסמה, על המכשיר שלכם, ואז הוסיפו אותו שוב.',
  unlockLink: 'לפתיחת כלי ההסרה',
  removeAndMergeRest: 'להסיר אותו ולאחד את השאר',
  errorTooLarge: 'הסט הזה גדול מדי לאיחוד בדפדפן על המכשיר הזה. נסו פחות קבצים בכל פעם.',
  rowUnreadable: 'לא ניתן לקרוא',
  rowEncrypted: 'מוגן בסיסמה',
  removedUndo: '{name} הוסר',
  undo: 'ביטול',
  alreadyAdded: '"{name}" כבר ברשימה.',
  addAnyway: 'להוסיף בכל זאת',
  pageCountUnknown: 'קוראים…',
  pagesRearranged: 'העמודים סודרו מחדש בין הקבצים, אז הקבצים כבר לא זזים כיחידה אחת.',
  resetOrder: 'איפוס הסדר',
  pagesHeading: 'עמודים',
  stripHint: 'גררו עמוד כדי לסדר מחדש, או התמקדו בעמוד ולחצו על חץ שמאלה או ימינה כדי להזיז אותו, R כדי לסובב, Delete כדי לדלג עליו.',
  touchDragHint: 'לחצו והחזיקו כדי לגרור קובץ או עמוד למקום חדש.',
  fileTag: 'קובץ {number}',
  pageItemLabel: 'עמוד {number} מתוך {total}, מתוך {file}{state}',
  skippedState: ', מדולג',
  skippedBadge: 'מדולג',
  rotatePage: 'סיבוב עמוד {number}',
  skipPage: 'דילוג על עמוד {number}',
  includePage: 'החזרת עמוד {number}',
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
  handoffCompress: 'לכווץ אותו',
  shareLabel: 'שיתוף',
  handoffSign: 'לחתום עליו',
  handoffFailed: 'לא הצלחנו להעביר את הקובץ. הורידו אותו במקום.',
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
  renderProgress: '{done} מתוך {total} עומדו',
  savedLabel: 'נשמר',
  downloadAgain: 'הורדה שוב',
  fixFileToMerge: 'תקנו את הקובץ למעלה כדי לאחד',
  pageSkippedUndo: 'דולג עמוד {number}',
  pageRotatedUndo: 'סובב עמוד {number}',
  pageMovedUndo: 'הוזז עמוד {number}',
  dropAnywhereNote: 'שחררו בכל מקום, או הדביקו',
  moreOptions: 'עוד אפשרויות',
  emptyHeading: 'שחררו כאן קבצי PDF, או הדביקו',
  emptyBody: 'העמודים שלכם יופיעו כאן, לפי הסדר, לפני ההורדה. הקבצים לא עוזבים את המכשיר שלכם.',
  tipRotate: 'סיבוב',
  tipSkip: 'דילוג',
  tipBringBack: 'החזרה',
  tipOpen: 'פתיחה',
};

export interface CompressMessages {
  skippedOne: string;
  skippedMany: string;
  compressionOptionsLabel: string;
  ourPick: string;
  levelHighName: string;
  levelHighTag: string;
  levelHighDesc: string;
  levelHighPros: string;
  levelHighCons: string;
  levelMediumName: string;
  levelMediumTag: string;
  levelMediumDesc: string;
  levelMediumPros: string;
  levelMediumCons: string;
  levelLowName: string;
  levelLowTag: string;
  levelLowDesc: string;
  levelLowPros: string;
  levelLowCons: string;
  targetName: string;
  targetTag: string;
  targetDesc: string;
  targetPros: string;
  targetCons: string;
  targetBadge: string;
  targetSizeLabel: string;
  compress: string;
  compressing: string;
  addPdfToCompress: string;
  dropHint: string;
  compressionFailedTitle: string;
  compressionFailedBody: string;
  successTitle: string;
  originalSize: string;
  compressedSize: string;
  spaceSaved: string;
  savedPercent: string;
  noReduction: string;
  closestAchievable: string;
  rasterizeNotice: string;
  downloadLabel: string;
  shareLabel: string;
  loaded: string;
  starting: string;
  complete: string;
  failed: string;
  sharedSuccessfully: string;
  sharingCanceled: string;
  shareError: string;
  /* One island now accepts a PDF, JPEG or PNG (the board-epic-cleanup merge
   * of the standalone Compress Image tool into this one) and dispatches by
   * file type at runtime, so its message catalogue carries both flavours.
   * Every key below this line is the image half - added where a PDF and an
   * image result need genuinely different wording (a title, a failure
   * reason, a unit of work); a key above this line already reads correctly
   * for either kind (sizes, "compressing…", the shared shell strings) and is
   * not duplicated. See PdfCompressTool.tsx's `kind` dispatch. */
  compressImage: string;
  imageCompressionFailedBody: string;
  imageSuccessTitle: string;
  originalDimensions: string;
  outputDimensions: string;
  imageClosestAchievable: string;
  formatNotice: string;
  passthroughNotice: string;
  imageDownloadLabel: string;
  imageShareLabel: string;
  imageLoaded: string;
  imageStarting: string;
  imageComplete: string;
  missedTarget: string;
  imageFailed: string;
  imageSharedSuccessfully: string;
  imageSharingCanceled: string;
  /* Button anchor (SEO-25, 2026-09-12): DownloadButton's second line and the
   * compare toggle's two states. Shared by the PDF and image halves alike -
   * both compute the same shape of detail line and use the same toggle. */
  downloadDetailSmaller: string;
  downloadDetailClosest: string;
  compareShow: string;
  compareHide: string;
  compareRendering: string;
  compareRenderFailed: string;
  compareBeforeLabel: string;
  compareAfterLabel: string;
  compareCaptionImage: string;
  compareCaptionPdf: string;
}

const englishCompressMessages: CompressMessages = {
  skippedOne: 'Skipped "{name}" - not a PDF, JPG or PNG.',
  skippedMany: 'Skipped {count} files - not PDF, JPG or PNG files.',
  compressionOptionsLabel: 'Compression Options',
  ourPick: 'Our pick',
  levelHighName: 'Extreme Compression',
  levelHighTag: 'Smallest Size',
  levelHighDesc: 'Maximum file size reduction. Images will be downscaled to 72 DPI.',
  levelHighPros: 'Smallest file size (60-80% reduction)',
  levelHighCons: 'Lower resolution, images may look pixelated/fuzzy',
  levelMediumName: 'Recommended',
  levelMediumTag: 'Good Quality',
  levelMediumDesc: 'Optimal balance between size reduction and visual quality.',
  levelMediumPros: 'Excellent balance of size reduction (40-60%) & clarity',
  levelMediumCons: 'Slight loss of crispness when zoomed in',
  levelLowName: 'High Quality',
  levelLowTag: 'High Quality',
  levelLowDesc: 'Minimal compression. Keeps images crisp and clear at 150 DPI.',
  levelLowPros: 'Crisp images and clear text, close to original quality',
  levelLowCons: 'Minimal size reduction (10-30%)',
  targetName: 'Target Size',
  targetTag: 'Choose KB',
  targetDesc: 'Compress down to a specific file size, e.g. for a 100KB upload limit.',
  targetPros: 'Hits exact portal upload limits automatically',
  targetCons: 'Quality adjusts as needed to reach the size',
  targetBadge: 'Precise',
  targetSizeLabel: 'Target size',
  compress: 'Compress PDF',
  compressing: 'Compressing…',
  addPdfToCompress: 'Add a PDF or image above to compress',
  dropHint: 'Drop a PDF or image here',
  compressionFailedTitle: 'Compression failed.',
  compressionFailedBody: 'The file may be password-protected or corrupted. Please try another PDF.',
  successTitle: 'PDF Successfully Compressed!',
  originalSize: 'Original Size',
  compressedSize: 'Compressed Size',
  spaceSaved: 'Space Saved',
  savedPercent: 'Saved {percent}%',
  noReduction: 'No size reduction',
  closestAchievable: "Closest achievable size: {size} couldn't be reached without making the document unreadable, so this is the smallest readable result.",
  rasterizeNotice: 'Notice: Compression rasterizes PDF pages into images to reduce file size. Embedded links and text selection/copying will be disabled on the compressed document.',
  downloadLabel: 'Download Compressed PDF',
  shareLabel: 'Share Compressed PDF',
  loaded: 'File "{name}" loaded. Select a compression option to continue.',
  starting: 'Starting PDF compression...',
  complete: 'PDF compression complete. Your file is ready.',
  failed: 'PDF compression failed.',
  sharedSuccessfully: 'Compressed PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your compressed PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  compressImage: 'Compress Image',
  imageCompressionFailedBody: 'The file may be corrupted or an unsupported image. Please try another JPG or PNG.',
  imageSuccessTitle: 'Image Successfully Compressed!',
  originalDimensions: 'Original Dimensions',
  outputDimensions: 'Output Dimensions',
  imageClosestAchievable: "Closest achievable size: {size} couldn't be reached on this photo without making it unusable, so this is the smallest result found.",
  formatNotice: 'Notice: once compressed, the output is a JPEG. A transparent PNG background is filled in white, and re-encoding drops EXIF metadata, including location. A screenshot or scan of text can show visible JPEG artefacts, especially at a small target.',
  passthroughNotice: 'Already under the target, so the file is untouched: same file, same format, nothing re-encoded.',
  imageDownloadLabel: 'Download Compressed Image',
  imageShareLabel: 'Share Compressed Image',
  imageLoaded: 'File "{name}" loaded. Set a target size and compress.',
  imageStarting: 'Starting image compression...',
  imageComplete: 'Image compression complete. Your file is ready.',
  missedTarget: 'Target missed. Showing the smallest result found instead.',
  imageFailed: 'Image compression failed.',
  imageSharedSuccessfully: 'Compressed image shared successfully.',
  imageSharingCanceled: 'Sharing canceled. Your compressed image is still ready.',
  downloadDetailSmaller: '{size}, {percent}% smaller',
  downloadDetailClosest: 'closest achievable: {size}',
  compareShow: 'Compare with original',
  compareHide: 'Hide comparison',
  compareRendering: 'Rendering page 1 for comparison…',
  compareRenderFailed: "Couldn't render a preview for this file.",
  compareBeforeLabel: 'Original',
  compareAfterLabel: 'Compressed',
  compareCaptionImage: 'Drag to compare the original and the compressed image.',
  compareCaptionPdf: 'Drag to compare page 1. The rest of the document compresses the same way.',
};

/**
 * Per-tool, per-locale message tables. Adding a locale here does not publish
 * anything by itself - content.config.ts's reviewer/sourceHash gate on the
 * localizedTools entry is the publication gate; this only has to exist
 * before that entry's status can be 'published' (enforced in
 * src/pages/[locale]/[tool].astro).
 */
const mergeMessages: Partial<Record<DocumentationLocaleId, MergeMessages>> = {
  en: englishMergeMessages,
  he: hebrewMergeMessages,
};

// LOC-03: not yet reviewed by a native speaker in-house (see LOC-03.md's
// acceptance list, "the island message catalogues for Compress and Merge
// reviewed in the same pass") - pairs with he/compress.yaml's own draft
// status. Terminology follows the same SERP-derived vocabulary as that file
// ("כיווץ" as the lead term, "PDF" and file-size units left in Latin script,
// matching every incumbent on the Hebrew SERPs).
const hebrewCompressMessages: CompressMessages = {
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF, JPG או PNG.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא קבצי PDF, JPG או PNG.',
  compressionOptionsLabel: 'אפשרויות כיווץ',
  ourPick: 'הבחירה שלנו',
  levelHighName: 'כיווץ מקסימלי',
  levelHighTag: 'הגודל הקטן ביותר',
  levelHighDesc: 'ההקטנה המרבית האפשרית. תמונות יורדו לרזולוציה של 72 DPI.',
  levelHighPros: 'הקובץ הקטן ביותר (הקטנה של 60-80%)',
  levelHighCons: 'רזולוציה נמוכה יותר, תמונות עלולות להיראות מפוקסלות או מטושטשות',
  levelMediumName: 'מומלץ',
  levelMediumTag: 'איכות טובה',
  levelMediumDesc: 'האיזון האופטימלי בין הקטנת גודל לאיכות חזותית.',
  levelMediumPros: 'איזון מצוין בין הקטנת גודל (40-60%) לבהירות',
  levelMediumCons: 'ירידה קלה בחדות בהתקרבות',
  levelLowName: 'איכות גבוהה',
  levelLowTag: 'איכות גבוהה',
  levelLowDesc: 'כיווץ מינימלי. שומר על תמונות חדות וברורות ברזולוציה של 150 DPI.',
  levelLowPros: 'תמונות חדות וטקסט ברור, קרוב לאיכות המקורית',
  levelLowCons: 'הקטנת גודל מינימלית (10-30%)',
  targetName: 'גודל בהתאמה אישית',
  targetTag: 'גודל לבחירה בק״ב',
  targetDesc: 'כווצו לגודל קובץ מסוים, למשל למגבלת העלאה של 100KB.',
  targetPros: 'מגיע אוטומטית למגבלות העלאה מדויקות של פורטלים',
  targetCons: 'האיכות מותאמת לפי הצורך כדי להגיע לגודל',
  targetBadge: 'מדויק',
  targetSizeLabel: 'גודל בהתאמה אישית',
  compress: 'כיווץ PDF',
  compressing: 'מכווצים…',
  addPdfToCompress: 'בחרו קובץ למעלה כדי להמשיך',
  dropHint: 'גררו לכאן PDF או תמונה',
  compressionFailedTitle: 'הכיווץ נכשל.',
  compressionFailedBody: 'ייתכן שהקובץ מוגן בסיסמה או פגום. נסו קובץ PDF אחר.',
  successTitle: 'ה-PDF כווץ בהצלחה!',
  originalSize: 'גודל מקורי',
  compressedSize: 'גודל אחרי כיווץ',
  spaceSaved: 'נחסך',
  savedPercent: 'נחסכו {percent}%',
  noReduction: 'אין הקטנה בגודל',
  closestAchievable: 'הגודל הקרוב ביותר שהושג: לא הצלחנו להגיע ל-{size} בלי להפוך את המסמך לבלתי קריא, אז זו התוצאה הקריאה הכי קטנה.',
  rasterizeNotice: 'שימו לב: הכיווץ הופך את עמודי ה-PDF לתמונות כדי להקטין את גודל הקובץ. קישורים מוטבעים וחיפוש/העתקת טקסט יהיו מושבתים במסמך המכווץ.',
  downloadLabel: 'הורדת PDF מכווץ',
  shareLabel: 'שיתוף PDF מכווץ',
  loaded: 'הקובץ "{name}" נטען. בחרו אפשרות כיווץ כדי להמשיך.',
  starting: 'מתחילים בכיווץ ה-PDF...',
  complete: 'כיווץ ה-PDF הושלם. הקובץ שלכם מוכן.',
  failed: 'כיווץ ה-PDF נכשל.',
  sharedSuccessfully: 'ה-PDF המכווץ שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF המכווץ עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  compressImage: 'כיווץ תמונה',
  imageCompressionFailedBody: 'ייתכן שהקובץ פגום או שזה סוג תמונה לא נתמך. נסו קובץ JPG או PNG אחר.',
  imageSuccessTitle: 'התמונה כווצה בהצלחה!',
  originalDimensions: 'מידות מקוריות',
  outputDimensions: 'מידות לאחר כיווץ',
  imageClosestAchievable: 'הגודל הקרוב ביותר שהושג: לא הצלחנו להגיע ל-{size} בתמונה הזו בלי להפוך אותה לבלתי שמישה, אז זו התוצאה הקטנה ביותר שנמצאה.',
  formatNotice: 'שימו לב: לאחר הכיווץ הפלט הוא JPEG. רקע שקוף בקובץ PNG יתמלא בלבן, וקידוד מחדש מוחק נתוני EXIF, כולל מיקום. צילום מסך או סריקה של טקסט עלולים להראות עיוותי JPEG גלויים, בעיקר בגודל יעד קטן.',
  passthroughNotice: 'הקובץ כבר קטן מהיעד, אז השארנו אותו כמו שהוא: אותו קובץ, אותו פורמט, בלי קידוד מחדש.',
  imageDownloadLabel: 'הורדת תמונה מכווצת',
  imageShareLabel: 'שיתוף תמונה מכווצת',
  imageLoaded: 'הקובץ "{name}" נטען. קבעו גודל יעד וכווצו.',
  imageStarting: 'מתחילים בכיווץ התמונה...',
  imageComplete: 'כיווץ התמונה הושלם. הקובץ שלכם מוכן.',
  missedTarget: 'לא הגענו ליעד. מוצגת התוצאה הקטנה ביותר שנמצאה.',
  imageFailed: 'כיווץ התמונה נכשל.',
  imageSharedSuccessfully: 'התמונה המכווצת שותפה.',
  imageSharingCanceled: 'השיתוף בוטל. התמונה המכווצת עדיין מוכנה.',
  downloadDetailSmaller: '{size}, קטן ב-{percent}%',
  downloadDetailClosest: 'הגודל הקרוב ביותר: {size}',
  compareShow: 'השוואה למקור',
  compareHide: 'הסתרת ההשוואה',
  compareRendering: 'מעבדים את עמוד 1 להשוואה…',
  compareRenderFailed: 'לא הצלחנו להציג תצוגה מקדימה לקובץ הזה.',
  compareBeforeLabel: 'מקור',
  compareAfterLabel: 'מכווץ',
  compareCaptionImage: 'גררו כדי להשוות בין התמונה המקורית לתמונה המכווצת.',
  compareCaptionPdf: 'גררו כדי להשוות את עמוד 1. שאר המסמך מכווץ באותו אופן.',
};

const compressMessages: Partial<Record<DocumentationLocaleId, CompressMessages>> = {
  en: englishCompressMessages,
  he: hebrewCompressMessages,
};

/**
 * DEBT-04: SignMessages lives in `src/editor/registry/messages.ts` now (the
 * editor's registry and the Sign/Redact chrome import the type from there);
 * this re-export keeps every existing `from '../i18n/toolMessages'` import
 * compiling unchanged. The values below are still authored here.
 */
import type { SignMessages } from '../editor/registry/messages';

export type { SignMessages };

const englishSignMessages: SignMessages = {
  toolbarLabel: 'PDF annotations',
  textButton: 'Text',
  dateButton: 'Date',
  symbolsButton: 'Symbols',
  shapesButton: 'Shapes',
  whiteoutButton: 'Whiteout',
  signButton: 'Sign',
  newSignatureButton: 'New Signature',
  undoButton: 'Undo',
  undoTitle: 'Undo changes',
  feedbackButton: 'Feedback',
  feedbackTitle: 'Report a bug or share feedback about Sign & Fill PDF (opens GitHub)',
  shareButton: 'Share',
  downloadButton: 'Download',
  textAction: 'Click on a page to place a text box.',
  dateAction: "Click on a page to place today's date.",
  symbolAction: 'Click on a page to place a symbol.',
  signatureAction: 'Click on a page to place your signature.',
  whiteoutAction: 'Click and drag on a page to draw a whiteout box.',
  ellipseAction: 'Click and drag on a page to draw an ellipse.',
  rectangleAction: 'Click and drag on a page to draw a rectangle.',
  lineAction: 'Click and drag on a page to draw a line.',
  shapesHintAction: 'Draw an ellipse, rectangle, or line.',
  tipIdle: 'Tip: pick a tool to start.',
  tipEditText: 'Double-click a text box to edit it.',
  keepOn: 'Keep {button} on',
  // Phone width only, beside a sentence that has just named the tool.
  keepOnShort: 'Keep on',
  keepOnTitleOn: 'Switch off to go back to one at a time. {button} stays selected either way.',
  keepOnTitleOff: 'Keep {button} on to use it several times. Double-clicking {button} does the same.',
  hintEsc: 'or press Esc to stop entirely',
  hintDoubleClick: 'or double-click {button}',
  armHint: 'Double-click to keep {label} on',
  nextFieldLabel: 'Next field',
  previousFieldLabel: 'Previous field',
  toolActive: '{button} tool active. {action}',
  signToolActive: 'Sign tool active. {action}',
  toolLocked: '{button} stays on after each one. Switch it off, or press Escape, when you are done.',
  toolUnlocked: '{button} is back to one at a time.',
  selectSignatureTitle: 'Click here to select or create a signature',
  downloadTitle: 'Save your changes and download the signed PDF',
  shareTitleReady: 'Share the signed PDF',
  shareTitleUnsaved: 'Save your changes to share the signed PDF',
  exportBlockedTitleOne: '{count} text field needs attention before download or sharing',
  exportBlockedTitleOther: '{count} text fields need attention before download or sharing',
  viewRelaxed: 'Relaxed view',
  viewCondensed: 'Condensed view',
  viewFullscreen: 'Full screen',
  viewExitFullscreen: 'Exit full screen',
  viewDensityLabel: 'View density',
  ellipseLabel: 'Ellipse',
  rectangleLabel: 'Rectangle',
  lineLabel: 'Line',
  savedSignatureAlt: 'Saved signature',
  deleteSignatureLabel: 'Delete signature',
  createSignatureTitle: 'Create Signature',
  closeDialogLabel: 'Close dialog',
  tabDraw: 'Draw',
  tabType: 'Type',
  tabUpload: 'Upload',
  penColorTitle: 'Pen color',
  thicknessLabel: 'Thickness',
  clearDrawingLabel: 'Clear',
  typedNamePlaceholder: 'Type your name...',
  signaturePreviewPlaceholder: 'Signature Preview',
  uploadDropHint: 'Drag & drop signature image here or click to choose',
  uploadFormatsHint: 'Supports PNG, JPG, SVG. Auto background transparency.',
  uploadSizeHint: 'Large images are downsampled to at most 1 megapixel and 750 KB before saving.',
  uploadedPreviewAlt: 'Uploaded signature preview',
  processingSignature: 'Processing signature...',
  removeWhiteBackgroundLabel: 'Remove white background',
  changeImageLabel: 'Change Image',
  dialogCancelLabel: 'Cancel',
  saveSignatureLabel: 'Save Signature',
  undoHistoryTitle: 'Undo changes',
  revertSelectedLabel: 'Revert selected',
  pageLabel: 'Page {number}',
  clearPageLabel: 'Clear page',
  clearPageTitle: 'Clear all annotations on this page',
  deleteSignatureConfirmTitle: 'Delete signature?',
  deleteSignatureConfirmBody: 'Are you sure you want to delete this saved signature? This action cannot be undone.',
  decreaseFontSizeTitle: 'Decrease font size',
  increaseFontSizeTitle: 'Increase font size',
  boldLabel: 'Bold',
  boldUnavailableTemplate: '{family} has no bold version',
  italicLabel: 'Italic',
  italicUnavailableTemplate: '{family} has no italic version',
  rtlTextTitle: 'Right-to-left text (Hebrew/Arabic)',
  ltrTextTitle: 'Left-to-right text',
  directionRtlAria: 'Text direction: right to left',
  directionLtrAria: 'Text direction: left to right',
  alignLeftTitle: 'Text sits at the left of its field. Click to centre it',
  alignCenterTitle: 'Text is centred in its field. Click to move it right',
  alignRightTitle: 'Text sits at the right of its field. Click to move it left',
  oneBoxFewerTitle: 'One box fewer',
  boxesFixedTitle: 'Boxes, fixed. Click to follow the text again',
  boxesFollowingTitle: 'Boxes, following the text',
  oneBoxMoreTitle: 'One box more',
  textColorTitle: 'Text color',
  dateFormatCycleTitleTemplate: 'Date format: {example}. Click to change.',
  checkMarkTitle: 'Check mark',
  xMarkTitle: 'X mark',
  dotMarkTitle: 'Dot mark',
  checkboxColorTitle: 'Checkbox color',
  lineThicknessTitle: 'Line thickness',
  shapeColorTitle: 'Shape color',
  signatureColorTitle: 'Signature color',
  whiteoutColorTitle: 'Whiteout color',
  duplicateElementTitle: 'Duplicate element',
  deleteElementTitle: 'Delete element',
  searchFontsPlaceholder: 'Search fonts',
  fontsListAriaLabel: 'Fonts',
  noFontsFound: 'No fonts found.',
  fontTriggerTitleTemplate: 'Font: {name}',
  fallbackFontNoteTemplate: 'Fallback: {family}',
  doesntSupportText: 'Doesn’t support this text',
  dragToResizeTitle: 'Drag to resize',
  dragToResizeFontSizeTitle: 'Drag to resize font size',
  dragToSpanBoxesTitle: 'Drag to span the form’s boxes',
  typeYourTextPlaceholder: 'Type your text',
  doubleClickToEditPlaceholder: 'Double-click to edit',
  exportReadinessBoldOne: '{count} text field needs attention',
  exportReadinessBoldOther: '{count} text fields need attention',
  exportReadinessSuffix: 'before download or sharing.',
  reviewFieldsLabel: 'Review fields',
  textNeedsAttentionAria: 'Text needs attention. Select for font suggestions.',
  textNeedsAttentionTitle: 'Text needs attention',
  fontSubstitutionTemplate: '{requested} has no match for: {missing}, so this text box is using {family} instead. {family} is what will be embedded in your download.',
  unrepresentableSavingTemplate: 'Some text{where} needs attention: {list}. Select its text box for font suggestions. You may need separate text boxes for different fonts, or to replace these characters, then save again.',
  unrepresentableTypingTemplate: 'Some characters{where} need a different font: {list}. Select the marked text box for help choosing fonts or separating the text into boxes.',
  wherePageOneTemplate: ' on page {number}',
  wherePagesManyTemplate: ' on pages {list}',
  pageListAndWord: ' and ',
  fallbackFontNotice: 'A fallback font is in use for this text. Choose another font in the font menu.',
  noFontForCharactersTemplate: 'No available font includes {text}. Please replace or remove those characters; you can keep the rest of your text.',
  noSingleFontTemplate: 'No single available font includes all this text. Keep the text by placing the parts in separate text boxes: {examples}{more}.',
  noSingleFontMoreClause: '; continue with the remaining parts',
  pieceInFontTemplate: '{text} in {family}',
  fontNotReadyTemplate: '{family} is not ready on this device yet. Connect to the internet so it can finish downloading, then try again.',
  defaultFontUnavailable: 'The app’s default font is not available on this device. Connect to the internet, reload the app, and try again.',
  exportGenericFailure: 'Could not export the PDF. Your edits are still here. Try again.',
  editsChangedWhilePreparing: 'Your edits changed while the PDF was being prepared. Download again to create an up-to-date file.',
  revertedSelectedActions: 'Reverted selected actions.',
  undidActionTemplate: 'Undid: {description}',
  invalidPdfFile: 'Please select a valid PDF file.',
  placedSignatureOnPage: 'Placed signature on page.',
  signaturePlacedNotSaved: 'Signature placed, but the browser could not save it for your next visit.',
  removedElement: 'Removed element.',
  finishedEditingHint: 'Finished editing. Press Backspace to delete this box.',
  copiedElement: 'Copied annotation element.',
  pastedElement: 'Pasted cloned element.',
  writingSignaturesIntoPdf: 'Writing signatures and text layers into PDF...',
  signingStoppedLabel: 'Signing stopped.',
  signedPdfReadyToShare: 'Your signed PDF is ready to share.',
  pdfSignedDownloadStarted: 'PDF signed successfully. Download started.',
  downloadStarted: 'Download started.',
  pdfSignedSuccessfully: 'PDF signed successfully.',
  sharingCanceledStillReady: 'Sharing canceled. Your signed PDF is still ready to share.',
  shareOpenFailed: 'Could not open the share sheet. Please try again.',
  signatureDeleted: 'Signature deleted.',
  signatureDeletedNotSaved: 'Signature deleted for this session, but the browser could not save that change.',
  addedSignatureDescription: 'Added signature',
  deletedElementDescriptionTemplate: 'Deleted {label}',
  duplicatedElementDescriptionTemplate: 'Duplicated {label}',
  savingDocumentLayers: 'Saving document layers…',
  pdfMayBeProtectedOrEncrypted: 'The PDF may be password-protected or encrypted.',
  reviewingFirstIssueAnnouncement: 'Showing the first text field that needs attention.',
  clearedPageAnnouncementTemplate: 'Cleared page {page}.',
  clearedPageDescriptionOne: 'Cleared {count} annotation on page {page}',
  clearedPageDescriptionOther: 'Cleared {count} annotations on page {page}',
  removedSymbolFromBoxAnnouncement: 'Removed symbol from the printed box.',
  removedSymbolFromBoxDescription: 'Removed symbol from printed box',
  addedTextBoxDescription: 'Added text box',
  addedTextBoxCombAnnouncementTemplate: 'Added text box across {cells} printed boxes. Type your text.',
  addedTextBoxAnnouncement: 'Added text box. Type your text.',
  movedToNextFieldAnnouncement: 'Moved to next field. Type your text.',
  movedToPreviousFieldAnnouncement: 'Moved to previous field. Type your text.',
  addedDateBoxDescription: 'Added date',
  addedDateBoxAnnouncement: "Added today's date.",
  addedSymbolDescription: 'Added symbol',
  addedSymbolInBoxAnnouncement: 'Added symbol in the printed box.',
  addedSymbolAnnouncement: 'Added symbol.',
  addedWhiteoutDescription: 'Added whiteout box',
  addedWhiteoutAnnouncement: 'Added whiteout box.',
  addedShapeDescriptionTemplate: 'Added {label}',
  addedShapeAnnouncementTemplate: 'Added {label}.',
  pdfLoadTimeout: 'This PDF is taking too long to load - it may be corrupted. Please try a different file.',
  pdfLoadFailedGeneric: 'Failed to load PDF file.',
  pdfRestoredTemplate: 'Restored your last draft of "{name}".',
  pdfLoadedTemplate: 'Loaded PDF "{name}" with {pages} pages.',
  lang: 'en',
  dir: 'ltr',
};

// LOC-09 stage 1: an AI draft, not yet reviewed by a native speaker - the same
// caveat hebrewMergeMessages and hebrewCompressMessages above carry. Pending
// Shlomi's read-through.
const hebrewSignMessages: SignMessages = {
  toolbarLabel: 'הערות PDF',
  textButton: 'טקסט',
  dateButton: 'תאריך',
  symbolsButton: 'סימנים',
  shapesButton: 'צורות',
  whiteoutButton: 'טיפקס',
  signButton: 'חתימה',
  newSignatureButton: 'חתימה חדשה',
  undoButton: 'ביטול פעולה',
  undoTitle: 'ביטול השינויים האחרונים',
  feedbackButton: 'משוב',
  feedbackTitle: 'דיווח על באג או שיתוף משוב על כלי החתימה והמילוי של PDF (נפתח ב-GitHub)',
  shareButton: 'שיתוף',
  downloadButton: 'הורדה',
  textAction: 'לחצו על עמוד כדי למקם תיבת טקסט.',
  dateAction: 'לחצו על עמוד כדי למקם את התאריך של היום.',
  symbolAction: 'לחצו על עמוד כדי למקם סימן.',
  signatureAction: 'לחצו על עמוד כדי למקם את החתימה שלכם.',
  whiteoutAction: 'לחצו וגררו על עמוד כדי לצייר תיבת טיפקס.',
  ellipseAction: 'לחצו וגררו על עמוד כדי לצייר אליפסה.',
  rectangleAction: 'לחצו וגררו על עמוד כדי לצייר מלבן.',
  lineAction: 'לחצו וגררו על עמוד כדי לצייר קו.',
  shapesHintAction: 'ציירו אליפסה, מלבן או קו.',
  tipIdle: 'טיפ: בחרו כלי כדי להתחיל.',
  tipEditText: 'לחצו לחיצה כפולה על תיבת טקסט כדי לערוך אותה.',
  keepOn: 'להשאיר את {button} פעיל',
  keepOnShort: 'להשאיר פעיל',
  keepOnTitleOn: 'כבו כדי לחזור לפעולה חד-פעמית. {button} נשאר מסומן בכל מקרה.',
  keepOnTitleOff: 'השאירו את {button} פעיל כדי להשתמש בו כמה פעמים. לחיצה כפולה על {button} עושה את אותו הדבר.',
  hintEsc: 'או לחצו Esc כדי לעצור לגמרי',
  hintDoubleClick: 'או לחצו לחיצה כפולה על {button}',
  armHint: 'לחיצה כפולה כדי להשאיר את {label} פעיל',
  nextFieldLabel: 'שדה הבא',
  previousFieldLabel: 'שדה קודם',
  toolActive: 'הכלי {button} פעיל. {action}',
  signToolActive: 'כלי החתימה פעיל. {action}',
  toolLocked: '{button} יישאר פעיל אחרי כל שימוש. כבו אותו, או לחצו Escape, כשתסיימו.',
  toolUnlocked: '{button} חזר לפעולה חד-פעמית.',
  selectSignatureTitle: 'לחצו כאן כדי לבחור או ליצור חתימה',
  downloadTitle: 'שמרו את השינויים והורידו את ה-PDF החתום',
  shareTitleReady: 'שתפו את ה-PDF החתום',
  shareTitleUnsaved: 'שמרו את השינויים כדי לשתף את ה-PDF החתום',
  exportBlockedTitleOne: '{count} שדה טקסט דורש התייחסות לפני הורדה או שיתוף',
  exportBlockedTitleOther: '{count} שדות טקסט דורשים התייחסות לפני הורדה או שיתוף',
  viewRelaxed: 'תצוגה מרווחת',
  viewCondensed: 'תצוגה מצומצמת',
  viewFullscreen: 'מסך מלא',
  viewExitFullscreen: 'יציאה ממסך מלא',
  viewDensityLabel: 'צפיפות התצוגה',
  // LOC-16 stage 2-5 (2026-09-13): AI draft, not yet reviewed by a native
  // speaker - same caveat as the rest of this catalogue, extending coverage
  // from the toolbar row to popovers, dialogs, element controls and
  // screen-reader announcements across the whole Sign editor.
  ellipseLabel: 'אליפסה',
  rectangleLabel: 'מלבן',
  lineLabel: 'קו',
  savedSignatureAlt: 'חתימה שמורה',
  deleteSignatureLabel: 'מחיקת חתימה',
  createSignatureTitle: 'יצירת חתימה',
  closeDialogLabel: 'סגירת החלון',
  tabDraw: 'ציור',
  tabType: 'הקלדה',
  tabUpload: 'העלאה',
  penColorTitle: 'צבע העט',
  thicknessLabel: 'עובי',
  clearDrawingLabel: 'ניקוי',
  typedNamePlaceholder: 'הקלידו את שמכם...',
  signaturePreviewPlaceholder: 'תצוגה מקדימה של החתימה',
  uploadDropHint: 'גררו לכאן תמונת חתימה או לחצו לבחירה',
  uploadFormatsHint: 'תומך ב-PNG, JPG, SVG. הסרת רקע אוטומטית.',
  uploadSizeHint: 'תמונות גדולות מוקטנות למגה-פיקסל אחד ו-750KB לכל היותר לפני השמירה.',
  uploadedPreviewAlt: 'תצוגה מקדימה של החתימה שהועלתה',
  processingSignature: 'מעבדים את החתימה...',
  removeWhiteBackgroundLabel: 'הסרת רקע לבן',
  changeImageLabel: 'החלפת תמונה',
  dialogCancelLabel: 'ביטול',
  saveSignatureLabel: 'שמירת חתימה',
  undoHistoryTitle: 'ביטול שינויים',
  revertSelectedLabel: 'שחזור הנבחרים',
  pageLabel: 'עמוד {number}',
  clearPageLabel: 'ניקוי העמוד',
  clearPageTitle: 'ניקוי כל ההערות בעמוד הזה',
  deleteSignatureConfirmTitle: 'למחוק את החתימה?',
  deleteSignatureConfirmBody: 'למחוק את החתימה השמורה הזו? אי אפשר לבטל את הפעולה הזו.',
  decreaseFontSizeTitle: 'הקטנת גודל הגופן',
  increaseFontSizeTitle: 'הגדלת גודל הגופן',
  boldLabel: 'מודגש',
  boldUnavailableTemplate: 'ל-{family} אין גרסה מודגשת',
  italicLabel: 'נטוי',
  italicUnavailableTemplate: 'ל-{family} אין גרסה נטויה',
  rtlTextTitle: 'טקסט מימין לשמאל (עברית/ערבית)',
  ltrTextTitle: 'טקסט משמאל לימין',
  directionRtlAria: 'כיוון טקסט: מימין לשמאל',
  directionLtrAria: 'כיוון טקסט: משמאל לימין',
  alignLeftTitle: 'הטקסט צמוד לשמאל השדה. לחיצה תמרכז אותו',
  alignCenterTitle: 'הטקסט ממורכז בשדה. לחיצה תצמיד אותו לימין',
  alignRightTitle: 'הטקסט צמוד לימין השדה. לחיצה תצמיד אותו לשמאל',
  oneBoxFewerTitle: 'תיבה אחת פחות',
  boxesFixedTitle: 'מספר התיבות קבוע. לחצו כדי לחזור למעקב אחרי הטקסט',
  boxesFollowingTitle: 'מספר התיבות עוקב אחרי הטקסט',
  oneBoxMoreTitle: 'תיבה אחת נוספת',
  textColorTitle: 'צבע הטקסט',
  dateFormatCycleTitleTemplate: 'פורמט תאריך: {example}. לחצו לשינוי.',
  checkMarkTitle: 'סימן וי',
  xMarkTitle: 'סימן איקס',
  dotMarkTitle: 'סימן נקודה',
  checkboxColorTitle: 'צבע תיבת הסימון',
  lineThicknessTitle: 'עובי הקו',
  shapeColorTitle: 'צבע הצורה',
  signatureColorTitle: 'צבע החתימה',
  whiteoutColorTitle: 'צבע הטיפקס',
  duplicateElementTitle: 'שכפול הרכיב',
  deleteElementTitle: 'מחיקת הרכיב',
  searchFontsPlaceholder: 'חיפוש גופנים',
  fontsListAriaLabel: 'גופנים',
  noFontsFound: 'לא נמצאו גופנים.',
  fontTriggerTitleTemplate: 'גופן: {name}',
  fallbackFontNoteTemplate: 'גופן חלופי: {family}',
  doesntSupportText: 'לא תומך בטקסט הזה',
  dragToResizeTitle: 'גררו לשינוי גודל',
  dragToResizeFontSizeTitle: 'גררו לשינוי גודל הגופן',
  dragToSpanBoxesTitle: 'גררו כדי לפרוש על תיבות הטופס',
  typeYourTextPlaceholder: 'הקלידו את הטקסט שלכם',
  doubleClickToEditPlaceholder: 'לחיצה כפולה לעריכה',
  exportReadinessBoldOne: '{count} שדה טקסט דורש התייחסות',
  exportReadinessBoldOther: '{count} שדות טקסט דורשים התייחסות',
  exportReadinessSuffix: 'לפני הורדה או שיתוף.',
  reviewFieldsLabel: 'בדיקת השדות',
  textNeedsAttentionAria: 'הטקסט דורש התייחסות. בחרו כדי לקבל הצעות גופן.',
  textNeedsAttentionTitle: 'הטקסט דורש התייחסות',
  fontSubstitutionTemplate: 'לגופן {requested} אין התאמה עבור: {missing}, ולכן תיבת הטקסט הזו משתמשת ב-{family} במקום. {family} הוא הגופן שיוטמע בקובץ שתורידו.',
  unrepresentableSavingTemplate: 'חלק מהטקסט{where} דורש התייחסות: {list}. בחרו את תיבת הטקסט כדי לקבל הצעות גופן. ייתכן שתצטרכו תיבות טקסט נפרדות לגופנים שונים, או להחליף את התווים האלה, ואז לשמור שוב.',
  unrepresentableTypingTemplate: 'חלק מהתווים{where} דורשים גופן אחר: {list}. בחרו את תיבת הטקסט המסומנת כדי לקבל עזרה בבחירת גופן או בפיצול הטקסט לתיבות.',
  wherePageOneTemplate: ' בעמוד {number}',
  wherePagesManyTemplate: ' בעמודים {list}',
  pageListAndWord: ' ו-',
  fallbackFontNotice: 'גופן חלופי נמצא בשימוש עבור הטקסט הזה. בחרו גופן אחר מתפריט הגופנים.',
  noFontForCharactersTemplate: 'אין גופן זמין שכולל את {text}. החליפו או הסירו את התווים האלה; אפשר להשאיר את שאר הטקסט.',
  noSingleFontTemplate: 'אין גופן זמין יחיד שכולל את כל הטקסט הזה. אפשר לשמור על הטקסט על ידי פיצולו לתיבות טקסט נפרדות: {examples}{more}.',
  noSingleFontMoreClause: '; המשיכו עם שאר החלקים',
  pieceInFontTemplate: '{text} ב-{family}',
  fontNotReadyTemplate: '{family} עדיין לא מוכן במכשיר הזה. התחברו לאינטרנט כדי לאפשר להורדה להסתיים, ואז נסו שוב.',
  defaultFontUnavailable: 'גופן ברירת המחדל של האפליקציה לא זמין במכשיר הזה. התחברו לאינטרנט, טענו מחדש את האפליקציה, ונסו שוב.',
  exportGenericFailure: 'לא הצלחנו לייצא את ה-PDF. השינויים שלכם עדיין כאן. נסו שוב.',
  editsChangedWhilePreparing: 'השינויים שלכם השתנו בזמן שה-PDF הוכן. הורידו שוב כדי ליצור קובץ מעודכן.',
  revertedSelectedActions: 'הפעולות שנבחרו שוחזרו.',
  undidActionTemplate: 'בוטל: {description}',
  invalidPdfFile: 'בחרו קובץ PDF תקין.',
  placedSignatureOnPage: 'החתימה מוקמה בעמוד.',
  signaturePlacedNotSaved: 'החתימה מוקמה, אבל הדפדפן לא הצליח לשמור אותה לביקור הבא שלכם.',
  removedElement: 'הרכיב הוסר.',
  finishedEditingHint: 'סיימתם לערוך. לחצו Backspace כדי למחוק את התיבה הזו.',
  copiedElement: 'רכיב ההערה הועתק.',
  pastedElement: 'הרכיב המשוכפל הודבק.',
  writingSignaturesIntoPdf: 'כותבים את החתימות ושכבות הטקסט לתוך ה-PDF...',
  signingStoppedLabel: 'החתימה נעצרה.',
  signedPdfReadyToShare: 'ה-PDF החתום שלכם מוכן לשיתוף.',
  pdfSignedDownloadStarted: 'ה-PDF נחתם בהצלחה. ההורדה החלה.',
  downloadStarted: 'ההורדה החלה.',
  pdfSignedSuccessfully: 'ה-PDF נחתם בהצלחה.',
  sharingCanceledStillReady: 'השיתוף בוטל. ה-PDF החתום שלכם עדיין מוכן לשיתוף.',
  shareOpenFailed: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  signatureDeleted: 'החתימה נמחקה.',
  signatureDeletedNotSaved: 'החתימה נמחקה עבור השימוש הנוכחי, אבל הדפדפן לא הצליח לשמור את השינוי הזה.',
  addedSignatureDescription: 'נוספה חתימה',
  deletedElementDescriptionTemplate: 'נמחק {label}',
  duplicatedElementDescriptionTemplate: 'שוכפל {label}',
  savingDocumentLayers: 'שומרים את שכבות המסמך…',
  pdfMayBeProtectedOrEncrypted: 'ה-PDF עשוי להיות מוגן בסיסמה או מוצפן.',
  reviewingFirstIssueAnnouncement: 'מציגים את שדה הטקסט הראשון שדורש התייחסות.',
  clearedPageAnnouncementTemplate: 'עמוד {page} נוקה.',
  clearedPageDescriptionOne: 'נוקתה הערה אחת בעמוד {page}',
  clearedPageDescriptionOther: 'נוקו {count} הערות בעמוד {page}',
  removedSymbolFromBoxAnnouncement: 'הסימן הוסר מהתיבה המודפסת.',
  removedSymbolFromBoxDescription: 'הוסר סימן מתיבה מודפסת',
  addedTextBoxDescription: 'נוספה תיבת טקסט',
  addedTextBoxCombAnnouncementTemplate: 'נוספה תיבת טקסט הפרוסה על {cells} תיבות מודפסות. הקלידו את הטקסט שלכם.',
  addedTextBoxAnnouncement: 'נוספה תיבת טקסט. הקלידו את הטקסט שלכם.',
  movedToNextFieldAnnouncement: 'עברתם לשדה הבא. הקלידו את הטקסט שלכם.',
  movedToPreviousFieldAnnouncement: 'עברתם לשדה הקודם. הקלידו את הטקסט שלכם.',
  addedDateBoxDescription: 'נוסף תאריך',
  addedDateBoxAnnouncement: 'נוסף התאריך של היום.',
  addedSymbolDescription: 'נוסף סימן',
  addedSymbolInBoxAnnouncement: 'נוסף סימן בתיבה המודפסת.',
  addedSymbolAnnouncement: 'נוסף סימן.',
  addedWhiteoutDescription: 'נוספה תיבת טיפקס',
  addedWhiteoutAnnouncement: 'נוספה תיבת טיפקס.',
  addedShapeDescriptionTemplate: 'נוספה צורה: {label}',
  addedShapeAnnouncementTemplate: 'נוספה צורה: {label}.',
  pdfLoadTimeout: 'טעינת ה-PDF הזה נמשכת זמן רב מדי, ייתכן שהוא פגום. נסו קובץ אחר.',
  pdfLoadFailedGeneric: 'טעינת קובץ ה-PDF נכשלה.',
  pdfRestoredTemplate: 'שחזרנו את הטיוטה האחרונה שלכם של "{name}".',
  pdfLoadedTemplate: 'קובץ ה-PDF "{name}" נטען עם {pages} עמודים.',
  lang: 'he',
  dir: 'rtl',
};

const signMessages: Partial<Record<DocumentationLocaleId, SignMessages>> = {
  en: englishSignMessages,
  he: hebrewSignMessages,
};

const toolMessageTables: Record<string, Partial<Record<DocumentationLocaleId, unknown>>> = {
  merge: mergeMessages,
  compress: compressMessages,
  sign: signMessages,
};

export function getToolMessages(toolSlug: string, locale: DocumentationLocaleId): unknown | undefined {
  return toolMessageTables[toolSlug]?.[locale];
}

/**
 * The shell every tool is built on (BasePdfTool: empty-state dropzone, the
 * file identity/control row, the two confirmation dialogs). One catalogue for
 * every tool, because the shell is one component on purpose - see
 * BasePdfTool's header comment on why "start over" is decided once. A tool
 * page passes this alongside its own catalogue; Sign and Redact take it too,
 * since the dropzone and the confirmations are the shell, not the editor.
 */
export interface ShellMessages {
  dropHereMany: string;
  dropHereOne: string;
  chooseFilesMany: string;
  chooseFileOne: string;
  privacyLine: string;
  checkingDraft: string;
  dropToAddMore: string;
  dropToReplace: string;
  filesLoaded: string;
  pdfLoaded: string;
  draftSaved: string;
  draftSaving: string;
  draftNotSaved: string;
  draftConflict: string;
  addLabel: string;
  addShort: string;
  addTitle: string;
  replaceLabel: string;
  replaceShort: string;
  replaceTitle: string;
  clearLabel: string;
  clearShort: string;
  clearTitle: string;
  cancel: string;
  closeDialog: string;
  replaceDialogTitle: string;
  replaceConfirmFile: string;
  replaceConfirmChoose: string;
  replaceOpening: string;
  replaceChoosing: string;
  theCurrentPdf: string;
  clearDialogTitle: string;
  clearConfirm: string;
  clearBody: string;
  clearOf: string;
  /** describeFile (src/lib/format.js) page-count clause of the file-info bar,
   * e.g. "3 pages · 1.4 MB" or "Page 2 of 3". */
  pageCountOne: string;
  pageCountOther: string;
  pageOf: string;
  /** MOBI-09: iOS has no Web Share Target, so the Android share-sheet path
   * this suite is built around doesn't exist there. Shown only on the Sign
   * tool's empty state (BasePdfTool's `showIosFilesHint`), only once
   * `src/lib/platform.ts`'s mount-effect check confirms iOS - never on the
   * server render or the first client render, to keep the hydration match
   * FileDropzone.tsx's `recents` comment already documents. Describes the
   * Files-app route, never Web Share Target by name, and never implies iOS
   * gets the Android path. */
  iosFilesHint: string;
}

const englishShellMessages: ShellMessages = {
  dropHereMany: 'Drop PDFs here',
  dropHereOne: 'Drop PDF here',
  chooseFilesMany: 'Choose files',
  chooseFileOne: 'Choose file',
  privacyLine: 'Private. Files never leave your device.',
  checkingDraft: 'Checking for a saved draft…',
  dropToAddMore: 'Drop to add more files',
  dropToReplace: 'Drop to replace the current file',
  filesLoaded: 'Files loaded',
  pdfLoaded: 'PDF loaded',
  draftSaved: 'Draft saved',
  draftSaving: 'Saving draft…',
  draftNotSaved: 'Draft not saved',
  draftConflict: 'Newer draft in another tab - saving here will replace it',
  addLabel: 'Add files',
  addShort: 'Add',
  addTitle: 'Add more files',
  replaceLabel: 'Replace file',
  replaceShort: 'Replace',
  replaceTitle: 'Replace the current file',
  clearLabel: 'Clear all',
  clearShort: 'Clear',
  clearTitle: 'Remove every file and start again',
  cancel: 'Cancel',
  closeDialog: 'Close dialog',
  // MEM-03 (2026-09-15): Replace now always asks, and the question changed
  // meaning - it no longer protects work about to be destroyed (nothing is,
  // any more), it just catches an unintended click and says where the
  // current file is going. See draftStore.js's header comment on the
  // one-memory-space model this replaces the old per-tool-draft warning for.
  replaceDialogTitle: 'Open a different file?',
  replaceConfirmFile: 'Replace file',
  replaceConfirmChoose: 'Choose a file',
  replaceOpening: "Opening {file} closes {current}. It stays in your recent files with everything you've done, so you can come back to it from the home page.",
  replaceChoosing: "This closes {current}. It stays in your recent files with everything you've done, so you can come back to it from the home page.",
  theCurrentPdf: 'the current PDF',
  clearDialogTitle: 'Clear all files?',
  clearConfirm: 'Clear all',
  clearBody: 'This empties the list{of} and the order you put it in. Nothing is removed from your device.',
  clearOf: ' of {summary}',
  pageCountOne: '1 page',
  pageCountOther: '{count} pages',
  pageOf: 'Page {current} of {total}',
  iosFilesHint: 'On iPhone or iPad, share the PDF to Files from Mail, WhatsApp, or any other app, then tap Choose file. It opens on Recents, with the file you just saved at the top.',
};

const hebrewShellMessages: ShellMessages = {
  dropHereMany: 'גררו לכאן קבצי PDF',
  dropHereOne: 'גררו לכאן קובץ PDF',
  chooseFilesMany: 'בחירת קבצים',
  chooseFileOne: 'בחירת קובץ',
  privacyLine: 'פרטי. הקבצים לא עוזבים את המכשיר שלכם.',
  checkingDraft: 'בודקים אם יש טיוטה שמורה…',
  dropToAddMore: 'שחררו כדי להוסיף קבצים',
  dropToReplace: 'שחררו כדי להחליף את הקובץ הנוכחי',
  filesLoaded: 'הקבצים נטענו',
  pdfLoaded: 'ה-PDF נטען',
  draftSaved: 'הטיוטה נשמרה',
  draftSaving: 'שומרים טיוטה…',
  draftNotSaved: 'הטיוטה לא נשמרה',
  draftConflict: 'יש טיוטה חדשה יותר בלשונית אחרת. שמירה כאן תחליף אותה',
  addLabel: 'הוספת קבצים',
  addShort: 'הוספה',
  addTitle: 'הוספת קבצים נוספים',
  replaceLabel: 'החלפת קובץ',
  replaceShort: 'החלפה',
  replaceTitle: 'החלפת הקובץ הנוכחי',
  clearLabel: 'ניקוי הכול',
  clearShort: 'ניקוי',
  clearTitle: 'הסרת כל הקבצים והתחלה מחדש',
  cancel: 'ביטול',
  closeDialog: 'סגירת החלון',
  // MEM-03: AI draft, not reviewed copy - the same caveat the rest of this
  // file's Hebrew catalogues carry, pending Shlomi's read-through.
  replaceDialogTitle: 'לפתוח קובץ אחר?',
  replaceConfirmFile: 'החלפת קובץ',
  replaceConfirmChoose: 'בחירת קובץ',
  replaceOpening: 'פתיחת {file} סוגרת את {current}. הוא נשאר ברשימת הקבצים האחרונים עם כל מה שעשיתם, כך שתוכלו לחזור אליו מהדף הבית.',
  replaceChoosing: 'הפעולה הזו סוגרת את {current}. הוא נשאר ברשימת הקבצים האחרונים עם כל מה שעשיתם, כך שתוכלו לחזור אליו מהדף הבית.',
  theCurrentPdf: 'ה-PDF הנוכחי',
  clearDialogTitle: 'לנקות את כל הקבצים?',
  clearConfirm: 'ניקוי הכול',
  clearBody: 'הרשימה{of} והסדר שקבעתם יתרוקנו. שום דבר לא נמחק מהמכשיר שלכם.',
  clearOf: ' של {summary}',
  pageCountOne: '1 עמוד',
  pageCountOther: '{count} עמודים',
  pageOf: 'עמוד {current} מתוך {total}',
  iosFilesHint: 'באייפון או אייפד, שתפו את קובץ ה-PDF ל-Files מתוך Mail, WhatsApp או כל אפליקציה אחרת, ואז לחצו על בחירת קובץ. הוא ייפתח בכרטיסיית "אחרונים" ב-Files, עם הקובץ ששמרתם הרגע למעלה.',
};

const shellMessages: Partial<Record<DocumentationLocaleId, ShellMessages>> = {
  en: englishShellMessages,
  he: hebrewShellMessages,
};

export function getShellMessages(locale: DocumentationLocaleId): ShellMessages | undefined {
  return shellMessages[locale];
}

/**
 * LOC-09: the home page's launcher tile (src/components/FileDropzone.tsx) had
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
  multipleFilesPicked: string;
  notAPdf: string;
  recentFileUnavailable: string;
  sampleLoadFailed: string;
  opening: string;
  chooseFiles: string;
  orDropPdfsHere: string;
  /** '{tool}' is filled from the `toolDisplayName` prop, so the destination
   * tool's name is never hardcoded to English ("Sign & Fill") - docs/
   * home-page-localization-plan.md, section 2 row 21. */
  practiceDocumentCaption: string;
}

const englishFileDropzoneMessages: FileDropzoneMessages = {
  handoffFailed: 'PDkef could not save this file on your device. Please try again.',
  multipleFilesPicked: 'Choose one PDF here, or use Merge PDF below for several files.',
  notAPdf: 'Please choose a PDF file.',
  recentFileUnavailable: 'That recent file is no longer available in this browser.',
  sampleLoadFailed: 'The sample could not be loaded. Please try again or choose your own PDF.',
  opening: 'Opening…',
  chooseFiles: 'Choose files',
  orDropPdfsHere: 'or drop PDFs here',
  practiceDocumentCaption: 'Practice document · opens in {tool}',
};

// LOC-09's own draft (see he.yaml's own status: draft), reviewed alongside it
// before either can publish - not yet reviewed by a native speaker.
// LOC-09: an AI draft, not reviewed copy - the same caveat hebrewMergeMessages
// above carries, and for the same reason. These ship on /he/ today because the
// launcher is the Hebrew home page's whole point and English buttons inside a
// Hebrew page are worse than an unreviewed translation, but they are pending
// Shlomi's read-through alongside src/content/localized-home/he.yaml's own
// reviewNotes. Do not treat these values as approved copy.
const hebrewFileDropzoneMessages: FileDropzoneMessages = {
  handoffFailed: 'לא הצלחנו לשמור את הקובץ הזה במכשיר שלכם. נסו שוב.',
  multipleFilesPicked: 'בחרו כאן קובץ PDF אחד, או השתמשו באיחוד PDF למטה בשביל כמה קבצים.',
  notAPdf: 'בחרו קובץ PDF.',
  recentFileUnavailable: 'הקובץ הזה כבר לא זמין בדפדפן הזה.',
  sampleLoadFailed: 'לא הצלחנו לטעון את קובץ הדוגמה. נסו שוב או בחרו קובץ PDF משלכם.',
  opening: 'פותחים…',
  chooseFiles: 'בחירת קבצים',
  orDropPdfsHere: 'או גררו לכאן קבצי PDF',
  practiceDocumentCaption: 'מסמך לתרגול · נפתח בכלי {tool}',
};

const fileDropzoneMessages: Partial<Record<DocumentationLocaleId, FileDropzoneMessages>> = {
  en: englishFileDropzoneMessages,
  he: hebrewFileDropzoneMessages,
};

export function getFileDropzoneMessages(locale: DocumentationLocaleId): FileDropzoneMessages {
  return fileDropzoneMessages[locale] ?? englishFileDropzoneMessages;
}

/** RecentFiles.tsx's own strings. Rendered only by FileDropzone
 * (src/components/FileDropzone.tsx:132), so it is passed through from
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
}

const englishRecentFilesMessages: RecentFilesMessages = {
  heading: 'Recent files',
  openSampleAriaLabel: 'Open bundled sample PDF, {name}',
  openRecentAriaLabel: 'Open recent PDF, {name}',
  justNow: 'just now',
  pageCountOne: '1 page',
  pageCountOther: '{count} pages',
};

// LOC-09: an AI draft, not reviewed copy - see hebrewFileDropzoneMessages above.
const hebrewRecentFilesMessages: RecentFilesMessages = {
  heading: 'קבצים אחרונים',
  openSampleAriaLabel: 'פתיחת קובץ הדוגמה, {name}',
  openRecentAriaLabel: 'פתיחת קובץ אחרון, {name}',
  justNow: 'הרגע',
  pageCountOne: 'עמוד אחד',
  pageCountOther: '{count} עמודים',
};

const recentFilesMessages: Partial<Record<DocumentationLocaleId, RecentFilesMessages>> = {
  en: englishRecentFilesMessages,
  he: hebrewRecentFilesMessages,
};

export function getRecentFilesMessages(locale: DocumentationLocaleId): RecentFilesMessages {
  return recentFilesMessages[locale] ?? englishRecentFilesMessages;
}

export {
  englishMergeMessages,
  hebrewMergeMessages,
  englishCompressMessages,
  hebrewCompressMessages,
  englishSignMessages,
  hebrewSignMessages,
  englishShellMessages,
  hebrewShellMessages,
  englishFileDropzoneMessages,
  hebrewFileDropzoneMessages,
  englishRecentFilesMessages,
  hebrewRecentFilesMessages,
};
