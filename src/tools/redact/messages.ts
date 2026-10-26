import type { DocumentationLocaleId } from '../../i18n/documentationLocales';

/**
 * Redact's strings. English only for now. Components read the English table directly (there is no
 * localized edition to thread); `getRedactMessages` is the entry a Hebrew edition would extend.
 * `{name}`-style tokens are filled with formatMessage; a sentence that holds a link is split
 * around it and the component supplies the link.
 */
export interface RedactToolCopy {
  /** The status line while the tool is armed. */
  action: string;
  /** The same, on a touch screen. */
  actionTouch: string;
  /** The toolbar button. */
  button: string;
}

export interface RedactMessages {
  /* Toolbar. */
  toolCopy: Record<'delete' | 'blackout' | 'whiteout' | 'blur', RedactToolCopy>;
  brushCopy: Record<'blur' | 'whiteout', RedactToolCopy>;
  toolActive: string;
  toolStaysOn: string;
  toolBackToOne: string;
  undo: string;
  toolbarLabel: string;
  find: string;
  findTitle: string;
  peek: string;
  peekTitle: string;
  /* Delete tool's hover titles. */
  deleteImage: string;
  deleteText: string;
  deleteMark: string;
  deleteTextFallback: string;
  /* Brush controls. */
  shapeBlur: string;
  shapeWhiteout: string;
  shapeGroup: string;
  modeBox: string;
  modeBrush: string;
  size: string;
  brushSize: string;
  whiteoutColour: string;
  colourWhite: string;
  colourPaperGrey: string;
  colourLightBlue: string;
  currentColour: string;
  moreColours: string;
  pickColour: string;
  /* Find bar. */
  findAndCover: string;
  clear: string;
  kindsOfDetail: string;
  kinds: string;
  previousMatch: string;
  nextMatch: string;
  coverWith: string;
  coverThis: string;
  coverAll: string;
  coverAllCount: string;
  closeFind: string;
  /* Island: commands, announcements, errors. */
  addedBox: string;
  addedBoxAnnounce: string;
  strokeBlur: string;
  strokeWhiteout: string;
  paintedStroke: string;
  paintedStrokeAnnounce: string;
  removedBox: string;
  removedFromOnePage: string;
  removedFromPages: string;
  removedFromSearch: string;
  keepRepeated: string;
  clearEverything: string;
  undone: string;
  redone: string;
  drawFirst: string;
  downloadStarted: string;
  shared: string;
  shareCanceled: string;
  shareError: string;
  exportSuperseded: string;
  readyHandoff: string;
  readyShare: string;
  savedStarted: string;
  pdfProtected: string;
  downloadStopped: string;
  downloadStoppedDetail: string;
  exportUpdated: string;
  exportFailed: string;
  didntOpen: string;
  loadErrorLead: string;
  loadErrorUnlock: string;
  loadErrorTail: string;
  /* Done and finish rows, saved-file check. */
  handoffFailed: string;
  compressIt: string;
  signIt: string;
  emptyFinish: string;
  downloadTitle: string;
  shareTitleReady: string;
  shareTitlePrepare: string;
  checkLabel: string;
  /* The file session's announcements. */
  invalidPdf: string;
  needsPassword: string;
  ownerRestricted: string;
}

export const englishRedactMessages: RedactMessages = {
  toolCopy: {
    delete: { action: 'Click text or an image to delete it, or drag across several.', actionTouch: 'Tap outlined text or an image to delete it.', button: 'Delete' },
    blackout: { action: 'Click and drag to draw a blackout box.', actionTouch: 'Drag to draw a blackout box.', button: 'Blackout' },
    whiteout: { action: 'Click and drag to draw a whiteout box.', actionTouch: 'Drag to draw a whiteout box.', button: 'Whiteout' },
    blur: { action: 'Click and drag to draw a blur box.', actionTouch: 'Drag to draw a blur box.', button: 'Blur' },
  },
  brushCopy: {
    blur: { action: 'Click and drag to paint a blur.', actionTouch: 'Drag to paint a blur.', button: 'Blur' },
    whiteout: { action: 'Click and drag to paint whiteout.', actionTouch: 'Drag to paint whiteout.', button: 'Whiteout' },
  },
  toolActive: '{tool} tool active. {action}',
  toolStaysOn: '{tool} stays on after each one. Switch it off, or press Escape, when you are done.',
  toolBackToOne: '{tool} is back to one at a time.',
  undo: 'Undo',
  toolbarLabel: 'PDF redaction',
  find: 'Find',
  findTitle: 'Find text to redact',
  peek: 'Peek',
  peekTitle: 'Hold to see what is under the boxes',
  deleteImage: 'Click to delete this image',
  deleteText: 'Click to delete: "{preview}"',
  deleteMark: 'Click to delete this mark',
  deleteTextFallback: 'Click to delete this text',
  shapeBlur: 'Blur shape',
  shapeWhiteout: 'Whiteout shape',
  shapeGroup: 'Shape',
  modeBox: 'Box',
  modeBrush: 'Brush',
  size: 'Size',
  brushSize: 'Brush size',
  whiteoutColour: 'Whiteout colour',
  colourWhite: 'White',
  colourPaperGrey: 'Paper grey',
  colourLightBlue: 'Light blue',
  currentColour: 'Current colour',
  moreColours: 'More colours',
  pickColour: 'Pick a colour from the page',
  findAndCover: 'Find and cover',
  clear: 'Clear',
  kindsOfDetail: 'Kinds of detail',
  kinds: 'Kinds',
  previousMatch: 'Previous match',
  nextMatch: 'Next match',
  coverWith: 'Cover with',
  coverThis: 'Cover this',
  coverAll: 'Cover all',
  coverAllCount: 'Cover all {count}',
  closeFind: 'Close find',
  addedBox: 'Added {type} box',
  addedBoxAnnounce: 'Added {type} box.',
  strokeBlur: 'blur',
  strokeWhiteout: 'whiteout',
  paintedStroke: 'Painted a {kind} stroke',
  paintedStrokeAnnounce: 'Painted a {kind} stroke.',
  removedBox: 'Removed the {type} box',
  removedFromOnePage: 'Removed the box from 1 page',
  removedFromPages: 'Removed the box from {count} pages',
  removedFromSearch: 'Removed {count} boxes from this search',
  keepRepeated: 'Keep the repeated boxes',
  clearEverything: 'Clear everything on this page',
  undone: 'Undid: {description}',
  redone: 'Redid: {description}',
  drawFirst: 'Draw a box or delete something first.',
  downloadStarted: 'Download started.',
  shared: 'Shared.',
  shareCanceled: 'Sharing canceled. Your redacted PDF is still ready to share.',
  shareError: 'Could not open the share sheet. Try again.',
  exportSuperseded: 'You changed something, so that download stopped. Download again when ready.',
  readyHandoff: 'Ready to hand off.',
  readyShare: 'Your redacted PDF is ready to share.',
  savedStarted: 'Saved. Download started.',
  pdfProtected: 'This PDF is protected.',
  downloadStopped: 'The download stopped.',
  downloadStoppedDetail: 'The download stopped. {detail}',
  exportUpdated: 'PDkef was updated while this page was open. Reload the page to continue. Your edits are kept.',
  exportFailed: 'Could not export the PDF. Your edits are still here. Try again.',
  didntOpen: "This PDF didn't open.",
  loadErrorLead: 'It may be damaged, or locked with a password. A locked PDF opens in',
  loadErrorUnlock: 'Unlock',
  loadErrorTail: 'first.',
  handoffFailed: 'Could not hand this off. Download it instead and open it there.',
  compressIt: 'Compress it',
  signIt: 'Sign it',
  emptyFinish: 'Draw a box or delete something, then download it here.',
  downloadTitle: 'Download the redacted PDF',
  shareTitleReady: 'Share the redacted PDF',
  shareTitlePrepare: 'Prepare the redacted PDF for sharing',
  checkLabel: 'Check of the saved file',
  invalidPdf: 'Choose a PDF file.',
  needsPassword: 'This PDF has a password. Unlock opens it.',
  ownerRestricted: 'This PDF is protected. Unlock takes the protection off.',
};

export function getRedactMessages(_locale: DocumentationLocaleId): RedactMessages {
  return englishRedactMessages;
}
