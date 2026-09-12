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
  sortAZ: string;
  sortZA: string;
  sortOldest: string;
  sortNewest: string;
  addPageNumbers: string;
  reorderHint: string;
  dragHandleLabel: string;
  removeLabel: string;
  merging: string;
  addOneMore: string;
  mergeCount: string;
  errorMessage: string;
  mergedReady: string;
  mergingFailed: string;
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
}

const englishMergeMessages: MergeMessages = {
  skippedOne: 'Skipped "{name}" - not a PDF.',
  skippedMany: 'Skipped {count} files - not PDFs.',
  sortAZ: 'A–Z',
  sortZA: 'Z–A',
  sortOldest: 'Oldest',
  sortNewest: 'Newest',
  addPageNumbers: 'Add page numbers',
  reorderHint: 'Drag a file by its handle to reorder, or focus a file and press the arrow up or down keys to move it.',
  dragHandleLabel: '{name}, position {position} of {total}. Drag, or press arrow up or down to move.',
  removeLabel: 'Remove {name}',
  merging: 'Merging…',
  addOneMore: 'Add 1 more to merge',
  mergeCount: 'Merge {count} PDFs',
  errorMessage: 'A file may be damaged or password-protected - remove it and try again.',
  mergedReady: 'Your merged PDF is ready.',
  mergingFailed: 'Merging failed.',
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
};

// LOC-02's own throwaway draft fixture (proves the route end to end for
// /he/merge/, per LOC-02.md's acceptance list) - not reviewed, not the
// island catalogue LOC-03 will ship. Do not treat these values as approved
// copy; the merge.yaml fixture they pair with is a draft for the same reason.
const hebrewMergeMessages: MergeMessages = {
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא PDF.',
  sortAZ: 'א–ת',
  sortZA: 'ת–א',
  sortOldest: 'הישן קודם',
  sortNewest: 'החדש קודם',
  addPageNumbers: 'הוספת מספרי עמודים',
  reorderHint: 'גררו קובץ מהידית שלו כדי לסדר מחדש, או התמקדו בקובץ ולחצו על חץ למעלה או למטה כדי להזיז אותו.',
  dragHandleLabel: '{name}, מקום {position} מתוך {total}. גררו, או לחצו על חץ למעלה או למטה כדי להזיז.',
  removeLabel: 'הסרת {name}',
  merging: 'ממזגים…',
  addOneMore: 'הוסיפו עוד קובץ אחד כדי למזג',
  mergeCount: 'מיזוג {count} קבצי PDF',
  errorMessage: 'ייתכן שאחד הקבצים פגום או מוגן בסיסמה - הסירו אותו ונסו שוב.',
  mergedReady: 'ה-PDF המאוחד מוכן.',
  mergingFailed: 'המיזוג נכשל.',
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
  addPdfToCompress: 'הוסיפו PDF או תמונה למעלה כדי לכווץ',
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
};

const compressMessages: Partial<Record<DocumentationLocaleId, CompressMessages>> = {
  en: englishCompressMessages,
  he: hebrewCompressMessages,
};

const toolMessageTables: Record<string, Partial<Record<DocumentationLocaleId, unknown>>> = {
  merge: mergeMessages,
  compress: compressMessages,
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
  draftConflict: 'Newer draft in another tab — saving here will replace it',
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
  replaceTail: 'That can’t be undone.',
  replaceDraftGoes: 'Your saved draft goes with it.',
  theCurrentPdf: 'the current PDF',
  workDefault: 'the work you have done here',
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

export {
  englishMergeMessages,
  hebrewMergeMessages,
  englishCompressMessages,
  hebrewCompressMessages,
  englishShellMessages,
  hebrewShellMessages,
};
