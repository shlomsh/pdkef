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
import type { HistoryButtonsMessages } from '../shell/HistoryButtons.tsx';
import type { ElementUpdateKind } from '../editor/model/updateKind.ts';

/** The whiteout colour group's text from a message table (the shape of `WhiteoutColorLabels`). */
export function whiteoutColorLabels(t: SignMessages) {
  return {
    group: t.whiteoutColorGroupLabel,
    auto: t.whiteoutAutoLabel,
    autoTitle: t.whiteoutAutoTitle,
    pipette: t.whiteoutPipetteLabel,
    useColorTemplate: t.whiteoutUseColorTemplate,
    customColor: t.whiteoutCustomColorLabel,
  };
}

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

/**
 * UNDO-04: the history description for a logged move, resize, style change or
 * text edit, in the tool's own words - the same `{label}` interpolation
 * `signElementTypeLabel` supplies the other description templates above.
 */
export function signUpdateDescription(t: SignMessages, kind: ElementUpdateKind, type: string): string {
  const label = signElementTypeLabel(t, type);
  switch (kind) {
    case 'move': return formatMessage(t.movedElementDescriptionTemplate, { label });
    case 'resize': return formatMessage(t.resizedElementDescriptionTemplate, { label });
    case 'style': return formatMessage(t.styledElementDescriptionTemplate, { label });
    case 'text': return t.editedTextDescription;
  }
}

/** What the shared page grid (src/shell/pageGrid/PageGrid.tsx) reads from a
 * tool's messages. */
export interface PageGridMessages {
  captionPages: string;
  includePage: string;
  openPreview: string;
  pageIncluded: string;
  pageItemLabel: string;
  pageMoved: string;
  pageRotated: string;
  pageSkipped: string;
  previewClose: string;
  previewIncludeAgain: string;
  previewLoading: string;
  previewNext: string;
  previewPrev: string;
  previewSkippedBanner: string;
  previewSkippedNote: string;
  previewTitle: string;
  rotatePage: string;
  skipPage: string;
  skippedBadge: string;
  skippedState: string;
  /** Visible to assistive tech only (sr-only), like the file list's reorderHint. */
  stripHint: string;
  /** A small always-in-the-DOM tooltip word inside each page action button
   * (rotate/skip/open), shown on hover/focus - the button's `aria-label`
   * stays the real accessible name. */
  tipBringBack: string;
  tipOpen: string;
  tipRotate: string;
  tipSkip: string;
}

/** What the shared Download element (src/shell/DownloadElement.tsx) reads from a
 * tool's messages. */
export interface DownloadMessages {
  /** The 'one-file' state's label; only a tool that can block on one file needs it. */
  addOneMore?: string;
  /** The Download element's detail when no page is left to export. */
  allSkipped: string;
  downloadAgain: string;
  downloadLabel: string;
  /** The error state's label when the caller passes no `errorMessage`. */
  buildFailed: string;
  preparingPages: string;
  renderProgress: string;
  savedLabel: string;
}

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

const englishMergeMessages: MergeMessages = {
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
const hebrewMergeMessages: MergeMessages = {
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
  skippedState: ', מדולג',
  skippedBadge: 'מדולג',
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
  renderProgress: '{done} מתוך {total} עומדו',
  savedLabel: 'נשמר',
  downloadAgain: 'הורדה שוב',
  buildFailed: 'תקנו את הקובץ למעלה כדי לאחד',
  allSkipped: 'כל העמודים מדולגים',
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

export interface CompressMessages {
  /** Text direction; a size inside a sentence is bidi-isolated when 'rtl'. */
  dir: 'ltr' | 'rtl';
  skippedOne: string;
  skippedMany: string;
  levelHighDesc: string;
  levelMediumDesc: string;
  levelLowDesc: string;
  targetDesc: string;
  targetSizeLabel: string;
  levelPickerLabel: string;
  levelHighShort: string;
  levelMediumShort: string;
  levelLowShort: string;
  targetShort: string;
  percentSmaller: string;
  stripShareNote: string;
  stripShareLowNote: string;
  compressing: string;
  dropHint: string;
  compressionFailedTitle: string;
  compressionFailedBody: string;
  tryAgain: string;
  originalSize: string;
  spaceSaved: string;
  savedPercent: string;
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
  imageCompressionFailedBody: string;
  originalDimensions: string;
  outputDimensions: string;
  imageClosestAchievable: string;
  formatNotice: string;
  passthroughNotice: string;
  /** A PDF that re-rendering would only make bigger: handed back untouched. */
  alreadySmallTitle: string;
  /** The image path could not open the PDF without its password. */
  lockedTitle: string;
  unsupportedTitle: string;
  underTargetTitle: string;
  imageUnderTargetTitle: string;
  alreadySmallNotice: string;
  alreadySmallTargetNotice: string;
  noImagesTitle: string;
  lessThanOnePercent: string;
  asImagesSize: string;
  keptOriginal: string;
  alreadySmallComplete: string;
  flattenLabel: string;
  flattenHint: string;
  /** The same switch on a PDF with no text: only the softening applies. */
  flattenHintNoText: string;
  slightGainTitle: string;
  slightGainCompactNotice: string;
  slightGainExtremeHint: string;
  slightGainKeptNotice: string;
  imagesTargetMissedNotice: string;
  imagesNoImagesNotice: string;
  imagesNoGainNotice: string;
  imagesUnsupportedNotice: string;
  imagesEncryptedNotice: string;
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
  downloadDetailClosest: string;
  compareRendering: string;
  compareRenderFailed: string;
  compareFullscreenLabel: string;
  compareCloseLabel: string;
  compareBeforeLabel: string;
  compareAfterLabel: string;
  compareCaptionImage: string;
  compareCaptionPdf: string;
  compareCaptionPdfSingle: string;
  /** ENC-08: the protected-file state (src/shell/NeedsUnlock.tsx), shown for a PDF that needs a password. */
  protectedNeedsPasswordTitle: string;
  protectedNeedsPasswordBody: string;
  protectedUnlockIt: string;
  protectedHandoffFailed: string;
}

const englishCompressMessages: CompressMessages = {
  dir: 'ltr',
  skippedOne: 'Skipped "{name}" - not a PDF, JPG or PNG.',
  skippedMany: 'Skipped {count} files - not PDF, JPG or PNG files.',
  levelHighDesc: 'The smallest file. Photos and scans are scaled down the most.',
  levelMediumDesc: 'A good balance of size and clarity for most documents.',
  levelLowDesc: 'A lighter touch. Images stay close to the original.',
  targetDesc: 'Compress down to a specific file size, e.g. for a 100KB upload limit.',
  targetSizeLabel: 'Target size',
  levelPickerLabel: 'How small',
  levelHighShort: 'Smallest',
  levelMediumShort: 'Balanced',
  levelLowShort: 'Sharpest',
  targetShort: 'Exact size',
  percentSmaller: '{percent}% smaller',
  stripShareNote: 'Images are {share} of this PDF, the part that gets smaller.',
  stripShareLowNote: 'Most of this PDF is text. Images are {share} of it.',
  compressing: 'Compressing…',
  dropHint: 'Drop a PDF or image here',
  compressionFailedTitle: 'Compression failed.',
  tryAgain: 'Try again',
  compressionFailedBody: 'The file may be password-protected or corrupted. Please try another PDF.',
  originalSize: 'Original Size',
  spaceSaved: 'Space Saved',
  savedPercent: 'Saved {percent}%',
  closestAchievable: "Closest achievable size: {size} couldn't be reached without making the document unreadable, so this is the smallest readable result.",
  rasterizeNotice: 'Notice: Compression rasterizes PDF pages into images to reduce file size. Embedded links and text selection/copying will be disabled on the compressed document.',
  downloadLabel: 'Download Compressed PDF',
  shareLabel: 'Share Compressed PDF',
  loaded: 'File "{name}" loaded.',
  starting: 'Starting PDF compression...',
  complete: 'PDF compression complete. Your file is ready.',
  failed: 'PDF compression failed.',
  sharedSuccessfully: 'Compressed PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your compressed PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  imageCompressionFailedBody: 'The file may be corrupted or an unsupported image. Please try another JPG or PNG.',
  originalDimensions: 'Original Dimensions',
  outputDimensions: 'Output Dimensions',
  imageClosestAchievable: "Closest achievable size: {size} couldn't be reached on this photo without making it unusable, so this is the smallest result found.",
  formatNotice: 'Notice: once compressed, the output is a JPEG. A transparent PNG background is filled in white, and re-encoding drops EXIF metadata, including location. A screenshot or scan of text can show visible JPEG artefacts, especially at a small target.',
  passthroughNotice: 'Already under the target, so the file is untouched: same file, same format, nothing re-encoded.',
  alreadySmallTitle: 'Already as small as it gets',
  lockedTitle: 'This PDF is locked',
  unsupportedTitle: 'Left as it was',
  underTargetTitle: 'Already under your target',
  imageUnderTargetTitle: 'Already under your target',
  alreadySmallNotice: "Turned into images, this PDF came to {raster}, more than the {original} it is now, so there was nothing to gain. I've kept your original as it is, text and links included.",
  alreadySmallTargetNotice: "Turned into images, this PDF came to {raster}, more than the {original} it is now, so {target} can't be reached this way. I've kept your original as it is, text and links included.",
  noImagesTitle: 'Nothing here to shrink.',
  lessThanOnePercent: 'less than 1%',
  asImagesSize: 'As images',
  keptOriginal: 'None, original kept',
  alreadySmallComplete: 'This PDF is already as small as it gets, so it is unchanged.',
  flattenLabel: 'Turn pages into pictures',
  flattenHint: 'The smallest size for scans. Text stops being selectable, links stop working, and small text gets softer.',
  flattenHintNoText: 'The smallest size for scans. Small detail gets softer.',
  slightGainTitle: 'Only a little smaller',
  slightGainCompactNotice: 'The images in this PDF were already compact, so making them smaller saved {saving}.',
  slightGainExtremeHint: '"Smallest" can go further, and photos look soft when zoomed in.',
  slightGainKeptNotice: "Most of the image data in this PDF is stored in a way I can't recompress, so it stayed as it was and this saved {saving}. Turning the pages into pictures, with the switch above, can go smaller.",
  imagesTargetMissedNotice: 'Shrinking the images got this PDF to {size}, above your {target} target. Turning the pages into pictures, with the switch above, can go smaller.',
  imagesNoImagesNotice: 'There are no images in this PDF, so there was nothing to make smaller. Your original is unchanged.',
  imagesNoGainNotice: 'The images in this PDF are already compact, so making them smaller saved nothing. Your original is unchanged.',
  imagesUnsupportedNotice: "The images in this PDF are stored in a way I can't recompress, so nothing was changed. Turning the pages into pictures still works, with the switch above.",
  imagesEncryptedNotice: "This PDF is locked, so its images can't be recompressed here. Your original is unchanged. If you have its password, unlock it first, then compress it.",
  imageDownloadLabel: 'Download Compressed Image',
  imageShareLabel: 'Share Compressed Image',
  imageLoaded: 'File "{name}" loaded.',
  imageStarting: 'Starting image compression...',
  imageComplete: 'Image compression complete. Your file is ready.',
  missedTarget: 'Target missed. Showing the smallest result found instead.',
  imageFailed: 'Image compression failed.',
  imageSharedSuccessfully: 'Compressed image shared successfully.',
  imageSharingCanceled: 'Sharing canceled. Your compressed image is still ready.',
  downloadDetailClosest: 'closest achievable: {size}',
  compareRendering: 'Rendering page 1 for comparison…',
  compareRenderFailed: "Couldn't render a preview for this file.",
  compareFullscreenLabel: 'Full screen',
  compareCloseLabel: 'Close',
  compareBeforeLabel: 'Original',
  compareAfterLabel: 'Compressed',
  compareCaptionImage: 'Drag to compare the original and the compressed image.',
  compareCaptionPdf: 'Drag to compare page 1 with the original.',
  compareCaptionPdfSingle: 'Drag to compare the original and the compressed page.',
  protectedNeedsPasswordTitle: 'This PDF has a password',
  protectedNeedsPasswordBody: 'Unlock opens it on your device, then you can compress it.',
  protectedUnlockIt: 'Unlock it',
  protectedHandoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
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
  dir: 'rtl',
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF, JPG או PNG.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא קבצי PDF, JPG או PNG.',
  levelHighDesc: 'הקובץ הקטן ביותר. תמונות וסריקות מוקטנות הכי הרבה.',
  levelMediumDesc: 'איזון טוב בין גודל לחדות ברוב המסמכים.',
  levelLowDesc: 'נגיעה עדינה. התמונות נשארות קרובות למקור.',
  targetDesc: 'כווצו לגודל קובץ מסוים, למשל למגבלת העלאה של 100KB.',
  targetSizeLabel: 'גודל בהתאמה אישית',
  levelPickerLabel: 'כמה לכווץ',
  levelHighShort: 'הכי קטן',
  levelMediumShort: 'מאוזן',
  levelLowShort: 'הכי חד',
  targetShort: 'גודל מדויק',
  percentSmaller: 'קטן ב-{percent}%',
  stripShareNote: 'התמונות הן {share} מה-PDF הזה, החלק שקטן.',
  stripShareLowNote: 'רוב ה-PDF הזה הוא טקסט. התמונות הן {share} ממנו.',
  compressing: 'מכווצים…',
  dropHint: 'גררו לכאן PDF או תמונה',
  compressionFailedTitle: 'הכיווץ נכשל.',
  tryAgain: 'לנסות שוב',
  compressionFailedBody: 'ייתכן שהקובץ מוגן בסיסמה או פגום. נסו קובץ PDF אחר.',
  originalSize: 'גודל מקורי',
  spaceSaved: 'נחסך',
  savedPercent: 'נחסכו {percent}%',
  closestAchievable: 'הגודל הקרוב ביותר שהושג: לא הצלחנו להגיע ל-{size} בלי להפוך את המסמך לבלתי קריא, אז זו התוצאה הקריאה הכי קטנה.',
  rasterizeNotice: 'שימו לב: הכיווץ הופך את עמודי ה-PDF לתמונות כדי להקטין את גודל הקובץ. קישורים מוטבעים וחיפוש/העתקת טקסט יהיו מושבתים במסמך המכווץ.',
  downloadLabel: 'הורדת PDF מכווץ',
  shareLabel: 'שיתוף PDF מכווץ',
  loaded: 'הקובץ "{name}" נטען.',
  starting: 'מתחילים בכיווץ ה-PDF...',
  complete: 'כיווץ ה-PDF הושלם. הקובץ שלכם מוכן.',
  failed: 'כיווץ ה-PDF נכשל.',
  sharedSuccessfully: 'ה-PDF המכווץ שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF המכווץ עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  imageCompressionFailedBody: 'ייתכן שהקובץ פגום או שזה סוג תמונה לא נתמך. נסו קובץ JPG או PNG אחר.',
  originalDimensions: 'מידות מקוריות',
  outputDimensions: 'מידות לאחר כיווץ',
  imageClosestAchievable: 'הגודל הקרוב ביותר שהושג: לא הצלחנו להגיע ל-{size} בתמונה הזו בלי להפוך אותה לבלתי שמישה, אז זו התוצאה הקטנה ביותר שנמצאה.',
  formatNotice: 'שימו לב: לאחר הכיווץ הפלט הוא JPEG. רקע שקוף בקובץ PNG יתמלא בלבן, וקידוד מחדש מוחק נתוני EXIF, כולל מיקום. צילום מסך או סריקה של טקסט עלולים להראות עיוותי JPEG גלויים, בעיקר בגודל יעד קטן.',
  passthroughNotice: 'הקובץ כבר קטן מהיעד, אז השארנו אותו כמו שהוא: אותו קובץ, אותו פורמט, בלי קידוד מחדש.',
  alreadySmallTitle: 'הקובץ כבר קטן ככל האפשר',
  lockedTitle: 'ה-PDF הזה נעול',
  unsupportedTitle: 'הקובץ נשאר כמו שהוא',
  underTargetTitle: 'כבר מתחת ליעד שלכם',
  imageUnderTargetTitle: 'כבר מתחת ליעד שלכם',
  alreadySmallNotice: 'כשהפכנו את העמודים לתמונות, ה-PDF יצא {raster}, יותר מה-{original} שלו עכשיו, אז לא היה מה להרוויח. השארנו את הקובץ המקורי כמו שהוא, כולל טקסט וקישורים.',
  alreadySmallTargetNotice: 'כשהפכנו את העמודים לתמונות, ה-PDF יצא {raster}, יותר מה-{original} שלו עכשיו, אז אי אפשר להגיע ל-{target} בדרך הזו. השארנו את הקובץ המקורי כמו שהוא, כולל טקסט וקישורים.',
  noImagesTitle: 'אין כאן מה לכווץ.',
  lessThanOnePercent: 'פחות מ-1%',
  asImagesSize: 'כתמונות',
  keptOriginal: 'אין, המקור נשמר',
  alreadySmallComplete: 'ה-PDF הזה כבר קטן ככל האפשר, אז הוא נשאר ללא שינוי.',
  flattenLabel: 'להפוך עמודים לתמונות',
  flattenHint: 'הגודל הקטן ביותר לסריקות. אי אפשר יהיה לסמן טקסט, קישורים יפסיקו לעבוד, וטקסט קטן ייראה פחות חד.',
  flattenHintNoText: 'הגודל הקטן ביותר לסריקות. פרטים קטנים ייראו פחות חדים.',
  slightGainTitle: 'קטן רק במעט',
  slightGainCompactNotice: 'התמונות ב-PDF הזה כבר היו קומפקטיות, אז הקטנה שלהן חסכה {saving}.',
  slightGainExtremeHint: '"הכי קטן" יכול להקטין עוד, ותמונות נראות מטושטשות בהגדלה.',
  slightGainKeptNotice: 'רוב נתוני התמונה ב-PDF הזה שמורים בצורה שאנחנו לא יכולים לדחוס מחדש, אז הם נשארו כמו שהיו וזה חסך {saving}. הפיכת העמודים לתמונות, עם המתג למעלה, יכולה להקטין עוד.',
  imagesTargetMissedNotice: 'הקטנת התמונות הביאה את ה-PDF ל-{size}, מעל היעד של {target}. הפיכת העמודים לתמונות, עם המתג למעלה, יכולה להקטין עוד.',
  imagesNoImagesNotice: 'אין תמונות ב-PDF הזה, אז לא היה מה להקטין. הקובץ המקורי לא השתנה.',
  imagesNoGainNotice: 'התמונות ב-PDF הזה כבר קומפקטיות, אז הקטנה שלהן לא חסכה כלום. הקובץ המקורי לא השתנה.',
  imagesUnsupportedNotice: 'התמונות ב-PDF הזה שמורות בצורה שאנחנו לא יכולים לדחוס מחדש, אז שום דבר לא השתנה. אפשר עדיין להפוך את העמודים לתמונות, עם המתג למעלה.',
  imagesEncryptedNotice: 'ה-PDF הזה נעול, ולכן אי אפשר לדחוס כאן את התמונות שבו. הקובץ המקורי לא השתנה. אם יש לכם את הסיסמה, בטלו קודם את הנעילה ואז כווצו אותו.',
  imageDownloadLabel: 'הורדת תמונה מכווצת',
  imageShareLabel: 'שיתוף תמונה מכווצת',
  imageLoaded: 'הקובץ "{name}" נטען.',
  imageStarting: 'מתחילים בכיווץ התמונה...',
  imageComplete: 'כיווץ התמונה הושלם. הקובץ שלכם מוכן.',
  missedTarget: 'לא הגענו ליעד. מוצגת התוצאה הקטנה ביותר שנמצאה.',
  imageFailed: 'כיווץ התמונה נכשל.',
  imageSharedSuccessfully: 'התמונה המכווצת שותפה.',
  imageSharingCanceled: 'השיתוף בוטל. התמונה המכווצת עדיין מוכנה.',
  downloadDetailClosest: 'הגודל הקרוב ביותר: {size}',
  compareRendering: 'מעבדים את עמוד 1 להשוואה…',
  compareRenderFailed: 'לא הצלחנו להציג תצוגה מקדימה לקובץ הזה.',
  compareFullscreenLabel: 'מסך מלא',
  compareCloseLabel: 'סגירה',
  compareBeforeLabel: 'מקור',
  compareAfterLabel: 'מכווץ',
  compareCaptionImage: 'גררו כדי להשוות בין התמונה המקורית לתמונה המכווצת.',
  compareCaptionPdf: 'גררו כדי להשוות את עמוד 1 למקור.',
  compareCaptionPdfSingle: 'גררו כדי להשוות בין העמוד המקורי לעמוד המכווץ.',
  protectedNeedsPasswordTitle: 'לקובץ ה-PDF הזה יש סיסמה',
  protectedNeedsPasswordBody: 'הסרת הנעילה פותחת אותו במכשיר שלכם, ואז אפשר לכווץ אותו.',
  protectedUnlockIt: 'הסרת נעילה',
  protectedHandoffFailed: 'לא הצלחנו לפתוח את הקובץ בכלי הסרת הנעילה. פתחו את הכלי ובחרו אותו שם.',
};

const compressMessages: Partial<Record<DocumentationLocaleId, CompressMessages>> = {
  en: englishCompressMessages,
  he: hebrewCompressMessages,
};

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
  /** '{unlock}' is the link. */
  protectedBody: string;
  splitFailedBody: string;
  unlockLink: string;
  pageOne: string;
  pageOther: string;
  pdfOne: string;
  pdfOther: string;
  /** aria-label of the editable output name in the combined heading. */
  fileNameEditableLabel: string;
  /** '{files}' is a pdfOne/pdfOther phrase. */
  headingSeparate: string;
  /** '{selected}' of '{pages}' (a page phrase). */
  pageCountOf: string;
  rendering: string;
  undo: string;
  undoRotated: string;
  canvasLabel: string;
  railLabel: string;
  frameOneDocument: string;
  frameSeparate: string;
  pickAtLeastOne: string;
  frameNoteOne: string;
  frameNoteMany: string;
  /** '{name}' is the file's base name. */
  eachSavesAs: string;
  hintAllIn: string;
  hintSomeOut: string;
  pagesLabel: string;
  selectAll: string;
  clear: string;
  pageSelectorPlaceholder: string;
  modeGroupLabel: string;
  modeCombined: string;
  modeSeparate: string;
  modeNoteCombined: string;
  modeNoteSeparate: string;
  pageAria: string;
  rotateAria: string;
  openPreview: string;
  previewTitle: string;
  previewClose: string;
  previewPrev: string;
  previewNext: string;
  previewLoading: string;
  previewLeftOut: string;
  previewLeaveOut: string;
  previewBringBack: string;
  pageCell: string;
  preparing: string;
  cannotPrepare: string;
  saved: string;
  savedMany: string;
  downloadAgain: string;
  downloadOne: string;
  downloadMany: string;
  detailCombined: string;
  detailSeparate: string;
  shareOne: string;
  shareMany: string;
  compress: string;
  handoffFailed: string;
  /* Screen-reader announcements. */
  announceLoaded: string;
  announceProtected: string;
  announceLoadFailed: string;
  announcePrepareFailed: string;
  announceRotated: string;
  announceCombined: string;
  announceSeparate: string;
  announcePreparingTap: string;
  announceSavedOne: string;
  announceSavedMany: string;
  announceShared: string;
  announceShareCanceled: string;
  announceShareError: string;
  /* parsePageSelector's errors, rebuilt from its code and params. */
  outOfRange: string;
  rangeOutOfRange: string;
  invalidPart: string;
  noValidPages: string;
  /* The shared page grid's own strings (Split reads the same Download and Undo/Redo elements). */
  includeAll: string;
  skipAll: string;
  invert: string;
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

const englishSplitMessages: SplitMessages = {
  lang: 'en',
  dir: 'ltr',
  skippedOne: 'Skipped “{name}” - not a PDF.',
  skippedMany: 'Skipped {count} files - not PDFs.',
  loadingPages: 'Loading document pages...',
  protectedBody: 'This PDF is protected. Open it in {unlock} first, then split it here.',
  splitFailedBody: 'The split failed. A protected PDF opens in {unlock} first. Otherwise the file may be damaged.',
  unlockLink: 'Unlock',
  pageOne: '1 page',
  pageOther: '{count} pages',
  pdfOne: '1 PDF',
  pdfOther: '{count} PDFs',
  fileNameEditableLabel: 'File name, editable',
  headingSeparate: '{files}, one page each',
  pageCountOf: '{selected} of {pages}',
  rendering: 'Rendering {done} of {total}',
  undo: 'Undo',
  undoRotated: 'Rotated page {number}',
  canvasLabel: 'Your split PDF',
  railLabel: 'Split options',
  frameOneDocument: 'one document',
  frameSeparate: 'separate documents',
  pickAtLeastOne: 'Pick at least one page',
  frameNoteOne: 'page {range}',
  frameNoteMany: 'pages {range}',
  eachSavesAs: 'each saves as {name}',
  hintAllIn: 'Every page is in. Click a page to leave it out.',
  hintSomeOut: 'Dimmed pages are left out. Click one to bring it back.',
  pagesLabel: 'Pages',
  selectAll: 'Select all',
  clear: 'Clear',
  pageSelectorPlaceholder: 'e.g. 1-3, 5, 8-',
  modeGroupLabel: 'What to save',
  modeCombined: 'One PDF',
  modeSeparate: 'One PDF per page',
  modeNoteCombined: 'Selected pages become a single PDF.',
  modeNoteSeparate: 'Each selected page becomes its own PDF.',
  pageAria: 'Page {number}',
  rotateAria: 'Rotate page {number}',
  openPreview: 'Open page {number} larger',
  previewTitle: 'Page {number} of {total}',
  previewClose: 'Close',
  previewPrev: 'Previous page',
  previewNext: 'Next page',
  previewLoading: 'Rendering the page…',
  previewLeftOut: 'Left out of the download',
  previewLeaveOut: 'Leave out',
  previewBringBack: 'Bring back',
  pageCell: 'Page {number}',
  preparing: 'Preparing {pages}…',
  cannotPrepare: 'Could not prepare this PDF',
  saved: 'Saved',
  savedMany: 'Saved {files}',
  downloadAgain: 'download again',
  downloadOne: 'Download 1 PDF',
  downloadMany: 'Download {files}',
  detailCombined: '{pages} · {size}',
  detailSeparate: '1 page each · {size}',
  shareOne: 'Share PDF',
  shareMany: 'Share {count} PDFs',
  compress: 'Compress',
  handoffFailed: 'Could not hand the file to Compress. Download it and open Compress instead.',
  announceLoaded: 'Loaded PDF "{name}" with {count} pages.',
  announceProtected: 'This PDF is protected. Open it in Unlock first.',
  announceLoadFailed: 'Failed to load PDF file.',
  announcePrepareFailed: 'Could not prepare the split PDF.',
  announceRotated: 'Page {number} rotated.',
  announceCombined: 'Selected pages will become a single PDF.',
  announceSeparate: 'Each selected page will become its own PDF.',
  announcePreparingTap: 'Preparing. The download starts as soon as it is ready.',
  announceSavedOne: 'PDF saved.',
  announceSavedMany: '{count} PDFs saved.',
  announceShared: 'Split PDF files shared successfully.',
  announceShareCanceled: 'Sharing canceled. Your PDF files are still ready.',
  announceShareError: 'Could not open the share sheet. Please try again.',
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
  invert: 'Invert',
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
const hebrewSplitMessages: SplitMessages = {
  lang: 'he',
  dir: 'rtl',
  skippedOne: 'דילגנו על "{name}" - זה לא קובץ PDF.',
  skippedMany: 'דילגנו על {count} קבצים - הם לא קבצי PDF.',
  loadingPages: 'טוענים את עמודי המסמך...',
  protectedBody: 'ה-PDF הזה מוגן. קודם פותחים אותו ב{unlock}, ואז מפצלים אותו כאן.',
  splitFailedBody: 'הפיצול נכשל. קובץ PDF מוגן נפתח קודם ב{unlock}. אם הוא לא מוגן, ייתכן שהקובץ פגום.',
  unlockLink: 'הסרת נעילה',
  pageOne: 'עמוד אחד',
  pageOther: '{count} עמודים',
  pdfOne: 'קובץ PDF אחד',
  pdfOther: '{count} קבצי PDF',
  fileNameEditableLabel: 'שם הקובץ, ניתן לעריכה',
  headingSeparate: '{files}, עמוד אחד בכל קובץ',
  pageCountOf: '{selected} מתוך {pages}',
  rendering: 'מציגים {done} מתוך {total}',
  undo: 'ביטול',
  undoRotated: 'סובב עמוד {number}',
  canvasLabel: 'ה-PDF המפוצל שלכם',
  railLabel: 'אפשרויות פיצול',
  frameOneDocument: 'מסמך אחד',
  frameSeparate: 'מסמכים נפרדים',
  pickAtLeastOne: 'בחרו לפחות עמוד אחד',
  frameNoteOne: 'עמוד {range}',
  frameNoteMany: 'עמודים {range}',
  eachSavesAs: 'כל עמוד נשמר בשם {name}',
  hintAllIn: 'כל העמודים כלולים. לחצו על עמוד כדי להשאיר אותו בחוץ.',
  hintSomeOut: 'עמודים עמומים נשארים בחוץ. לחצו על עמוד כדי להחזיר אותו.',
  pagesLabel: 'עמודים',
  selectAll: 'בחירת הכול',
  clear: 'ניקוי',
  pageSelectorPlaceholder: 'לדוגמה 1-3, 5, 8-',
  modeGroupLabel: 'מה לשמור',
  modeCombined: 'PDF אחד',
  modeSeparate: 'PDF לכל עמוד',
  modeNoteCombined: 'העמודים שבחרתם יהפכו לקובץ PDF אחד.',
  modeNoteSeparate: 'כל עמוד שבחרתם יהפוך לקובץ PDF משלו.',
  pageAria: 'עמוד {number}',
  rotateAria: 'סיבוב עמוד {number}',
  openPreview: 'הגדלת עמוד {number}',
  previewTitle: 'עמוד {number} מתוך {total}',
  previewClose: 'סגירה',
  previewPrev: 'העמוד הקודם',
  previewNext: 'העמוד הבא',
  previewLoading: 'מציירים את העמוד…',
  previewLeftOut: 'לא ייכלל בהורדה',
  previewLeaveOut: 'להשאיר בחוץ',
  previewBringBack: 'להחזיר',
  pageCell: 'עמוד {number}',
  preparing: 'מכינים {pages}…',
  cannotPrepare: 'לא הצלחנו להכין את ה-PDF הזה',
  saved: 'נשמר',
  savedMany: 'נשמרו {files}',
  downloadAgain: 'הורדה שוב',
  downloadOne: 'הורדת PDF אחד',
  downloadMany: 'הורדת {files}',
  detailCombined: '{pages} · {size}',
  detailSeparate: 'עמוד אחד בכל קובץ · {size}',
  shareOne: 'שיתוף PDF',
  shareMany: 'שיתוף {count} קבצי PDF',
  compress: 'כיווץ',
  handoffFailed: 'לא הצלחנו להעביר את הקובץ לכיווץ. הורידו אותו ופתחו את הכיווץ בעצמכם.',
  announceLoaded: 'הקובץ "{name}" נטען, {count} עמודים.',
  announceProtected: 'ה-PDF הזה מוגן. קודם פותחים אותו בהסרת נעילה.',
  announceLoadFailed: 'טעינת קובץ ה-PDF נכשלה.',
  announcePrepareFailed: 'לא הצלחנו להכין את ה-PDF המפוצל.',
  announceRotated: 'עמוד {number} סובב.',
  announceCombined: 'העמודים שבחרתם יהפכו לקובץ PDF אחד.',
  announceSeparate: 'כל עמוד שבחרתם יהפוך לקובץ PDF משלו.',
  announcePreparingTap: 'מכינים. ההורדה תתחיל ברגע שהקובץ יהיה מוכן.',
  announceSavedOne: 'ה-PDF נשמר.',
  announceSavedMany: 'נשמרו {count} קבצי PDF.',
  announceShared: 'קבצי ה-PDF המפוצלים שותפו.',
  announceShareCanceled: 'השיתוף בוטל. קבצי ה-PDF עדיין מוכנים.',
  announceShareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  outOfRange: 'עמוד {number} מחוץ לטווח (1-{max})',
  rangeOutOfRange: 'הטווח {start}-{end} כולל עמודים מחוץ לטווח (1-{max})',
  invalidPart: 'טווח או מספר עמוד לא תקין: "{part}"',
  noValidPages: 'לא נבחרו עמודים תקינים',
  captionPages: 'עמודים {from} עד {to}',
  includePage: 'הוספת עמוד {number}',
  pageIncluded: 'עמוד {number} הוחזר.',
  pageItemLabel: 'עמוד {number} מתוך {total}{state}',
  pageMoved: 'העמוד עבר למקום {position} מתוך {total}.',
  pageRotated: 'עמוד {number} סובב ל-{degrees} מעלות.',
  pageSkipped: 'דילגנו על עמוד {number}. הוא נשאר כאן ולא ייכלל בהורדה.',
  previewIncludeAgain: 'להחזיר אותו',
  previewSkippedBanner: 'לא ייכלל ב-PDF המפוצל',
  previewSkippedNote: 'לא ייכלל בהורדה.',
  rotatePage: 'סיבוב עמוד {number}',
  skipPage: 'דילוג על עמוד {number}',
  skippedBadge: 'מדולג',
  skippedState: ', מדולג',
  stripHint: 'התמקדו בעמוד ולחצו R כדי לסובב אותו, Delete כדי לדלג עליו, או Enter כדי לפתוח אותו בגדול.',
  tipBringBack: 'הצגה',
  tipOpen: 'פתיחה',
  tipRotate: 'סיבוב',
  tipSkip: 'דילוג',
  allSkipped: 'כל העמודים מדולגים',
  downloadLabel: 'הורדת PDF אחד',
  buildFailed: 'לא הצלחנו לפצל את ה-PDF הזה',
  preparingPages: 'מכינים {count} עמודים…',
  renderProgress: '{done} מתוך {total} עומדו',
  savedLabel: 'נשמר',
  redo: 'ביצוע מחדש',
  undoLabel: 'ביטול השינוי האחרון',
  redoLabel: 'ביצוע מחדש של השינוי שבוטל',
  includeAll: 'הוספת הכול',
  skipAll: 'דילוג על הכול',
  invert: 'היפוך',
  documentHeading: 'ה-PDF המפוצל שלכם',
  downloadShort: 'הורדה',
  readyAnnouncement: 'ה-PDF שלכם מוכן.',
  sharedSuccessfully: 'ה-PDF המפוצל שותף.',
  sharingCanceled: 'השיתוף בוטל. ה-PDF עדיין מוכן.',
  shareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  undoneAnnouncement: 'השינוי האחרון בוטל',
  redoneAnnouncement: 'השינוי בוצע מחדש',
  allIncluded: 'כל העמודים כלולים.',
  inverted: 'העמודים הכלולים והמדולגים התחלפו.',
  loaded: 'הקובץ "{name}" נטען, {count} עמודים.',
  loadFailed: 'טעינת קובץ ה-PDF נכשלה.',
  announceNeedsPassword: 'ל-PDF הזה יש סיסמה',
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

/**
 * The PDF to Image island's strings. English is the source of truth and is
 * byte for byte what PdfToImageTool.tsx rendered before it took a catalogue.
 * `{format}` is PNG or JPG, which stay Latin on every locale. The output file
 * names (`<name>-page-N.png`) are real file names and are never translated.
 */
export interface ToImageMessages {
  lang: string;
  dir: 'ltr' | 'rtl';
  formatGroupLabel: string;
  formatLabel: string;
  qualityGroupLabel: string;
  qualityLabel: string;
  qualityStandard: string;
  qualityStandardHint: string;
  qualityHigh: string;
  qualityHighHint: string;
  qualityMaximum: string;
  qualityMaximumHint: string;
  layoutGroupLabel: string;
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
  pickAtLeastOne: string;
  hintAllIn: string;
  hintSomeOut: string;
  /** A tile's caption and accessible name. */
  pageRow: string;
  tileLeftOut: string;
  /** '{count}' is the number of pages in the one tall image. */
  tallCaptionOne: string;
  tallCaptionMany: string;
  downloadPageAria: string;
  /* The shared page-preview dialog, as Split's. */
  openPreview: string;
  previewTitle: string;
  previewClose: string;
  previewPrev: string;
  previewNext: string;
  previewLoading: string;
  previewLeftOut: string;
  previewLeaveOut: string;
  previewBringBack: string;
  converting: string;
  convertFailed: string;
  buildFailed: string;
  /** Detail line under the Download above the auto-build page limit, before anything is built. */
  madeOnTap: string;
  cannotConvert: string;
  /** '{format}' is PNG or JPG. */
  downloadOne: string;
  /** '{count}' images, '{format}' is PNG or JPG. */
  downloadMany: string;
  /** '{label}' is the line above, '{size}' the total size. */
  downloadDetail: string;
  shareOne: string;
  shareMany: string;
  /* Screen-reader announcements. */
  announceReady: string;
  announcePreparingTap: string;
  announceShared: string;
  announceShareCanceled: string;
  announceShareError: string;
  /* parsePageSelector's errors, rebuilt from its code and params. */
  outOfRange: string;
  rangeOutOfRange: string;
  invalidPart: string;
  noValidPages: string;
}

const englishToImageMessages: ToImageMessages = {
  lang: 'en',
  dir: 'ltr',
  formatGroupLabel: 'Image format',
  formatLabel: 'Format',
  qualityGroupLabel: 'Image quality',
  qualityLabel: 'Quality',
  qualityStandard: 'Standard',
  qualityStandardHint: '~72 DPI - smallest file size, fine for screen viewing.',
  qualityHigh: 'High',
  qualityHighHint: '~144 DPI - sharp on most screens, good default for printing.',
  qualityMaximum: 'Maximum',
  qualityMaximumHint: '~216 DPI - largest file size, best for zooming in or large prints.',
  layoutGroupLabel: 'Output layout',
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
  pickAtLeastOne: 'Pick at least one page',
  hintAllIn: 'Every page is in. Select a page to leave it out.',
  hintSomeOut: 'Dimmed pages are left out. Select one to bring it back.',
  pageRow: 'Page {number}',
  tileLeftOut: 'left out',
  tallCaptionOne: 'One image, 1 page',
  tallCaptionMany: 'One image, {count} pages',
  downloadPageAria: 'Download page {number}',
  openPreview: 'Open page {number} larger',
  previewTitle: 'Page {number} of {total}',
  previewClose: 'Close',
  previewPrev: 'Previous page',
  previewNext: 'Next page',
  previewLoading: 'Rendering the page…',
  previewLeftOut: 'Left out of the download',
  previewLeaveOut: 'Leave out',
  previewBringBack: 'Bring back',
  converting: 'Converting…',
  convertFailed: 'The file may be damaged or password-protected - try another PDF.',
  buildFailed: 'Could not make the images. Tap to try again.',
  madeOnTap: 'Made when you tap',
  cannotConvert: 'Could not make the images',
  downloadOne: 'Download {format}',
  downloadMany: 'Download {count} {format}s',
  downloadDetail: '{label} · {size}',
  shareOne: 'Share {format}',
  shareMany: 'Share {count} images',
  announceReady: 'Your images are ready.',
  announcePreparingTap: 'Converting. The download starts as soon as it is ready.',
  announceShared: 'Images shared successfully.',
  announceShareCanceled: 'Sharing canceled. Your images are still ready.',
  announceShareError: 'Could not open the share sheet. Please try again.',
  outOfRange: 'Page number {number} out of range (1-{max})',
  rangeOutOfRange: 'Range {start}-{end} contains out of range page numbers (1-{max})',
  invalidPart: 'Invalid page range or number: "{part}"',
  noValidPages: 'No valid pages selected',
};

// An AI draft, not reviewed copy: pairs with he/pdf-to-image.yaml and awaits
// Shlomi's read. Terms follow Merge's, Compress's and Split's Hebrew
// catalogues for shared ideas (הורדה, שיתוף, עמודים, הסרת נעילה).
const hebrewToImageMessages: ToImageMessages = {
  lang: 'he',
  dir: 'rtl',
  formatGroupLabel: 'פורמט התמונה',
  formatLabel: 'פורמט',
  qualityGroupLabel: 'איכות התמונה',
  qualityLabel: 'איכות',
  qualityStandard: 'רגילה',
  qualityStandardHint: 'כ-72 DPI - הקובץ הקטן ביותר, מספיק לצפייה במסך.',
  qualityHigh: 'גבוהה',
  qualityHighHint: 'כ-144 DPI - חדה ברוב המסכים, ברירת מחדל טובה להדפסה.',
  qualityMaximum: 'מקסימלית',
  qualityMaximumHint: 'כ-216 DPI - הקובץ הגדול ביותר, הכי טובה להגדלה או להדפסה גדולה.',
  layoutGroupLabel: 'סידור הפלט',
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
  pickAtLeastOne: 'בחרו לפחות עמוד אחד',
  hintAllIn: 'כל העמודים כלולים. בחרו עמוד כדי להשאיר אותו בחוץ.',
  hintSomeOut: 'עמודים עמומים נשארים בחוץ. בחרו עמוד כדי להחזיר אותו.',
  pageRow: 'עמוד {number}',
  tileLeftOut: 'בחוץ',
  tallCaptionOne: 'תמונה אחת, עמוד אחד',
  tallCaptionMany: 'תמונה אחת, {count} עמודים',
  downloadPageAria: 'הורדת עמוד {number}',
  openPreview: 'הגדלת עמוד {number}',
  previewTitle: 'עמוד {number} מתוך {total}',
  previewClose: 'סגירה',
  previewPrev: 'העמוד הקודם',
  previewNext: 'העמוד הבא',
  previewLoading: 'מציירים את העמוד…',
  previewLeftOut: 'לא ייכלל בהורדה',
  previewLeaveOut: 'להשאיר בחוץ',
  previewBringBack: 'להחזיר',
  converting: 'ממירים…',
  convertFailed: 'ייתכן שהקובץ פגום או מוגן בסיסמה. נסו קובץ PDF אחר.',
  buildFailed: 'לא הצלחנו ליצור את התמונות. הקישו כדי לנסות שוב.',
  madeOnTap: 'נוצרות כשמקישים',
  cannotConvert: 'לא הצלחנו להכין את התמונות',
  downloadOne: 'הורדת {format}',
  downloadMany: 'הורדת {count} קובצי {format}',
  downloadDetail: '{label} · {size}',
  shareOne: 'שיתוף {format}',
  shareMany: 'שיתוף {count} תמונות',
  announceReady: 'התמונות מוכנות.',
  announcePreparingTap: 'ממירים. ההורדה תתחיל ברגע שהכול מוכן.',
  announceShared: 'התמונות שותפו.',
  announceShareCanceled: 'השיתוף בוטל. התמונות עדיין מוכנות.',
  announceShareError: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  outOfRange: 'עמוד {number} מחוץ לטווח (1-{max})',
  rangeOutOfRange: 'הטווח {start}-{end} כולל עמודים מחוץ לטווח (1-{max})',
  invalidPart: 'טווח או מספר עמוד לא תקין: "{part}"',
  noValidPages: 'לא נבחרו עמודים תקינים',
};

const toImageMessages: Partial<Record<DocumentationLocaleId, ToImageMessages>> = {
  en: englishToImageMessages,
  he: hebrewToImageMessages,
};

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
}

const englishImageToPdfMessages: ImageToPdfMessages = {
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
};

// An AI draft, not reviewed copy: pairs with he/image-to-pdf.yaml and awaits
// Shlomi's read. Terms follow Merge's and PDF to Image's Hebrew catalogues
// for shared ideas (מיון, הורדה, שיתוף, עמודים, מכינים).
const hebrewImageToPdfMessages: ImageToPdfMessages = {
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
};

const imageToPdfMessages: Partial<Record<DocumentationLocaleId, ImageToPdfMessages>> = {
  en: englishImageToPdfMessages,
  he: hebrewImageToPdfMessages,
};

/**
 * DEBT-04: SignMessages lives in `src/editor/registry/messages.ts` now (the
 * editor's registry and the Sign/Redact chrome import the type from there);
 * this re-export keeps every existing `from '../i18n/toolMessages'` import
 * compiling unchanged. The values below are still authored here.
 */
import type { SignMessages } from '../editor/registry/messages';

export type { SignMessages };

/**
 * UNDO-REDO: undo and redo are two controls on the toolbar, so they are two
 * pairs of strings here - a button label and a title each - and they say only
 * what they do. The change-history dialog that used to sit beside them is
 * gone, and its strings with it. The Cmd/Ctrl+Shift+Z announcement is
 * `redidActionTemplate`, the counterpart to `undidActionTemplate` below. The
 * keys are declared on `SignMessages` in `src/editor/registry/messages.ts`
 * like every other string here.
 */
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
  undoTitle: 'Undo the last change',
  feedbackButton: 'Feedback',
  feedbackTitle: 'Report a bug or share feedback about Sign & Fill PDF (opens GitHub)',
  shareButton: 'Share',
  downloadButton: 'Download',
  textAction: 'Click on a page to place a text box.',
  dateAction: "Click on a page to place today's date.",
  symbolAction: 'Click on a page to place a symbol.',
  signatureAction: 'Click on a page to place your signature.',
  whiteoutAction: "Click and drag on a page to cover an area. What's underneath stays in the file; to hide it for good, use Blur & Redact PDF.",
  ellipseAction: 'Click and drag on a page to draw an ellipse.',
  rectangleAction: 'Click and drag on a page to draw a rectangle.',
  lineAction: 'Click and drag on a page to draw a line.',
  textActionTouch: 'Tap to add text.',
  dateActionTouch: 'Tap to add the date.',
  symbolActionTouch: 'Tap to add a symbol.',
  signatureActionTouch: 'Tap to add your signature.',
  whiteoutActionTouch: 'Tap and drag to white out an area.',
  ellipseActionTouch: 'Tap and drag to draw an ellipse.',
  rectangleActionTouch: 'Tap and drag to draw a rectangle.',
  lineActionTouch: 'Tap and drag to draw a line.',
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
  armHintTouch: 'Double-tap to keep {label} on',
  nextFieldLabel: 'Next field',
  previousFieldLabel: 'Previous field',
  formattingOptionsTitle: 'Formatting options',
  // FORM-11: what the on-open detector found, said out loud. Plain counts, no
  // claim of completeness ("found", not "there are"), and a failure that says
  // the check did not finish rather than blaming the document - the detector
  // reaches ~85% recall on a real form, so "none" and "we could not look" are
  // genuinely different answers and the copy keeps them different.
  // The failure line names the Feedback button on purpose: the report that
  // prompted this came from a device nobody here can reproduce, and that
  // button is where the sanitised error is waiting to be relayed. No alarm,
  // no blame on the file, and nothing a person has to understand to help.
  // The unavailable line is the one a person can act on themselves (a shell
  // cached before a deploy, asking for chunks that deploy replaced), so it
  // spends its second sentence on the fix instead - no cache vocabulary, no
  // instruction to clear anything, just the thing that usually works.
  fieldsCheckFailed: 'Could not check this PDF for form fields. The Feedback button has the details.',
  fieldsCheckUnavailable: 'Could not load the form field check. Reopening this page usually fixes it.',
  fieldsCheckNotStarted: 'The form field check did not start on this file. The Feedback button has the details.',
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
  redoButton: 'Redo',
  redoTitle: 'Bring back the change you just undid',
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
  whiteoutColorGroupLabel: 'Whiteout colour',
  whiteoutAutoLabel: 'Auto',
  whiteoutAutoTitle: 'Match the page around the box',
  whiteoutPipetteLabel: 'Pick a colour from the page',
  whiteoutUseColorTemplate: 'Use {color}',
  whiteoutCustomColorLabel: 'Choose any colour',
  blurStrengthTitle: 'Blur strength',
  blurStrengthLighter: 'Lighter',
  blurStrengthStronger: 'Stronger',
  duplicateElementTitle: 'Duplicate',
  deleteElementTitle: 'Delete',
  repeatOnEveryPageTitle: 'Repeat on all pages, kept in sync',
  repeatOnEveryPageLabel: 'Repeat on all pages',
  repeatGroupTitleTemplate: 'On {n} pages',
  repeatGroupHeadingTemplate: 'Repeated on {n} pages',
  repeatGroupHeadingBoth: 'Repeated on both pages',
  repeatGroupFill: 'Add to the remaining pages',
  repeatGroupKeepOnly: 'Remove from the other pages',
  repeatGroupUnlink: 'Edit this page on its own',
  deleteThisPage: 'This page',
  deleteAllPagesTemplate: 'All {n} pages',
  deleteThisBox: 'This box',
  deleteFindSetTemplate: 'All {n} from this search',
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
  // MOBI-21: the same placeholder on a coarse pointer. "Double-click" is the one
  // gesture a phone cannot make (a double-tap is the browser's zoom), so on touch
  // the empty box has to name the gesture that actually opens it.
  tapToEditPlaceholder: 'Tap to type',
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
  undidActionTemplate: 'Undid: {description}',
  redidActionTemplate: 'Redid: {description}',
  invalidPdfFile: 'Please select a valid PDF file.',
  placedSignatureOnPage: 'Placed signature on page.',
  signaturePlacedNotSaved: 'Signature placed, but the browser could not save it for your next visit.',
  removedElement: 'Removed element.',
  finishedEditingHint: 'Finished editing. Press Backspace to delete this box.',
  copiedElement: 'Copied annotation element.',
  pastedElement: 'Pasted cloned element.',
  writingSignaturesIntoPdf: 'Writing signatures and text layers into PDF...',
  signingStoppedLabel: 'Signing stopped.',
  protectedNeedsPasswordTitle: 'This PDF has a password',
  protectedNeedsPasswordBody: 'Unlock opens it on your device, then you can sign it.',
  protectedOwnerOnlyTitle: 'This PDF is protected',
  protectedOwnerOnlyBody: "It opens without a password, but Sign can't change it as it is. Unlock takes the protection off on your device, then you can sign it.",
  protectedUnlockIt: 'Unlock it',
  protectedHandoffFailed: "Couldn't open Unlock with this file. Open Unlock and choose it there.",
  signedPdfReadyToShare: 'Your signed PDF is ready to share.',
  pdfSignedDownloadStarted: 'PDF signed successfully. Download started.',
  compressItHandoff: 'Compress it',
  redactItHandoff: 'Redact it',
  handoffFailed: 'Could not hand this off. Download it instead and open it there.',
  downloadStarted: 'Download started.',
  pdfSignedSuccessfully: 'PDF signed successfully.',
  sharingCanceledStillReady: 'Sharing canceled. Your signed PDF is still ready to share.',
  shareOpenFailed: 'Could not open the share sheet. Please try again.',
  signatureDeleted: 'Signature deleted.',
  signatureDeletedNotSaved: 'Signature deleted for this session, but the browser could not save that change.',
  addedSignatureDescription: 'Added signature',
  deletedElementDescriptionTemplate: 'Deleted {label}',
  duplicatedElementDescriptionTemplate: 'Duplicated {label}',
  movedElementDescriptionTemplate: 'Moved {label}',
  resizedElementDescriptionTemplate: 'Resized {label}',
  editedTextDescription: 'Edited text',
  styledElementDescriptionTemplate: 'Changed {label} style',
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

// LOC-09 stage 1, drafted by AI; Shlomi read the rendered /he/sign/ editor
// through briefly on 2026-10-22 (LOC-18) and approved it as it stands.
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
  undoTitle: 'ביטול השינוי האחרון',
  feedbackButton: 'משוב',
  feedbackTitle: 'דיווח על באג או שיתוף משוב על כלי החתימה והמילוי של PDF (נפתח ב-GitHub)',
  shareButton: 'שיתוף',
  downloadButton: 'הורדה',
  textAction: 'לחצו על עמוד כדי למקם תיבת טקסט.',
  dateAction: 'לחצו על עמוד כדי למקם את התאריך של היום.',
  symbolAction: 'לחצו על עמוד כדי למקם סימן.',
  signatureAction: 'לחצו על עמוד כדי למקם את החתימה שלכם.',
  whiteoutAction: 'לחצו וגררו על עמוד כדי לכסות אזור. מה שמתחתיו נשאר בקובץ; כדי להסתיר אותו לצמיתות, השתמשו בטשטוש והשחרה.',
  ellipseAction: 'לחצו וגררו על עמוד כדי לצייר אליפסה.',
  rectangleAction: 'לחצו וגררו על עמוד כדי לצייר מלבן.',
  lineAction: 'לחצו וגררו על עמוד כדי לצייר קו.',
  textActionTouch: 'הקישו כדי להוסיף טקסט.',
  dateActionTouch: 'הקישו כדי להוסיף תאריך.',
  symbolActionTouch: 'הקישו כדי להוסיף סימן.',
  signatureActionTouch: 'הקישו כדי להוסיף חתימה.',
  whiteoutActionTouch: 'הקישו וגררו כדי לכסות בטיפקס.',
  ellipseActionTouch: 'הקישו וגררו כדי לצייר אליפסה.',
  rectangleActionTouch: 'הקישו וגררו כדי לצייר מלבן.',
  lineActionTouch: 'הקישו וגררו כדי לצייר קו.',
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
  armHintTouch: 'הקשה כפולה כדי להשאיר את {label} פעיל',
  nextFieldLabel: 'שדה הבא',
  previousFieldLabel: 'שדה קודם',
  formattingOptionsTitle: 'אפשרויות עיצוב',
  fieldsCheckFailed: 'לא ניתן היה לבדוק שדות טופס בקובץ הזה. הפרטים מחכים בכפתור המשוב.',
  fieldsCheckUnavailable: 'בדיקת שדות הטופס לא נטענה. פתיחה מחדש של הדף בדרך כלל פותרת את זה.',
  fieldsCheckNotStarted: 'בדיקת שדות הטופס לא התחילה בקובץ הזה. הפרטים מחכים בכפתור המשוב.',
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
  // LOC-16 stage 2-5 (2026-09-13): popovers, dialogs, element controls and
  // screen-reader announcements across the whole Sign editor; covered by the
  // same 2026-10-22 read-through as the toolbar row above.
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
  redoButton: 'ביצוע מחדש',
  redoTitle: 'החזרת השינוי שביטלתם',
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
  whiteoutColorGroupLabel: 'צבע הטיפקס',
  whiteoutAutoLabel: 'אוטומטי',
  whiteoutAutoTitle: 'התאמה לדף סביב התיבה',
  whiteoutPipetteLabel: 'בחירת צבע מהדף',
  whiteoutUseColorTemplate: 'שימוש ב-{color}',
  whiteoutCustomColorLabel: 'בחירת צבע אחר',
  blurStrengthTitle: 'עוצמת הטשטוש',
  blurStrengthLighter: 'קל יותר',
  blurStrengthStronger: 'חזק יותר',
  duplicateElementTitle: 'שכפול הרכיב',
  deleteElementTitle: 'מחיקת הרכיב',
  repeatOnEveryPageTitle: 'חזרה על כל העמודים, והעותקים נשארים מסונכרנים',
  repeatOnEveryPageLabel: 'חזרה על כל העמודים',
  repeatGroupTitleTemplate: 'ב-{n} עמודים',
  repeatGroupHeadingTemplate: 'חוזרת ב-{n} עמודים',
  repeatGroupHeadingBoth: 'חוזרת בשני העמודים',
  repeatGroupFill: 'הוספה לשאר העמודים',
  repeatGroupKeepOnly: 'הסרה משאר העמודים',
  repeatGroupUnlink: 'עריכת העמוד הזה לבד',
  deleteThisPage: 'העמוד הזה',
  deleteAllPagesTemplate: 'כל {n} העמודים',
  deleteThisBox: 'התיבה הזו',
  deleteFindSetTemplate: 'כל {n} מהחיפוש הזה',
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
  tapToEditPlaceholder: 'הקישו כדי להקליד',
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
  undidActionTemplate: 'בוטל: {description}',
  redidActionTemplate: 'בוצע מחדש: {description}',
  invalidPdfFile: 'בחרו קובץ PDF תקין.',
  placedSignatureOnPage: 'החתימה מוקמה בעמוד.',
  signaturePlacedNotSaved: 'החתימה מוקמה, אבל הדפדפן לא הצליח לשמור אותה לביקור הבא שלכם.',
  removedElement: 'הרכיב הוסר.',
  finishedEditingHint: 'סיימתם לערוך. לחצו Backspace כדי למחוק את התיבה הזו.',
  copiedElement: 'רכיב ההערה הועתק.',
  pastedElement: 'הרכיב המשוכפל הודבק.',
  writingSignaturesIntoPdf: 'כותבים את החתימות ושכבות הטקסט לתוך ה-PDF...',
  signingStoppedLabel: 'החתימה נעצרה.',
  protectedNeedsPasswordTitle: 'לקובץ ה-PDF הזה יש סיסמה',
  protectedNeedsPasswordBody: 'הסרת הנעילה פותחת אותו במכשיר שלכם, ואז אפשר לחתום עליו.',
  protectedOwnerOnlyTitle: 'קובץ ה-PDF הזה מוגן',
  protectedOwnerOnlyBody: 'הוא נפתח בלי סיסמה, אבל אי אפשר לחתום עליו כמו שהוא. הסרת הנעילה מורידה את ההגנה במכשיר שלכם, ואז אפשר לחתום עליו.',
  protectedUnlockIt: 'הסרת נעילה',
  protectedHandoffFailed: 'לא הצלחנו לפתוח את הקובץ בכלי הסרת הנעילה. פתחו את הכלי ובחרו אותו שם.',
  signedPdfReadyToShare: 'ה-PDF החתום שלכם מוכן לשיתוף.',
  pdfSignedDownloadStarted: 'ה-PDF נחתם בהצלחה. ההורדה החלה.',
  compressItHandoff: 'כיווץ',
  redactItHandoff: 'טשטוש',
  handoffFailed: 'לא הצלחנו להעביר את הקובץ. הורידו אותו ופתחו אותו שם.',
  downloadStarted: 'ההורדה החלה.',
  pdfSignedSuccessfully: 'ה-PDF נחתם בהצלחה.',
  sharingCanceledStillReady: 'השיתוף בוטל. ה-PDF החתום שלכם עדיין מוכן לשיתוף.',
  shareOpenFailed: 'לא הצלחנו לפתוח את חלון השיתוף. נסו שוב.',
  signatureDeleted: 'החתימה נמחקה.',
  signatureDeletedNotSaved: 'החתימה נמחקה עבור השימוש הנוכחי, אבל הדפדפן לא הצליח לשמור את השינוי הזה.',
  addedSignatureDescription: 'נוספה חתימה',
  deletedElementDescriptionTemplate: 'נמחק {label}',
  duplicatedElementDescriptionTemplate: 'שוכפל {label}',
  movedElementDescriptionTemplate: 'הוזז {label}',
  resizedElementDescriptionTemplate: 'שונה גודל {label}',
  editedTextDescription: 'נערך טקסט',
  styledElementDescriptionTemplate: 'שונה עיצוב {label}',
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
  split: splitMessages,
  'pdf-to-image': toImageMessages,
  'image-to-pdf': imageToPdfMessages,
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
  /** Replaces the sheet's heading, by CSS alone, while a file is dragged over the page. */
  dragCaptionMany: string;
  dragCaptionOne: string;
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
  /** Persistence follow-up (SIGN-06): shown instead of draftSaved once a save
   * has succeeded but this browser has not guaranteed it will keep the
   * result (see draftStore.js's requestStoragePersistence/isStoragePersisted
   * and useDraftPersistence.js's anti-noise gate - scoped to an installed
   * home-screen app, not every ordinary tab). Never shown before a save has
   * succeeded, and never in place of draftNotSaved/draftConflict, which stay
   * the more urgent states. */
  draftUnpersisted: string;
  draftRetentionInfo: string;
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
  /** Lets describeFile isolate the file size in an RTL page. */
  dir: 'ltr' | 'rtl';
  /** MOBI-09: iOS has no Web Share Target, so the Android share-sheet path
   * this suite is built around doesn't exist there. Shown only on the Sign
   * tool's empty state (BasePdfTool's `showIosFilesHint`), only once
   * `src/lib/platform.ts`'s mount-effect check confirms iOS - never on the
   * server render or the first client render, to keep the hydration match
   * FileDropzone.tsx's `recents` comment already documents. Describes the
   * Files-app route, never Web Share Target by name, and never implies iOS
   * gets the Android path. */
  iosFilesHint: string;
  /** MERGE-18 (Route A): the OS picker already lists Google Drive, Dropbox
   * and iCloud. Shown on phones only, after the same mount-effect check as
   * iosFilesHint, on tools that opt in with `showCloudDriveHint`. */
  cloudDriveHint: string;
  /** Shown only once a file is added, and only when `src/lib/browserSupport.ts`
   * places the browser below what pdf.js needs. Never blocks the page. */
  oldBrowserNotice: string;
  /** SEO-46: the quiet rating ask after a download (src/shell/RatingPrompt.tsx). */
  ratingQuestion: string;
  /** After 4 or 5 stars: thanks plus a nudge to share. */
  ratingThanksHigh: string;
  ratingShare: string;
  ratingShareCopied: string;
  ratingStarGithub: string;
  /** After 1 to 3 stars: an invitation to report what went wrong. */
  ratingThanksLow: string;
  ratingTellMe: string;
  /** Aria label of one star button, e.g. "3 stars". */
  ratingStarOne: string;
  ratingStarOther: string;
}

const englishShellMessages: ShellMessages = {
  dropHereMany: 'Drop PDFs here',
  dropHereOne: 'Drop PDF here',
  dragCaptionMany: 'Let go to add your files',
  dragCaptionOne: 'Let go to add your file',
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
  draftUnpersisted: 'Draft saved, but this browser might not keep it - download to be safe',
  draftRetentionInfo: 'Saved on this device for up to 28 days, and only for your 6 most recent files.',
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
  dir: 'ltr',
  iosFilesHint: 'On iPhone or iPad, share the PDF to Files from Mail, WhatsApp, or any other app, then tap Choose file. It opens on Recents, with the file you just saved at the top.',
  cloudDriveHint: 'On a phone, Choose files can open Google Drive, Dropbox or iCloud too.',
  oldBrowserNotice: 'This tool needs {browser} {version} or newer to open PDFs. A quick update, or another browser, will do it.',
  ratingQuestion: 'PDkef is free and open source. If it helped, a rating helps other people find it.',
  ratingThanksHigh: "Thank you, that really helps. Know someone who'd use it?",
  ratingShare: 'Share',
  ratingShareCopied: 'Link copied',
  ratingStarGithub: 'Star it on GitHub',
  ratingThanksLow: "Thank you. If something went wrong, I'd love to hear about it.",
  ratingTellMe: 'Tell me on GitHub',
  ratingStarOne: '1 star',
  ratingStarOther: '{count} stars',
};

const hebrewShellMessages: ShellMessages = {
  dropHereMany: 'גררו לכאן קבצי PDF',
  dropHereOne: 'גררו לכאן קובץ PDF',
  dragCaptionMany: 'גררו לכאן כדי להוסיף קבצים',
  dragCaptionOne: 'גררו לכאן כדי להוסיף קובץ',
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
  draftUnpersisted: 'הטיוטה נשמרה, אבל הדפדפן עלול לא לשמור אותה - כדאי להוריד ליתר ביטחון',
  // TODO(MEM-11): AI draft, not reviewed copy - see hebrewRecentFilesMessages' LOC-09 comment for the convention.
  draftRetentionInfo: 'נשמר רק במכשיר הזה, למשך עד 28 יום, ועבור 6 הקבצים האחרונים שלך.',
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
  dir: 'rtl',
  iosFilesHint: 'באייפון או אייפד, שתפו את קובץ ה-PDF ל-Files מתוך Mail, WhatsApp או כל אפליקציה אחרת, ואז לחצו על בחירת קובץ. הוא ייפתח בכרטיסיית "אחרונים" ב-Files, עם הקובץ ששמרתם הרגע למעלה.',
  cloudDriveHint: 'בטלפון, בחירת קבצים יכולה לפתוח גם את Google Drive, Dropbox או iCloud.',
  oldBrowserNotice: 'כדי לפתוח קבצי PDF בכלי הזה צריך {browser} {version} ומעלה. עדכון קצר, או דפדפן אחר, יסדרו את זה.',
  // TODO(SEO-46): AI draft, not reviewed copy - pending Shlomi's read-through.
  ratingQuestion: 'PDkef חינמי ובקוד פתוח. אם זה עזר לכם, דירוג יעזור גם לאחרים למצוא אותו.',
  ratingThanksHigh: 'תודה רבה, זה עוזר מאוד. מכירים מישהו שיוכל להשתמש בזה?',
  ratingShare: 'שתפו',
  ratingShareCopied: 'הקישור הועתק',
  ratingStarGithub: 'כוכב ב-GitHub',
  ratingThanksLow: 'תודה. אם משהו השתבש, אשמח לשמוע על זה.',
  ratingTellMe: 'ספרו לי ב-GitHub',
  ratingStarOne: 'כוכב אחד',
  ratingStarOther: '{count} כוכבים',
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

const englishFileDropzoneMessages: FileDropzoneMessages = {
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
const hebrewFileDropzoneMessages: FileDropzoneMessages = {
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
  /** MEM-11 Part B: replaces the relative "saved N ago" line when this
   * entry is within EXPIRY_WARNING_DAYS of the 28-day age limit. */
  expiresInDaysOne: string;
  expiresInDaysOther: string; // '{count}' placeholder
  oldestKeptFile: string; // '{count}' placeholder
}

const englishRecentFilesMessages: RecentFilesMessages = {
  heading: 'Recent files',
  openSampleAriaLabel: 'Open bundled sample PDF, {name}',
  openRecentAriaLabel: 'Open recent PDF, {name}',
  justNow: 'just now',
  pageCountOne: '1 page',
  pageCountOther: '{count} pages',
  expiresInDaysOne: 'Expires in 1 day',
  expiresInDaysOther: 'Expires in {count} days',
  oldestKeptFile: 'Oldest of {count} files',
};

// LOC-09: reviewed with hebrewFileDropzoneMessages above (LOC-18, 2026-10-22).
const hebrewRecentFilesMessages: RecentFilesMessages = {
  heading: 'קבצים אחרונים',
  openSampleAriaLabel: 'פתיחת קובץ הדוגמה, {name}',
  openRecentAriaLabel: 'פתיחת קובץ אחרון, {name}',
  justNow: 'הרגע',
  pageCountOne: 'עמוד אחד',
  pageCountOther: '{count} עמודים',
  expiresInDaysOne: 'פג תוקף מחר',
  expiresInDaysOther: 'פג תוקף בעוד {count} ימים',
  oldestKeptFile: 'הישן מבין {count} קבצים',
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
  englishSplitMessages,
  hebrewSplitMessages,
  englishToImageMessages,
  hebrewToImageMessages,
  englishImageToPdfMessages,
  hebrewImageToPdfMessages,
  englishSignMessages,
  hebrewSignMessages,
  englishShellMessages,
  hebrewShellMessages,
  englishFileDropzoneMessages,
  hebrewFileDropzoneMessages,
  englishRecentFilesMessages,
  hebrewRecentFilesMessages,
};
