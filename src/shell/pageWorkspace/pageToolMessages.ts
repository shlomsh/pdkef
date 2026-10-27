/**
 * The strings Split, Edit Pages and PDF to Image all declare under the same name and type
 * (ARCH-58): the bulk row, the open and Undo/Redo announcements, the Download element's
 * share outcomes and the shared headings. Each tool's catalogue interface extends this and
 * adds only what is its own. (src/shell/shellMessages.ts's `PageGridMessages` is the
 * narrower slice the grid component itself reads.)
 */
export interface PageToolMessages {
  skippedOne: string;
  skippedMany: string;
  includeAll: string;
  skipAll: string;
  allIncluded: string;
  inverted: string;
  undoneAnnouncement: string;
  redoneAnnouncement: string;
  loaded: string;
  loadFailed: string;
  announceNeedsPassword: string;
  documentHeading: string;
  downloadShort: string;
  closeStrip: string;
  shareLabel: string;
  sharedSuccessfully: string;
  sharingCanceled: string;
  shareError: string;
}
