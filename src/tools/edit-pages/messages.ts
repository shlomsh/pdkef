import type { DownloadMessages, PageGridMessages } from '../../shell/shellMessages';
import type { PageToolMessages } from '../../shell/pageWorkspace/pageToolMessages.ts';
import type { HistoryButtonsMessages } from '../../shell/HistoryButtons.tsx';

/* Edit Pages' one English catalogue: the slices the shared page grid, the
   Download element and the Undo/Redo pair read, plus the few strings that are
   this tool's own. Values start from Merge's English set (src/tools/merge/messages.ts)
   and say "skip" / "edited" where Merge says "merged"; the grid's sentence
   shapes are unchanged. English only until a Hebrew edition exists. */

export interface EditPagesMessages extends PageGridMessages, PageToolMessages, DownloadMessages, HistoryButtonsMessages {
  invertPages: string;
  addPageNumbers: string;
  touchDragHint: string;
  fileNameEditableLabel: string;
  readyAnnouncement: string;
  allSkipped: string;
  loadingStructure: string;
  announceRestricted: string;
  handoffCompress: string;
  handoffSign: string;
  handoffFailed: string;
  /* The load-failure line: a protected PDF opens in Unlock first. */
  failureLead: string;
  failureUnlock: string;
  failureTail: string;
}

export const englishEditPagesMessages: EditPagesMessages = {
  // The shared grid.
  captionPages: 'pages {from} to {to}',
  includePage: 'Include page {number}',
  openPreview: 'Open page {number} larger',
  pageIncluded: 'Page {number} included again.',
  pageItemLabel: 'Page {number} of {total}{state}',
  pageMoved: 'Page moved to position {position} of {total}.',
  pageRotated: 'Page {number} rotated to {degrees} degrees.',
  pageSkipped: 'Page {number} skipped. It stays here and is left out of the download.',
  previewClose: 'Close',
  previewIncludeAgain: 'Include it again',
  previewLoading: 'Rendering the page…',
  previewNext: 'Next page',
  previewPrev: 'Previous page',
  previewSkippedBanner: 'Left out of the edited file',
  previewSkippedNote: 'Left out of the download.',
  previewTitle: 'Page {number} of {total}',
  rotatePage: 'Rotate page {number}',
  skipPage: 'Skip page {number}',
  skippedBadge: 'Skipped',
  skippedCountOne: '1 page skipped',
  skippedCountOther: '{count} pages skipped',
  skippedState: ', skipped',
  stripHint: 'Drag a page to reorder, or focus a page and press the left or right arrow keys to move it, R to rotate it, Delete to skip it.',
  tipBringBack: 'Show',
  tipOpen: 'Open',
  tipRotate: 'Rotate',
  tipSkip: 'Skip',
  // The Download element. It is never in its one-file state here, so no addOneMore.
  downloadAgain: 'download again',
  downloadLabel: 'Download edited PDF',
  buildFailed: 'Could not edit this PDF',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} rendered',
  savedLabel: 'Saved',
  // Undo and Redo.
  undo: 'Undo',
  redo: 'Redo',
  undoLabel: 'Undo last change',
  redoLabel: 'Redo last undone change',
  // This tool's own.
  includeAll: 'Include all',
  skipAll: 'Skip all',
  invertPages: 'Invert',
  skippedOne: 'Skipped “{name}” - not a PDF.',
  skippedMany: 'Skipped {count} files - not PDFs.',
  addPageNumbers: 'Add page numbers',
  touchDragHint: 'Touch and hold a page, then drag to reorder.',
  documentHeading: 'Your edited PDF',
  fileNameEditableLabel: 'File name, editable',
  downloadShort: 'Download',
  readyAnnouncement: 'Your edited PDF is ready.',
  sharedSuccessfully: 'Edited PDF shared successfully.',
  sharingCanceled: 'Sharing canceled. Your edited PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  undoneAnnouncement: 'Undid last change.',
  redoneAnnouncement: 'Redid last change.',
  allIncluded: 'All pages included.',
  allSkipped: 'Every page is skipped',
  inverted: 'Included and skipped pages swapped.',
  loadingStructure: 'Loading PDF file structure…',
  loaded: 'Loaded PDF file "{name}" with {count} pages.',
  loadFailed: 'Failed to load PDF file.',
  announceNeedsPassword: 'This PDF has a password',
  announceRestricted: 'This PDF is protected',
  closeStrip: 'Close',
  handoffCompress: 'Compress',
  handoffSign: 'Sign',
  handoffFailed: 'Could not hand the file over. Download it instead.',
  shareLabel: 'Share',
  failureLead: 'A protected PDF opens in',
  failureUnlock: 'Unlock',
  failureTail: 'first. Otherwise the file may be damaged - try another PDF.',
};
