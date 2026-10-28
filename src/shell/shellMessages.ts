import type { DocumentationLocaleId } from '../i18n/documentationLocales';

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
  /** The heading's whole phrase, so a language with number agreement can inflect it. */
  skippedCountOne: string;
  skippedCountOther: string;
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
  /** describeFile (src/lib/text/format.js) page-count clause of the file-info bar,
   * e.g. "3 pages · 1.4 MB" or "Page 2 of 3". */
  pageCountOne: string;
  pageCountOther: string;
  pageOf: string;
  /** Lets describeFile isolate the file size in an RTL page. */
  dir: 'ltr' | 'rtl';
  /** MOBI-09: iOS has no Web Share Target, so the Android share-sheet path
   * this suite is built around doesn't exist there. Shown only on the Sign
   * tool's empty state (BasePdfTool's `showIosFilesHint`), only once
   * `src/lib/app/platform.ts`'s mount-effect check confirms iOS - never on the
   * server render or the first client render, to keep the hydration match
   * FileDropzone.tsx's `recents` comment already documents. Describes the
   * Files-app route, never Web Share Target by name, and never implies iOS
   * gets the Android path. */
  iosFilesHint: string;
  /** MERGE-18 (Route A): the OS picker already lists Google Drive, Dropbox
   * and iCloud. Shown on phones only, after the same mount-effect check as
   * iosFilesHint, on tools that opt in with `showCloudDriveHint`. */
  cloudDriveHint: string;
  /** Shown only once a file is added, and only when `src/lib/app/browserSupport.ts`
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
  /** SEO-48: the optional comment after the stars. */
  ratingCommentLabel: string;
  ratingCommentSend: string;
  ratingCommentThanks: string;
  /** Aria label of one star button, e.g. "3 stars". */
  ratingStarOne: string;
  ratingStarOther: string;
}

export const englishShellMessages: ShellMessages = {
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
  clearLabel: 'Clear all files',
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
  ratingQuestion: "You're one of PDkef's early users. It's new, free and open source, and a rating helps more people find it.",
  ratingThanksHigh: "Thank you, that really helps. Know someone who'd use it?",
  ratingShare: 'Share',
  ratingShareCopied: 'Link copied',
  ratingStarGithub: 'Star it on GitHub',
  ratingThanksLow: "Thank you. If something went wrong, I'd love to hear about it.",
  ratingTellMe: 'Tell me on GitHub',
  ratingCommentLabel: 'Want to add a few words?',
  ratingCommentSend: 'Send',
  ratingCommentThanks: 'Got it, thank you.',
  ratingStarOne: '1 star',
  ratingStarOther: '{count} stars',
};

export const hebrewShellMessages: ShellMessages = {
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
  clearLabel: 'ניקוי כל הקבצים',
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
  ratingQuestion: 'אתם מהמשתמשים הראשונים של PDkef. הוא חדש, חינמי ובקוד פתוח, ודירוג עוזר לאנשים נוספים למצוא אותו.',
  ratingThanksHigh: 'תודה רבה, זה עוזר מאוד. מכירים מישהו שיוכל להשתמש בזה?',
  ratingShare: 'שתפו',
  ratingShareCopied: 'הקישור הועתק',
  ratingStarGithub: 'כוכב ב-GitHub',
  ratingThanksLow: 'תודה. אם משהו השתבש, אשמח לשמוע על זה.',
  ratingTellMe: 'ספרו לי ב-GitHub',
  ratingCommentLabel: 'רוצים להוסיף כמה מילים?',
  ratingCommentSend: 'שליחה',
  ratingCommentThanks: 'קיבלתי, תודה.',
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
