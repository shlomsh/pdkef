/**
 * Redact's strings. English only for now. Components read the English table directly (there is no
 * localized edition to thread).
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
  movedBox: string;
  resizedBox: string;
  changedBoxColor: string;
  coveredOne: string;
  coveredMany: string;
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
  /** Announced as an export starts: boxes to burn in, or only deletions. */
  exportSaving: string;
  exportDeleting: string;
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
  /* The saved-file check (check/checkCopy.ts). */
  check: CheckMessages;
  /* The file's details: rows, summaries, survivors (details/describeDetails.ts, checkCopy.ts). */
  details: DetailsMessages;
  /* The finish area's status lines (finishState.ts). */
  finish: FinishMessages;
  /* Deleted-object summaries and chips (deleteMarquee.ts, sameImage.ts, useDeleteTool.ts). */
  deleted: DeletedMessages;
  /* Box aria labels (boxKeys.ts). */
  boxLabels: Record<'blur' | 'blackout' | 'whiteout' | 'blurStroke' | 'whiteoutStroke' | 'fallback', string>;
  /* History descriptions for linked boxes (useLinkedBoxes.ts). */
  linked: LinkedMessages;
}

export interface CheckMessages {
  lead: string;
  checking: string;
  failed: string;
  updated: string;
  noMatch: string;
  allClear: string;
  nothingCoveredShort: string;
  searchSummary: string;
  searchLabel: string;
  searchButton: string;
  coverIt: string;
  removeIt: string;
  removing: string;
  coverItNote: string;
  /** "3 and 7": {head} is the comma-joined rest. */
  listAnd: string;
  place: Record<'field' | 'comment' | 'link' | 'bookmark' | 'title' | 'author' | 'subject' | 'keywords' | 'metadata' | 'attachment' | 'unused', string>;
  placeOnPage: Record<'field' | 'comment' | 'link', string>;
  fieldName: string;
  fieldNameOnPage: string;
  visibleInPicture: string;
  inText: string;
  removedDone: string;
  removedBookmark: string;
  removedAttachment: string;
  removedField: string;
  removedComment: string;
  removedLink: string;
  removedTitle: string;
  removedAuthor: string;
  removedSubject: string;
  removedKeywords: string;
  removedMetadata: string;
  removedUnused: string;
  picturePageOne: string;
  picturePagesMany: string;
  attachmentOne: string;
  attachmentMany: string;
  unsolidOne: string;
  unsolidMany: string;
}

export interface DetailsMessages {
  title: string;
  review: string;
  edit: string;
  delete: string;
  undo: string;
  done: string;
  close: string;
  implied: string;
  thumbs: string;
  changed: string;
  survived: string;
  changedAnnouncement: string;
  survivedAnnouncement: string;
  /** Row labels; `madeWith` is the row, `app` the plain survivor label. */
  labels: Record<'title' | 'author' | 'subject' | 'keywords' | 'madeWith' | 'created' | 'changed' | 'attached' | 'scripts' | 'hidden' | 'app', string>;
  attachedOnPage: string;
  scriptsText: string;
  hiddenXmpHistory: string;
  hiddenXmp: string;
  hiddenNotes: string;
  attachedFileOne: string;
  attachedFileMany: string;
  summaryScripts: string;
  summaryHidden: string;
  /** The word for an app in the changes line, and the verb for each kind of change. */
  appName: string;
  verbs: Record<'deleted' | 'altered', string>;
  pagePictures: string;
  appData: string;
}

export interface FinishMessages {
  saving: string;
  saved: string;
  cancelled: string;
  pageOne: string;
  pageMany: string;
  boxOne: string;
  boxMany: string;
  deletionOne: string;
  deletionMany: string;
  savesWith: string;
  and: string;
  everyPageText: string;
  everyPagePicture: string;
  somePicturesOne: string;
  somePicturesMany: string;
}

export interface DeletedMessages {
  summary: string;
  and: string;
  textAlone: string;
  textOne: string;
  textMany: string;
  imageAlone: string;
  imageOne: string;
  imageMany: string;
  markAlone: string;
  markOne: string;
  markMany: string;
  sharedImageOne: string;
  sharedImageMany: string;
  everyPageMessage: string;
  everyPageLabel: string;
}

export interface LinkedMessages {
  duplicated: string;
  duplicatedRepeat: string;
  unlinked: string;
  removedOtherOne: string;
  removedOtherMany: string;
  clearedOne: string;
  clearedMany: string;
  addedMoreOne: string;
  addedMoreMany: string;
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
  movedBox: 'Moved {type} box',
  resizedBox: 'Resized {type} box',
  changedBoxColor: 'Changed {type} box color',
  coveredOne: 'Covered 1 match',
  coveredMany: 'Covered {count} matches',
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
  exportSaving: 'Saving the redacted PDF…',
  exportDeleting: 'Deleting what you chose…',
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
  check: {
    lead: "I searched the saved file's text, form fields, comments, bookmarks and document details. Text inside pictures can't be searched, so you're the one who decides it's safe to share.",
    checking: 'Checking the saved file...',
    failed: "I couldn't read the saved file to check it. Your download is fine; look it over yourself before you share it.",
    updated: 'PDkef was updated while this page was open. Reload the page to check the saved file. Your edits are kept.',
    noMatch: 'No match in the text I could read.',
    allClear: 'I searched the saved file for what you covered and deleted. No match in the text I could read.',
    nothingCoveredShort: 'Nothing you covered or deleted had text I could read.',
    searchSummary: 'Search the saved file',
    searchLabel: 'Look for something else in the saved file',
    searchButton: 'Search',
    coverIt: 'Add a box over it',
    removeIt: 'Remove it',
    removing: 'Removing…',
    coverItNote: 'Adding a box covers it in your next download. Download again to get the new copy.',
    listAnd: '{head} and {last}',
    place: {
      field: 'In a form field.',
      comment: 'In a comment.',
      link: 'In a link.',
      bookmark: 'In a bookmark.',
      title: "In the document's title.",
      author: 'In the author field.',
      subject: "In the document's subject.",
      keywords: "In the document's keywords.",
      metadata: "In the document's details.",
      attachment: "In an attached file's name.",
      unused: 'In a part of the file no page shows.',
    },
    placeOnPage: {
      field: 'In a form field on page {page}.',
      comment: 'In a comment on page {page}.',
      link: 'In a link on page {page}.',
    },
    fieldName: "In a form field's name.",
    fieldNameOnPage: "In a form field's name on page {page}.",
    visibleInPicture: 'Page {page}: still visible in the picture.',
    inText: "Page {page}: in the page's text.",
    removedDone: 'Saved again and downloaded.',
    removedBookmark: 'Removed the bookmark "{text}".',
    removedAttachment: 'Removed the attachment "{text}".',
    removedField: 'Cleared the field.',
    removedComment: 'Removed the comment.',
    removedLink: 'Removed the link.',
    removedTitle: 'Removed the title.',
    removedAuthor: 'Removed the author.',
    removedSubject: 'Removed the subject.',
    removedKeywords: 'Removed the keywords.',
    removedMetadata: 'Removed the document details.',
    removedUnused: 'Removed the parts of the file no page shows.',
    picturePageOne: 'Page {pages} is a picture. Have a look at it before you share.',
    picturePagesMany: 'Pages {pages} are pictures. Have a look at them before you share.',
    attachmentOne: "This file has an attached file. I didn't look inside it.",
    attachmentMany: "This file has {count} attached files. I didn't look inside them.",
    unsolidOne: "A box on page {pages} didn't come out solid in the saved file. Don't share this copy.",
    unsolidMany: "Boxes on pages {pages} didn't come out solid in the saved file. Don't share this copy.",
  },
  details: {
    title: 'Details',
    review: 'Review',
    edit: 'Edit',
    delete: 'Delete',
    undo: 'Undo',
    done: 'Done',
    close: 'Done',
    implied: 'Goes with the changes above',
    thumbs: "Page pictures from before your marks go on their own, so a mark can't be seen through them.",
    changed: 'Details: {summary}.',
    survived: "Still in your download: {labels}. Don't share this copy yet.",
    changedAnnouncement: 'Checked your download. Details: {summary}.',
    survivedAnnouncement: 'Still in your download: {labels}.',
    labels: {
      title: 'Title',
      author: 'Author',
      subject: 'Subject',
      keywords: 'Keywords',
      madeWith: 'Made with',
      created: 'Created',
      changed: 'Changed',
      attached: 'Attached',
      scripts: 'Scripts',
      hidden: 'Hidden',
      app: 'App',
    },
    attachedOnPage: 'Attached on page {page}',
    scriptsText: 'Run when the file opens',
    hiddenXmpHistory: 'a second copy of these details with its save history',
    hiddenXmp: 'a second copy of these details',
    hiddenNotes: "the app's own notes",
    attachedFileOne: '1 attached file',
    attachedFileMany: '{count} attached files',
    summaryScripts: 'scripts',
    summaryHidden: 'hidden details',
    appName: 'app',
    verbs: { deleted: 'deleted', altered: 'altered' },
    pagePictures: 'Page pictures',
    appData: 'App data',
  },
  finish: {
    saving: 'Saving {name}… {pct}%',
    saved: 'Saved {name} · {pages}',
    cancelled: 'You changed something, so that download stopped. Download again when ready.',
    pageOne: '1 page',
    pageMany: '{count} pages',
    boxOne: '1 box',
    boxMany: '{count} boxes',
    deletionOne: '1 deletion',
    deletionMany: '{count} deletions',
    savesWith: 'Saves with {parts}',
    and: '{head} and {last}',
    everyPageText: 'Every page keeps its text.',
    everyPagePicture: 'Every page is saved as a picture, so nothing hides under a box.',
    somePicturesOne: '{count} of {total} pages is saved as a picture, so nothing hides under a box. The rest keep their text.',
    somePicturesMany: '{count} of {total} pages are saved as pictures, so nothing hides under a box. The rest keep their text.',
  },
  deleted: {
    summary: 'Deleted {what}',
    and: '{head} and {last}',
    textAlone: 'text',
    textOne: '1 piece of text',
    textMany: '{count} pieces of text',
    imageAlone: 'an image',
    imageOne: '1 image',
    imageMany: '{count} images',
    markAlone: 'a mark',
    markOne: '1 mark',
    markMany: '{count} marks',
    sharedImageOne: 'Deleted an image, also on 1 other page',
    sharedImageMany: 'Deleted an image, also on {count} other pages',
    everyPageMessage: 'Deleted the image on every page',
    everyPageLabel: 'Every page',
  },
  boxLabels: {
    blur: 'Blur box',
    blackout: 'Blackout box',
    whiteout: 'Whiteout box',
    blurStroke: 'Blur stroke',
    whiteoutStroke: 'Whiteout stroke',
    fallback: 'Box',
  },
  linked: {
    duplicated: 'Duplicated {type} box',
    duplicatedRepeat: 'Duplicated the box on {count} pages',
    unlinked: 'Unlinked the box on this page',
    removedOtherOne: 'Removed the box from 1 other page',
    removedOtherMany: 'Removed the box from {count} other pages',
    clearedOne: 'Cleared 1 box on page {page}',
    clearedMany: 'Cleared {count} boxes on page {page}',
    addedMoreOne: 'Added the box to 1 more page',
    addedMoreMany: 'Added the box to {count} more pages',
  },
};
