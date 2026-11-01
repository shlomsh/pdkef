/**
 * What the layout reader must get right around one element, one row at a time, in the style of
 * `../corpus.js`: each row pins a zero, a thing that must NOT happen (a merged column, a band that starts
 * in the margin). `expect` is always 'ok'; a row with `knownGap: true` is expected to fail today, and the
 * ratchet fails the day it passes without being re-recorded (a fix flips the row, the way corpus.js says).
 *
 * `target` names the truth row the press lands on, by the start of its text; `edits` adds dirt to the clean
 * master before it is degraded (`edits.js`), positioned from the truth so a page rebuild moves it with it.
 */
import { aimY } from './sampleSwipes.mjs';

const FEATURES = 'composed-features';
const lineOf = (truth, start, column) => {
  const row = truth.rows.find((r) => !r.ignore && r.text.startsWith(start) && (column === undefined || r.column === column));
  if (!row) throw new Error(`pinned rows: no row starting "${start}" on ${truth.id}`);
  return row;
};

/** @type {Array<{id: string, group: string, name: string, why: string, page: string, level: string, view: string, target: Function, edits?: Function, knownGap?: boolean}>} */
export const PINNED_ROWS = [
  {
    id: 'gutter-dust',
    group: 'R33 known gap',
    name: 'one dust pixel in the gutter, level with the pressed line',
    why: 'columnSpanAt allows zero ink pixels in a gutter column on a short window, so one speck of dust '
      + 'breaks the gutter: the row no longer ends where its text ends, and on a tighter gutter the swipe '
      + 'crosses into the other column (READ-01 R33, first failure). Its control, the same press without the '
      + 'dust, passes.',
    page: FEATURES, level: 'scan', view: 'native', knownGap: true,
    // Mid-column: more than the reader's three-line window from the title and from the heading.
    target: (truth) => lineOf(truth, 'set on paper that was never', 'c0'),
    edits: (truth, row) => [{ kind: 'speck', x: (truth.columns[0].x1 + truth.columns[1].x0) / 2, y: aimY(row), sizePts: 1.2 }],
  },
  {
    id: 'spanning-heading',
    group: 'R33 known gap',
    name: 'a heading spanning both columns, two lines below the pressed line',
    why: 'the gutter is looked for in the whole three-line-each-way window, so a heading that crosses both '
      + 'columns hides it and the row merges with the other column (READ-01 R33, second failure).',
    page: FEATURES, level: 'scan', view: 'native', knownGap: true,
    target: (truth) => lineOf(truth, 'Headings that cross both columns break the pattern', 'c0'),
  },
  {
    id: 'margin-speck',
    group: 'R33 known gap',
    name: 'a speck in the margin, a row height and a bit left of the line',
    why: 'a row starts at its first inked pixel, so a speck out in the margin becomes the row start and a '
      + 'band begins at the page edge (READ-01 R33, third failure).',
    page: FEATURES, level: 'scan', view: 'native', knownGap: true,
    // Far from the heading and the pull quote, so the speck is the only thing that can move this row.
    target: (truth) => lineOf(truth, 'together. The gap between them', 'c0'),
    edits: (truth, row) => [{ kind: 'speck', x: row.x0 - 1.4 * truth.letterHeightPts, y: aimY(row), sizePts: 1.2 }],
  },
  {
    id: 'drop-cap',
    group: 'found by this corpus',
    name: 'the line beside a three-line drop cap',
    why: 'a 33 pt capital makes the first three lines of the column start later and tall ink stand beside them; '
      + 'the row must still be the line, not the capital, and must not merge with the other column. Today '
      + 'the row grows leftwards over the capital: a fourth failure no sketch had found.',
    page: FEATURES, level: 'scan', view: 'native', knownGap: true,
    target: (truth) => lineOf(truth, 'eye rests, and a mark made', 'c0'),
  },
  {
    id: 'pull-quote',
    group: 'pinned zero',
    name: 'a centred pull quote set between two rules inside a column',
    why: 'a short centred line between rules is a row of its own within its column; the rules must not '
      + 'merge it with the body lines above and below.',
    page: FEATURES, level: 'scan', view: 'native',
    target: (truth) => lineOf(truth, 'the only sign of the', 'c1'),
  },
];
