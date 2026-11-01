// SIGN-46: the highlighter's classic six. Document content colors, so they live
// next to the other model colors rather than in global.css.
export const HIGHLIGHT_COLORS = [
  { id: 'yellow', hex: '#FFF34D' }, { id: 'orange', hex: '#FFB15C' }, { id: 'pink', hex: '#FF8FCF' },
  { id: 'red', hex: '#FF8080' }, { id: 'green', hex: '#9CF27A' }, { id: 'blue', hex: '#7FDBFF' },
] as const;
export const DEFAULT_HIGHLIGHT_COLOR = '#FFF34D';
