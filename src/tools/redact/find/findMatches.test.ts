import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import { findMatches, isCovered } from './findMatches.ts';
import { termFinder } from './finders.ts';
import { buildPageText } from './pageText.ts';
import type { FindMatch } from './types.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 }, rotation: 0, userUnit: 1 });
const item = (str: string, x: number, y: number) => ({ str, transform: [12, 0, 0, 12, x, y], width: str.length * 6, height: 12 });

const pages = [
  { text: buildPageText(0, [item('Jane Doe', 100, 700), item('Jane Doe again', 100, 600)]), geometry },
  { text: buildPageText(1, [item('Nobody here', 100, 700)]), geometry },
  { text: buildPageText(2, [item('JANE DOE', 100, 700)]), geometry },
];

describe('findMatches', () => {
  it('finds every match in page then reading order, with an id, the text and a box', () => {
    const matches = findMatches(pages, termFinder('jane doe'));
    expect(matches.map((match) => [match.id, match.text])).toEqual([
      ['0:0', 'Jane Doe'],
      ['0:9', 'Jane Doe'],
      ['2:0', 'JANE DOE'],
    ]);
    expect(matches.every((match) => match.boxes.length === 1)).toBe(true);
  });

  it('finds nothing for an empty term', () => {
    expect(findMatches(pages, termFinder('  '))).toEqual([]);
  });
});

describe('isCovered', () => {
  const match: FindMatch = { id: '0:0', pageIndex: 0, start: 0, end: 4, text: 'Jane', boxes: [{ left: 10, top: 10, width: 5, height: 2 }] };

  it('is true when a box on the same page contains every match box', () => {
    expect(isCovered(match, [{ pageIndex: 0, left: 9, top: 9, width: 8, height: 4 }])).toBe(true);
  });

  it('is false for a box on another page, or one that only overlaps', () => {
    expect(isCovered(match, [{ pageIndex: 1, left: 9, top: 9, width: 8, height: 4 }])).toBe(false);
    expect(isCovered(match, [{ pageIndex: 0, left: 12, top: 9, width: 8, height: 4 }])).toBe(false);
  });
});
