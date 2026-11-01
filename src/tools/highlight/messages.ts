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
};
