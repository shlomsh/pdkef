// A long output name is cut in the middle at rest so its end stays visible
// (the "(final) (3)" that tells two merges apart); see OutputName.tsx. The
// head takes the ellipsis, the tail is kept whole. Editing shows the full name.
const CUT_ABOVE = 28;
const TAIL_LENGTH = 20;

const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
const startsWithMark = (name: string, at: number) => /^\p{M}/u.test(name.slice(at, at + 2));

export function splitOutputName(name: string): { head: string; tail: string } {
  if (name.length <= CUT_ABOVE) return { head: name, tail: '' };
  // Move the cut earlier until the tail starts on a whole grapheme: not on a
  // low surrogate, not on a combining mark.
  let cut = name.length - TAIL_LENGTH;
  while (cut > 0 && (isLowSurrogate(name.charCodeAt(cut)) || startsWithMark(name, cut))) cut--;
  // Then past whitespace, so the tail starts on a word; the space ends the
  // head, where the ellipsis hides it.
  while (cut < name.length - 1 && /\s/.test(name[cut])) cut++;
  return { head: name.slice(0, cut), tail: name.slice(cut) };
}

/** An offset inside one cut part, as an offset in the full name. */
export function fullNameOffset(head: string, part: 'head' | 'tail', offset: number): number {
  return part === 'tail' ? head.length + offset : offset;
}
