import type { DownloadMessages } from '#shell/shellMessages.ts';

/** Scan's strings. English only at launch; a localized edition follows the languages page. */
export interface ScanMessages extends DownloadMessages {
  dir: 'ltr' | 'rtl';
  dropHere: string;
  takePhoto: string;
  /** SCAN-08, the camera in the page. */
  startScanning: string;
  choosePhotos: string;
  cameraStarting: string;
  cameraOff: string;
  cameraSlow: string;
  hintPoint: string;
  hintHold: string;
  hintTurn: string;
  /** SCAN-24, the one thing that would make the shot better; each fits a phone's one line. */
  hintDuplicate: string;
  hintFit: string;
  hintCloser: string;
  hintContrast: string;
  hintFlatter: string;
  /** Under a page that was strongly bent or creased when it was taken. */
  bentNote: string;
  shutter: string;
  autoLabel: string;
  cameraDone: string;
  closeCamera: string;
  stackLabel: string;
  addPhotos: string;
  skippedOne: string;
  skippedMany: string;
  documentHeading: string;
  fileNameLabel: string;
  pageOf: string;
  findingEdges: string;
  cornersGroup: string;
  corners: [string, string, string, string];
  cornersHint: string;
  wholePhoto: string;
  rotate: string;
  fullScreen: string;
  exitFullScreen: string;
  announceRotated: string;
  removePhoto: string;
  adjustCorners: string;
  findPage: string;
  findMissed: string;
  pageFoundAnnounce: string;
  announceResult: string;
  announceCornersOf: string;
  notFoundCorners: string;
  notFound: string;
  cornersDone: string;
  useCorners: string;
  resultExact: string;
  resultDetail: string;
  resultUpdating: string;
  pagesLabel: string;
  reorderHint: string;
  tileLabel: string;
  tableHint: string;
  sizeLabel: string;
  addPages: string;
  retake: string;
  pageDone: string;
  backToPages: string;
  cornersAction: string;
  lookAction: string;
  removeShort: string;
  pageSizeQuiet: string;
  removeLabel: string;
  processing: string;
  pageFailed: string;
  pagesFailed: string;
  lookLabel: string;
  lookOriginal: string;
  lookGrayscale: string;
  lookDocument: string;
  lookOriginalHint: string;
  lookGrayscaleHint: string;
  lookDocumentHint: string;
  pageSizeLabel: string;
  pageSizeFit: string;
  pageSizeA4: string;
  pageSizeLetter: string;
  pageSizeFitHint: string;
  pageSizePaperHint: string;
  limitLabel: string;
  limitNone: string;
  limit2mb: string;
  limit1mb: string;
  limit500kb: string;
  limitNoneHint: string;
  limitHint: string;
  limitMissed: string;
  downloadLabel: string;
  downloadShort: string;
  downloadAgain: string;
  clearAll: string;
  savedLabel: string;
  buildFailed: string;
  removeToMake: string;
  preparingPages: string;
  renderProgress: string;
  allSkipped: string;
  readyAnnouncement: string;
  closeStrip: string;
  shareLabel: string;
  sharedSuccessfully: string;
  sharingCanceled: string;
  shareError: string;
  handoffSign: string;
  handoffRedact: string;
  handoffCompress: string;
  handoffFailed: string;
  announceAddedOne: string;
  announceAddedMany: string;
  announceRemoved: string;
  announceMoved: string;
  announceCleared: string;
}

export const englishScanMessages: ScanMessages = {
  dir: 'ltr',
  dropHere: 'Drop photos of your pages here',
  takePhoto: 'Take a photo',
  startScanning: 'Start scanning',
  choosePhotos: 'Choose photos',
  cameraStarting: 'Opening the camera…',
  cameraOff: "The camera didn't open here, so each page goes in as a photo instead.",
  cameraSlow: 'Each page goes in as a photo on this phone, which keeps it sharp.',
  hintPoint: 'Point at a page',
  hintHold: 'Hold still',
  hintTurn: 'Page {count}. Turn the page.',
  hintDuplicate: 'Already taken. Turn the page.',
  hintFit: 'Fit the whole page in',
  hintCloser: 'Move a little closer',
  hintContrast: 'A darker surface helps',
  hintFlatter: 'Hold the phone flatter',
  bentNote: 'Laying the page flat gives a cleaner scan.',
  shutter: 'Take this page',
  autoLabel: 'Auto',
  cameraDone: 'Done',
  closeCamera: 'Close the camera',
  stackLabel: 'The last page taken, {count} so far',
  addPhotos: 'Add photos',
  skippedOne: '{name} was skipped: only JPG and PNG photos can be scanned.',
  skippedMany: '{count} files were skipped: only JPG and PNG photos can be scanned.',
  documentHeading: 'Your scan',
  fileNameLabel: 'File name, select to rename',
  pageOf: 'Page {position} of {total}',
  findingEdges: 'Finding the page edges…',
  cornersGroup: 'Page corners',
  corners: ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'],
  cornersHint: 'Drag each corner onto a corner of the page.',
  wholePhoto: 'Whole photo',
  removePhoto: 'Remove this photo',
  adjustCorners: 'Adjust corners',
  rotate: 'Rotate',
  fullScreen: 'Full screen',
  exitFullScreen: 'Exit full screen',
  announceRotated: 'Page {position} turned a quarter to the right.',
  findPage: 'Auto-detect',
  findMissed: 'No page edges were found here either. Drag the corners onto the corners of the page.',
  pageFoundAnnounce: 'Page edges found.',
  announceResult: 'Your page, as it will download.',
  announceCornersOf: 'Corners of page {position}.',
  notFoundCorners: 'No page edges were found in this photo. Drag the corners onto the corners of the page, or try Auto-detect.',
  notFound: 'No page edges were found in this photo, so the whole photo is used.',
  cornersDone: 'Done',
  useCorners: 'Use these corners',
  resultExact: 'Exactly as it will download',
  resultDetail: '{size} for {pages}',
  resultUpdating: 'Updating…',
  pagesLabel: 'Pages',
  reorderHint: 'Drag a page to move it, or use the arrow keys on a selected page.',
  tileLabel: 'Page {position} of {total}, open it to fix its corners, turn it or retake it',
  tableHint: 'Tap a page to fix its corners, turn it or retake it.',
  sizeLabel: 'Size',
  addPages: 'Add pages',
  retake: 'Retake',
  pageDone: 'Done',
  backToPages: 'Back to all pages',
  cornersAction: 'Corners',
  lookAction: 'Look',
  removeShort: 'Remove',
  pageSizeQuiet: 'Page size: {size}',
  removeLabel: 'Remove page {position}',
  processing: 'Straightening…',
  pageFailed: 'Could not read this photo',
  pagesFailed: 'Page {pages} could not be read. Remove it, or add the photo again, to make the PDF.',
  lookLabel: 'Look',
  lookOriginal: 'Original',
  lookGrayscale: 'Grayscale',
  lookDocument: 'Document',
  lookOriginalHint: 'The colours as photographed.',
  lookGrayscaleHint: 'Shades of gray, no colour.',
  lookDocumentHint: 'Even light, dark text on clean white.',
  pageSizeLabel: 'Page size',
  pageSizeFit: 'Fit',
  pageSizeA4: 'A4',
  pageSizeLetter: 'Letter',
  pageSizeFitHint: 'Each page is the size of its scan.',
  pageSizePaperHint: 'Every page on {size} paper, turned to match the scan.',
  limitLabel: 'Size limit',
  limitNone: 'Full',
  limit2mb: '2 MB',
  limit1mb: '1 MB',
  limit500kb: '500 KB',
  limitNoneHint: 'Full quality.',
  limitHint: 'Quality steps down until the PDF is under {size}.',
  limitMissed: 'This is as small as these pages go. Remove a page, or try a lower limit.',
  // The Download element and the finish row.
  downloadLabel: 'Download PDF',
  downloadShort: 'Download',
  downloadAgain: 'download again',
  clearAll: 'Clear all',
  savedLabel: 'Saved',
  buildFailed: 'Could not make this PDF',
  removeToMake: 'Remove page {pages} to make the PDF',
  preparingPages: 'Preparing {count} pages…',
  renderProgress: '{done} of {total} ready',
  allSkipped: 'No pages yet',
  readyAnnouncement: 'Your PDF is ready.',
  closeStrip: 'Close',
  shareLabel: 'Share',
  sharedSuccessfully: 'Scan shared.',
  sharingCanceled: 'Sharing canceled. Your PDF is still ready.',
  shareError: 'Could not open the share sheet. Please try again.',
  handoffSign: 'Sign',
  handoffRedact: 'Redact',
  handoffCompress: 'Compress',
  handoffFailed: 'Could not hand the file over. Download it instead.',
  announceAddedOne: 'Added 1 page.',
  announceAddedMany: 'Added {count} pages.',
  announceRemoved: 'Removed page {position}.',
  announceMoved: 'Page moved to position {position} of {total}.',
  announceCleared: 'All pages cleared.',
};
