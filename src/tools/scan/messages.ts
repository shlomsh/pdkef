import type { DocumentationLocaleId } from '../../i18n/documentationLocales';
import type { DownloadMessages } from '../../shell/shellMessages';

/** Scan's strings. English only at launch; a localized edition follows the languages page. */
export interface ScanMessages extends DownloadMessages {
  dir: 'ltr' | 'rtl';
  dropHere: string;
  takePhoto: string;
  addPhotos: string;
  skippedOne: string;
  skippedMany: string;
  documentHeading: string;
  fileNameLabel: string;
  defaultName: string;
  pageOf: string;
  findingEdges: string;
  cornersGroup: string;
  corners: [string, string, string, string];
  cornersHint: string;
  wholePhoto: string;
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
  savedLabel: string;
  buildFailed: string;
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
  handoffMerge: string;
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
  addPhotos: 'Add photos',
  skippedOne: '{name} was skipped: only JPG and PNG photos can be scanned.',
  skippedMany: '{count} files were skipped: only JPG and PNG photos can be scanned.',
  documentHeading: 'Your scan',
  fileNameLabel: 'File name, select to rename',
  defaultName: 'scan',
  pageOf: 'Page {position} of {total}',
  findingEdges: 'Finding the page edges…',
  cornersGroup: 'Page corners',
  corners: ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner'],
  cornersHint: 'Drag each corner onto a corner of the page.',
  wholePhoto: 'Use the whole photo',
  removePhoto: 'Remove this photo',
  adjustCorners: 'Adjust corners',
  findPage: 'Find the page',
  findMissed: 'No page edges were found here either. Drag the corners onto the corners of the page.',
  pageFoundAnnounce: 'Page edges found.',
  announceResult: 'Your page, as it will download.',
  announceCornersOf: 'Corners of page {position}.',
  notFoundCorners: 'No page edges were found in this photo. Drag the corners onto the corners of the page, or try Find the page.',
  notFound: 'No page edges were found in this photo, so the whole photo is used.',
  cornersDone: 'Done',
  useCorners: 'Use these corners',
  resultExact: 'Exactly as it will download',
  resultDetail: '{size} for {pages}',
  resultUpdating: 'Updating…',
  pagesLabel: 'Pages',
  reorderHint: 'Drag a page to move it, or use the arrow keys on a selected page.',
  tileLabel: 'Page {position} of {total}, select to adjust its corners',
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
  limitNone: 'None',
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
  savedLabel: 'Saved',
  buildFailed: 'Could not make this PDF',
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
  handoffMerge: 'Merge',
  handoffCompress: 'Compress',
  handoffFailed: 'Could not hand the file over. Download it instead.',
  announceAddedOne: 'Added 1 page.',
  announceAddedMany: 'Added {count} pages.',
  announceRemoved: 'Removed page {position}.',
  announceMoved: 'Page moved to position {position} of {total}.',
  announceCleared: 'All pages cleared.',
};

export function getScanMessages(_locale: DocumentationLocaleId): ScanMessages {
  return englishScanMessages;
}
