/** What the reading order needs of a mark: its page and its box in percent of that page. */
interface OrderedMark { id: string; pageIndex: number; left: number; top: number; width: number; height: number }

/**
 * R39: the marks of a whole document in the order a person reads them. Page first, then line (tops within
 * half a band height of the line's first mark are one line), then across the line: left edge ascending on a
 * left-to-right page, right edge descending on a right-to-left one.
 */
export function marksInReadingOrder<T extends OrderedMark>(marks: readonly T[], directionOf: (pageIndex: number) => 'ltr' | 'rtl'): T[] {
  const pages = new Map<number, T[]>();
  for (const mark of marks) pages.set(mark.pageIndex, [...(pages.get(mark.pageIndex) ?? []), mark]);
  const out: T[] = [];
  for (const pageIndex of [...pages.keys()].sort((a, b) => a - b)) {
    const rtl = directionOf(pageIndex) === 'rtl';
    const byTop = [...pages.get(pageIndex)!].sort((a, b) => a.top - b.top);
    let line: T[] = [];
    const flush = () => {
      line.sort((a, b) => (rtl ? b.left + b.width - (a.left + a.width) : a.left - b.left));
      out.push(...line);
      line = [];
    };
    for (const mark of byTop) {
      if (line.length > 0 && mark.top - line[0].top > line[0].height / 2) flush();
      line.push(mark);
    }
    flush();
  }
  return out;
}
