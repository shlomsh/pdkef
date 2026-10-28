/**
 * Unlock / Protect's strings. English only for now; the island takes a Partial of this over the
 * English table the way Split does. `{name}`-style tokens are filled with formatMessage.
 */
export interface SecurityMessages {
  /* The preview tag (previewPlan.js). */
  tagChecking: string;
  tagNotReadable: string;
  tagProtected: string;
  tagNotProtected: string;
  tagUnlocked: string;
  tagRestricted: string;
  tagLocked: string;
  firstPageLabel: string;
  /* Errors. */
  wrongPassword: string;
  damaged: string;
  unlockFailed: string;
  protectFailed: string;
  errorFallback: string;
  readErrorTitle: string;
  openFailed: string;
  unreadable: string;
  /* Announcements. */
  readyUnlocked: string;
  readyProtected: string;
  sharedUnlocked: string;
  sharedProtected: string;
  canceled: string;
  shareError: string;
  unlockingAnnounce: string;
  protectingAnnounce: string;
  incorrectPassword: string;
  checkingFile: string;
  couldNotRead: string;
  loadedUnlock: string;
  loadedProtect: string;
  /* The form and the done state. */
  emptyUnlock: string;
  emptyProtect: string;
  noPasswordFailed: string;
  noPasswordDone: string;
  noPasswordTakesOff: string;
  noPasswordProcessing: string;
  passwordLabelUnlock: string;
  passwordLabelProtect: string;
  passwordPlaceholderUnlock: string;
  passwordPlaceholderProtect: string;
  unlocking: string;
  protecting: string;
  unlockPdf: string;
  protectPdf: string;
  downloadUnlockedPdf: string;
  downloadLabel: string;
  downloadShort: string;
  buildFailed: string;
  allSkipped: string;
  downloadAgain: string;
  savedLabel: string;
  preparingPages: string;
  renderProgress: string;
  closeStrip: string;
  share: string;
  handoffRedact: string;
  handoffSign: string;
  handoffFailed: string;
  continueIn: string;
  /* The tools a protected file can come back to. */
  returnRedact: string;
  returnSign: string;
  returnCompress: string;
  returnEditPdf: string;
  returnMerge: string;
}

export const englishSecurityMessages: SecurityMessages = {
  tagChecking: 'Checking',
  tagNotReadable: 'Not readable',
  tagProtected: 'Protected',
  tagNotProtected: 'Not protected',
  tagUnlocked: 'Unlocked',
  tagRestricted: 'Restricted',
  tagLocked: 'Locked',
  firstPageLabel: 'First page',
  wrongPassword: 'The password may be incorrect.',
  damaged: 'This file could not be unlocked. It may be damaged.',
  unlockFailed: 'Something went wrong while unlocking this file. Please try again.',
  protectFailed: 'The file might already be encrypted or corrupted.',
  errorFallback: 'An error occurred.',
  readErrorTitle: 'This file could not be read.',
  openFailed: 'Something went wrong while opening it. Please try again.',
  unreadable: 'Make sure it is a PDF and is not damaged.',
  readyUnlocked: 'Your unlocked PDF is ready.',
  readyProtected: 'Your protected PDF is ready.',
  sharedUnlocked: 'Unlocked PDF shared successfully.',
  sharedProtected: 'Protected PDF shared successfully.',
  canceled: 'Sharing canceled. Your PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  unlockingAnnounce: 'Unlocking PDF…',
  protectingAnnounce: 'Protecting PDF…',
  incorrectPassword: 'Incorrect password.',
  checkingFile: 'Checking file "{name}"...',
  couldNotRead: 'This file could not be read. {message}',
  loadedUnlock: 'File "{name}" loaded. Enter its password to unlock.',
  loadedProtect: 'File "{name}" loaded. Enter a password to protect it.',
  emptyUnlock: 'Drop PDF here to unlock',
  emptyProtect: 'Drop PDF here to protect',
  noPasswordFailed: 'Choose another file with Replace.',
  noPasswordDone: 'No password needed. The protection is off.',
  noPasswordTakesOff: 'No password needed. This takes the protection off.',
  noPasswordProcessing: 'No password needed. This takes the protection off. Unlocking…',
  passwordLabelUnlock: 'PDF password',
  passwordLabelProtect: 'Set Password',
  passwordPlaceholderUnlock: "Enter the PDF's password",
  passwordPlaceholderProtect: 'Enter a new password',
  unlocking: 'Unlocking…',
  protecting: 'Protecting…',
  unlockPdf: 'Unlock PDF',
  protectPdf: 'Protect PDF',
  downloadUnlockedPdf: 'Download unlocked PDF',
  downloadLabel: 'Download',
  downloadShort: 'Download',
  buildFailed: 'Could not prepare this PDF',
  allSkipped: 'Nothing to download',
  downloadAgain: 'download again',
  savedLabel: 'Saved',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} rendered',
  closeStrip: 'Close',
  share: 'Share',
  handoffRedact: 'Redact',
  handoffSign: 'Sign',
  handoffFailed: 'Could not hand this off. Download it instead and open it there.',
  continueIn: 'Continue in {name}',
  returnRedact: 'Redact',
  returnSign: 'Sign',
  returnCompress: 'Compress',
  returnEditPdf: 'Organize PDF',
  returnMerge: 'Merge',
};
