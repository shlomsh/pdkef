// A long output name is cut in the middle at rest so its end stays visible
// (the "(final) (3)" that tells two merges apart); see OutputName.tsx. The
// head takes the ellipsis, the tail is kept whole. Editing shows the full name.
const CUT_ABOVE = 28;
const TAIL_LENGTH = 20;

export function splitOutputName(name: string): { head: string; tail: string } {
  if (name.length <= CUT_ABOVE) return { head: name, tail: '' };
  return { head: name.slice(0, -TAIL_LENGTH), tail: name.slice(-TAIL_LENGTH) };
}

/** An offset inside one cut part, as an offset in the full name. */
export function fullNameOffset(head: string, part: 'head' | 'tail', offset: number): number {
  return part === 'tail' ? head.length + offset : offset;
}
