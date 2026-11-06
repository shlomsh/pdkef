import type { CapsuleLabels } from './components/capsule/capsuleItems.ts';

/** Highlight's strings. English only at launch; a localized edition follows the languages page. */
export interface HighlightMessages {
  emptyMessage: string;
  invalidPdf: string;
  needsPassword: string;
  ownerRestricted: string;
  didntOpen: string;
  loadErrorLead: string;
  loadErrorUnlock: string;
  loadErrorTail: string;
  zoom: string;
  fitWidth: string;
  scanOffer: Record<'sideways' | 'spread' | 'lean' | 'bent', { title: string; detail: string }> & { straighten: string; keepAsIs: string; failed: string };
  fitText: string;
  fitPage: string;
  actualSize: string;
  zoomIn: string;
  zoomOut: string;
  /** "{mode} · {percent}%" */
  /** The toolbar that opens on a highlight at rest (R2 to R4). */
  /** The tile row's label outside the Reading lamp. */
  toolbarLabel: string;
  markToolbar: string;
  /** The mark panel's color choice, as a radio group. */
  markColor: string;
  markHighlight: string;
  markUnderline: string;
  markPencil: string;
  markDelete: string;
  /** R27: opens the highlight's comment. */
  markComment: string;
  markColorInput: string;
  /** The button that opens the colors beyond the top three. */
  moreColors: string;
  markThickness: string;
  /** "{n} pt" */
  thicknessItem: string;
  markOpacity: string;
  /** READ-11: the Clean | Sketch choice and its two words. */
  markStroke: string;
  /** The one button that holds a mark's kind, stroke and strength. */
  markLook: string;
  /** The kind inside Look: Highlight | Underline, as a radio group. */
  markKind: string;
  /** The chip after Delete, with its Undo (guidelines §6). */
  markRemoved: string;
  strokeClean: string;
  strokeSketch: string;
  /** R8: shown once, after the first mark. */
  restHint: string;
  tapHint: string;
  /** R19: the marker button, which shows the armed marker and opens its colors. */
  marker: string;
  /** The hint beside the file name while the marker is armed on touch. */
  armedAction: string;
  /** READ-06: the ways Print offers. */
  printPlain: string;
  printWithNotes: string;
  printNotesAtEnd: string;
  /** The heading on the first sheet of notes at the end of a print. */
  printNotesHeading: string;
  /** The Feedback tile: opens a prefilled GitHub issue. `body` is the issue template, English like the repository's issues. */
  /** The phone's bottom note pane. `count` is "{index} of {count}", `page` is "Page {number}". */
  notes: { region: string; previous: string; next: string; close: string; count: string; page: string; deleted: string; undo: string; writerTitle: string };
  feedback: { label: string; title: string; name: string; body: string };
  downloadDone: string;
  downloadDoneLabel: string;
  downloadDoneClose: string;
  /** Share's announcements (read aloud, not shown). */
  shared: string;
  shareCanceled: string;
  shareError: string;
  shareReady: string;
  capsule: CapsuleLabels;
  /** The pull cord that opens the Reading lamp: the button's name, and the hint beside its label on a desktop. */
  cord: { label: string; hint: string };
}

export const englishHighlightMessages: HighlightMessages = {
  emptyMessage: 'Select or drop a PDF to highlight',
  invalidPdf: 'Choose a PDF file.',
  needsPassword: 'This PDF has a password. Unlock opens it.',
  ownerRestricted: 'This PDF is protected. Unlock takes the protection off.',
  didntOpen: "This PDF didn't open.",
  loadErrorLead: 'It may be damaged, or locked with a password. A locked PDF opens in',
  loadErrorUnlock: 'Unlock',
  loadErrorTail: 'first.',
  zoom: 'Zoom',
  fitWidth: 'Fit width',
  fitText: 'Fit text',
  fitPage: 'Fit page',
  actualSize: 'Actual size',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  toolbarLabel: 'Highlight tools',
  markToolbar: 'Change this highlight',
  markColor: 'Color',
  markHighlight: 'Highlight',
  markUnderline: 'Underline',
  markPencil: 'Pencil',
  markDelete: 'Delete',
  markComment: 'Comment',
  markColorInput: 'Custom color',
  moreColors: 'More colors',
  markThickness: 'Underline thickness',
  thicknessItem: '{n} pt',
  markOpacity: 'Opacity',
  markStroke: 'Stroke',
  markLook: 'Look',
  markKind: 'Kind',
  markRemoved: 'Highlight removed',
  strokeClean: 'Clean',
  strokeSketch: 'Sketch',
  restHint: 'Click a highlight to change it',
  tapHint: 'Tap a highlight to change it',
  marker: 'Marker',
  armedAction: 'Swipe to highlight',
  printPlain: 'Print',
  printWithNotes: 'Print with my notes',
  printNotesAtEnd: 'Print with notes at the end',
  printNotesHeading: 'Notes',
  notes: { region: 'Notes', previous: 'Previous note', next: 'Next note', close: 'Close notes', count: '{index} of {count}', page: 'Page {number}', deleted: 'Note deleted', undo: 'Undo', writerTitle: 'Note' },
  feedback: {
    label: 'Feedback',
    title: 'Report a bug or suggest a feature for Highlight PDF (opens GitHub)',
    name: 'Highlight PDF',
    body: `## What would you like to report or suggest?

Tell us about a bug, an idea, or anything about Highlight PDF you would like to share.

## What happened (optional)

- What were you trying to do?
- What happened, and what did you expect?
- How can we reproduce it?

## Helpful details (optional)

Browser and device, the feature involved (highlights, underlines, sketch strokes, comments, full screen, print, download), and the language of the document.

Please leave out private documents and personal information. GitHub issues are public.
`,
  },
  downloadDone: 'Saved as {name}.',
  downloadDoneLabel: 'Your download',
  downloadDoneClose: 'Close',
  shared: 'Shared.',
  shareCanceled: 'Sharing canceled. Your highlighted PDF is still ready to share.',
  shareError: 'Could not open the share sheet. Try again.',
  shareReady: 'Your highlighted PDF is ready. Tap Share to send it.',
  capsule: {
    toolbar: 'Reading lamp',
    exit: 'Exit full screen',
    undo: 'Undo',
    redo: 'Redo',
    print: 'Print',
    download: 'Download',
    share: 'Share',
    more: 'More',
    page: 'Page {n} of {count}',
    jump: 'Go to page',
    go: 'Go',
  },
  cord: { label: 'Full screen', hint: 'pull or click' },
  scanOffer: {
    sideways: { title: 'This scan is lying on its side.', detail: 'Scan can turn it upright before you start.' },
    spread: { title: 'Two pages on each sheet.', detail: 'Scan can split them into single pages before you start.' },
    lean: { title: 'This scan leans a little.', detail: 'Scan can square it up before you start.' },
    bent: { title: 'These pages curve toward the spine.', detail: 'Scan can flatten them before you start.' },
    straighten: 'Straighten',
    keepAsIs: 'Keep as is',
    failed: 'That did not open. Please try again.',
  },
};
