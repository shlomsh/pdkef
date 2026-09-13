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
  sortAsAdded: string;
  sortReversed: string;
  sortNameAsc: string;
  sortNameDesc: string;
  sortDateAsc: string;
  sortDateDesc: string;
  optionsSummary: string;
  /** MERGE-03: the output file name is one template ("merged_{name}", the
   * same prefix shape as signed_/redacted_) so a locale can phrase it its own
   * way; `{count}` (the other files) is available to it. The PDF Title is the
   * same string. */
  outputName: string;
  savesAs: string;
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
  editPages: string;
  doneEditing: string;
  stripHint: string;
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
  /* MERGE-14: two quiet verbs under Download (Split was dropped on review:
   * after page-level shuffle and skip it is not the next step); MERGE-17: one
   * quiet line after the first result in this browser. */
  handoffCompress: string;
  handoffSign: string;
  handoffConfirmTitle: string;
  handoffConfirmBody: string;
  handoffConfirm: string;
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
  sortAsAdded: 'As added',
  sortReversed: 'Reversed',
  sortNameAsc: 'Name A to Z',
  sortNameDesc: 'Name Z to A',
  sortDateAsc: 'Oldest first',
  sortDateDesc: 'Newest first',
  optionsSummary: 'Options',
  outputName: 'merged_{name}',
  savesAs: 'Saves as {name}',
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
  editPages: 'Edit pages',
  doneEditing: 'Done',
  stripHint: 'Drag a page to reorder, or focus a page and press the left or right arrow keys to move it, R to rotate it, Delete to skip it.',
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
  handoffCompress: 'Compress it',
  handoffSign: 'Sign it',
  handoffConfirmTitle: 'Replace the saved draft?',
  handoffConfirmBody: 'That tool still has a draft saved on this device: {draft}. Opening the merged file there replaces it.',
  handoffConfirm: 'Replace and open',
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
  addOneMore: 'הוסיפו עוד PDF אחד כדי למזג',
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
  sortAsAdded: 'לפי סדר ההוספה',
  sortReversed: 'הפוך',
  sortNameAsc: 'שם, א עד ת',
  sortNameDesc: 'שם, ת עד א',
  sortDateAsc: 'הישן ביותר קודם',
  sortDateDesc: 'החדש ביותר קודם',
  optionsSummary: 'אפשרויות',
  outputName: 'merged_{name}',
  savesAs: 'יישמר בשם {name}',
  downloadLabel: 'הורדת ה-PDF המאוחד',
  preparing: 'מכינים…',
  startAgain: 'להתחיל מחדש',
  errorUnreadable: 'לא הצלחנו לקרוא את "{name}". ייתכן שהקובץ פגום, או שהוא בכלל לא PDF.',
  errorEncrypted: '"{name}" מוגן בסיסמה. הסירו קודם את הסיסמה, על המכשיר שלכם, ואז הוסיפו אותו שוב.',
  unlockLink: 'לפתיחת כלי ההסרה',
  removeAndMergeRest: 'להסיר אותו ולמזג את השאר',
  errorTooLarge: 'הסט הזה גדול מדי למיזוג בדפדפן על המכשיר הזה. נסו פחות קבצים בכל פעם.',
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
  editPages: 'עריכת עמודים',
  doneEditing: 'סיום',
  stripHint: 'גררו עמוד כדי לסדר מחדש, או התמקדו בעמוד ולחצו על חץ שמאלה או ימינה כדי להזיז אותו, R כדי לסובב, Delete כדי לדלג עליו.',
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
  handoffCompress: 'לכווץ אותו',
  handoffSign: 'לחתום עליו',
  handoffConfirmTitle: 'להחליף את הטיוטה השמורה?',
  handoffConfirmBody: 'בכלי הזה עדיין שמורה טיוטה על המכשיר: {draft}. פתיחת הקובץ המאוחד שם תחליף אותה.',
  handoffConfirm: 'להחליף ולפתוח',
  handoffFailed: 'לא הצלחנו להעביר את הקובץ. הורידו אותו במקום.',
  installLine: 'הדף הזה שמור עכשיו בדפדפן, אז המיזוג עובד גם בלי חיבור לאינטרנט.',
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
  fixFileToMerge: 'תקנו את הקובץ למעלה כדי למזג',
  pageSkippedUndo: 'דולג עמוד {number}',
  pageRotatedUndo: 'סובב עמוד {number}',
  pageMovedUndo: 'הוזז עמוד {number}',
  dropAnywhereNote: 'שחררו בכל מקום, או הדביקו',
  moreOptions: 'עוד אפשרויות',
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
  workNoun: string;
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
  imageWorkNoun: string;
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
  workNoun: 'the compressed PDF you just made',
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
  imageWorkNoun: 'the compressed image you just made',
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
  workNoun: 'ה-PDF המכווץ שיצרתם',
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
  imageWorkNoun: 'התמונה המכווצת שיצרתם',
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
 * LOC-09 stage 1: the Sign editor's always-visible toolbar row and its status
 * line only (docs/sign-tool-product-decisions.md's LOC-02 pilot decision kept
 * the editor English; this is the first crack in that, scoped deliberately
 * narrow). Popovers, dialogs, element controls and screen-reader announcements
 * are NOT covered by this catalogue yet and stay English - `toolActive`,
 * `signToolActive`, `toolLocked` and `toolUnlocked` are defined here so a
 * later stage has them ready, but SignToolbar.tsx's `setAnnouncement()` calls
 * do not read them yet.
 *
 * `lang`/`dir` let the toolbar's own bidi-isolation wrapper (added in
 * 5a1af03 as a hardcoded `dir="ltr" lang="en"`, back when the whole editor
 * was English) follow the catalogue instead: 'ltr'/'en' here, 'rtl'/'he' in
 * the Hebrew edition, since a Hebrew toolbar should not force its own English
 * bidi isolation on itself.
 */
export interface SignMessages {
  toolbarLabel: string;
  textButton: string;
  symbolsButton: string;
  shapesButton: string;
  whiteoutButton: string;
  signButton: string;
  newSignatureButton: string;
  undoButton: string;
  undoTitle: string;
  feedbackButton: string;
  feedbackTitle: string;
  shareButton: string;
  downloadButton: string;
  textAction: string;
  symbolAction: string;
  signatureAction: string;
  whiteoutAction: string;
  ellipseAction: string;
  rectangleAction: string;
  lineAction: string;
  shapesHintAction: string;
  tipIdle: string;
  /** No leading space - EditorToolStatus's idle tip composes `${tipIdle} ${tipEditText}` itself. */
  tipEditText: string;
  keepOn: string;
  keepOnTitleOn: string;
  keepOnTitleOff: string;
  hintEsc: string;
  hintDoubleClick: string;
  armHint: string;
  /** Not yet wired into SignToolbar.tsx's setAnnouncement() calls - see this
   * catalogue's header comment. */
  toolActive: string;
  signToolActive: string;
  toolLocked: string;
  toolUnlocked: string;
  selectSignatureTitle: string;
  downloadTitle: string;
  shareTitleReady: string;
  shareTitleUnsaved: string;
  exportBlockedTitleOne: string;
  exportBlockedTitleOther: string;
  viewRelaxed: string;
  viewCondensed: string;
  viewFullscreen: string;
  viewExitFullscreen: string;
  viewDensityLabel: string;
  lang: string;
  dir: 'ltr' | 'rtl';
}

const englishSignMessages: SignMessages = {
  toolbarLabel: 'PDF annotations',
  textButton: 'Text',
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
  keepOnTitleOn: 'Switch off to go back to one at a time. {button} stays selected either way.',
  keepOnTitleOff: 'Keep {button} on to use it several times. Double-clicking {button} does the same.',
  hintEsc: 'or press Esc to stop entirely',
  hintDoubleClick: 'or double-click {button}',
  armHint: 'Double-click to keep {label} on',
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
  lang: 'en',
  dir: 'ltr',
};

// LOC-09 stage 1: an AI draft, not yet reviewed by a native speaker - the same
// caveat hebrewMergeMessages and hebrewCompressMessages above carry. Pending
// Shlomi's read-through.
const hebrewSignMessages: SignMessages = {
  toolbarLabel: 'הערות PDF',
  textButton: 'טקסט',
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
  keepOnTitleOn: 'כבו כדי לחזור לפעולה חד-פעמית. {button} נשאר מסומן בכל מקרה.',
  keepOnTitleOff: 'השאירו את {button} פעיל כדי להשתמש בו כמה פעמים. לחיצה כפולה על {button} עושה את אותו הדבר.',
  hintEsc: 'או לחצו Esc כדי לעצור לגמרי',
  hintDoubleClick: 'או לחצו לחיצה כפולה על {button}',
  armHint: 'לחיצה כפולה כדי להשאיר את {label} פעיל',
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
  replaceTail: string;
  replaceDraftGoes: string;
  theCurrentPdf: string;
  workDefault: string;
  /** Sign's own `workNoun` for the replace confirmation ("...and discards
   * your annotations"). Lives here because Sign has no island catalogue of
   * its own (its editor stays English, LOC-02) while its shell is localized. */
  signWorkNoun: string;
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
  replaceDialogTitle: 'Replace this file?',
  replaceConfirmFile: 'Replace file',
  replaceConfirmChoose: 'Choose a file',
  replaceOpening: 'Opening {file} closes {current} and discards {work}.',
  replaceChoosing: 'Choosing another file closes {current} and discards {work}.',
  replaceTail: "That can't be undone.",
  replaceDraftGoes: 'Your saved draft goes with it.',
  theCurrentPdf: 'the current PDF',
  workDefault: 'the work you have done here',
  signWorkNoun: 'your annotations',
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
  replaceDialogTitle: 'להחליף את הקובץ?',
  replaceConfirmFile: 'החלפת קובץ',
  replaceConfirmChoose: 'בחירת קובץ',
  replaceOpening: 'פתיחת {file} סוגרת את {current} ומוחקת את {work}.',
  replaceChoosing: 'בחירת קובץ אחר סוגרת את {current} ומוחקת את {work}.',
  replaceTail: 'אי אפשר לבטל את זה.',
  replaceDraftGoes: 'הטיוטה השמורה תימחק איתו.',
  theCurrentPdf: 'ה-PDF הנוכחי',
  workDefault: 'העבודה שעשיתם כאן',
  signWorkNoun: 'ההערות והחתימות שהוספתם',
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
 * unaffected. `confirmHandoffBody` takes `{file}`/`{draft}` placeholders via
 * `formatMessage`, so a translated sentence can reorder them freely (unlike
 * BasePdfTool.tsx's replace-confirmation, this dialog's file names are not
 * re-wrapped in a styled `<span>` after formatting - a minor simplification,
 * not a behavior this ticket depends on).
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
  confirmHandoffTitle: string;
  confirmHandoffConfirm: string;
  confirmHandoffBody: string;
  cancelLabel: string;
  closeLabel: string;
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
  confirmHandoffTitle: 'Open this instead?',
  confirmHandoffConfirm: 'Open it',
  confirmHandoffBody: "Opening {file} replaces your saved work in {draft}. That can't be undone.",
  cancelLabel: 'Cancel',
  closeLabel: 'Close dialog',
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
  multipleFilesPicked: 'בחרו כאן קובץ PDF אחד, או השתמשו במיזוג PDF למטה בשביל כמה קבצים.',
  notAPdf: 'בחרו קובץ PDF.',
  recentFileUnavailable: 'הקובץ הזה כבר לא זמין בדפדפן הזה.',
  sampleLoadFailed: 'לא הצלחנו לטעון את קובץ הדוגמה. נסו שוב או בחרו קובץ PDF משלכם.',
  opening: 'פותחים…',
  chooseFiles: 'בחירת קבצים',
  orDropPdfsHere: 'או גררו לכאן קבצי PDF',
  practiceDocumentCaption: 'מסמך לתרגול · נפתח בכלי {tool}',
  confirmHandoffTitle: 'לפתוח את זה במקום?',
  confirmHandoffConfirm: 'פתיחה',
  confirmHandoffBody: 'פתיחת {file} תחליף את העבודה השמורה שלכם ב-{draft}. אי אפשר לבטל את זה.',
  cancelLabel: 'ביטול',
  closeLabel: 'סגירת החלון',
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
