import { englishCapsuleLabels, type CapsuleLabels } from '#editor-ui/capsule/capsuleItems.ts';

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
  markHighlight: string;
  markUnderline: string;
  markDelete: string;
  /** R27: opens the highlight's comment. */
  markComment: string;
  markColors: string;
  markCustom: string;
  markColorInput: string;
  markThickness: string;
  /** "{n} pt" */
  thicknessItem: string;
  markOpacity: string;
  /** R8: shown once, after the first mark. */
  restHint: string;
  tapHint: string;
  /** R19: the marker button, which shows the armed marker and opens its colors. */
  marker: string;
  /** READ-03 on touch: the marker is armed by a tap and the Stop chip puts it down. */
  armedAction: string;
  armedStop: string;
  /** READ-06: the two things Print offers. */
  printPlain: string;
  printWithNotes: string;
  capsule: CapsuleLabels;
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
  markHighlight: 'Highlight',
  markUnderline: 'Underline',
  markDelete: 'Delete',
  markComment: 'Comment',
  markColors: 'Color',
  markCustom: 'Custom color and opacity',
  markColorInput: 'Custom color',
  markThickness: 'Underline thickness',
  thicknessItem: '{n} pt',
  markOpacity: 'Opacity',
  restHint: 'Rest on a highlight to change it',
  tapHint: 'Tap a highlight to change it',
  marker: 'Marker',
  armedAction: 'Swipe along a line to highlight',
  armedStop: 'Stop',
  printPlain: 'Print',
  printWithNotes: 'Print with my notes',
  capsule: englishCapsuleLabels,
};
