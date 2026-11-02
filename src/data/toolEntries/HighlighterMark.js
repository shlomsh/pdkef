import { createLucideIcon } from 'lucide-preact';

// lucide's Highlighter with the stroke the hero draws behind "on your device":
// a citron band, slightly tilted and uneven-cornered, under the pen's base.
// The band is the first node so the pen's lines sit on top of it.
export const HighlighterMark = createLucideIcon({
  name: 'highlighter-mark',
  size: 24,
  node: [
    ['path', { d: 'M1.2 18.6 Q12 17.6 22.8 18.4 L22.4 23 Q12 23.6 1.6 23.2 Z', fill: 'var(--color-citron)', stroke: 'none', key: 'mark' }],
    ['path', { d: 'm9 11-6 6v3h9l3-3', key: 'tip' }],
    ['path', { d: 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4', key: 'body' }],
  ],
});
