// SIGN-46: the highlighter's classic six. Document content colors, so they live
// next to the other model colors rather than in global.css.
export const HIGHLIGHT_COLORS = [
  { id: 'yellow', hex: '#FFF34D' }, { id: 'orange', hex: '#FFB15C' }, { id: 'pink', hex: '#FF8FCF' },
  { id: 'red', hex: '#FF8080' }, { id: 'green', hex: '#9CF27A' }, { id: 'blue', hex: '#7FDBFF' },
] as const;
/** READ-04: six more tints for the color menu, same shape as the classic six. */
export const EXTRA_HIGHLIGHT_COLORS = [
  { id: 'purple', hex: '#C59BFF' }, { id: 'teal', hex: '#6FE3CC' }, { id: 'lime', hex: '#D8F55C' },
  { id: 'peach', hex: '#FFC79A' }, { id: 'rose', hex: '#FFA8B8' }, { id: 'grey', hex: '#C9CED6' },
] as const;
export const DEFAULT_HIGHLIGHT_COLOR = '#FFF34D';
