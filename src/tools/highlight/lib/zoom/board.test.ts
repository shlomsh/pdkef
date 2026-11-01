import { describe, expect, it } from 'vitest';
import { boardLayout, centredScrollLeft } from './board.ts';
import { zoomCommit } from './commit.ts';

describe('boardLayout', () => {
  it('leaves one view of slack each side of the page', () => {
    expect(boardLayout(600, 900)).toEqual({ slack: 900, boardWidth: 2400 });
  });
});

describe('centredScrollLeft', () => {
  it('counts the workspace padding the board starts after, so the column sits in the middle of the view', () => {
    const layout = boardLayout(1408, 1440);
    const left = centredScrollLeft(layout, 1408, 1440, undefined, 16);
    // The column's left edge on screen is inset + slack - scrollLeft: equal gutters of 16 px each side.
    expect(16 + layout.slack - left).toBe(16);
  });

  const view = 900;
  it('puts the page in the middle of the view', () => {
    const layout = boardLayout(600, view);
    const left = centredScrollLeft(layout, 600, view);
    // the page spans slack..slack+600 on the board; its middle sits at the view's middle
    expect(layout.slack + 300 - left).toBe(view / 2);
  });
  it('puts a focus span in the middle instead (Fit text)', () => {
    const layout = boardLayout(600, view);
    const left = centredScrollLeft(layout, 600, view, { left: 100, right: 300 });
    expect(layout.slack + 200 - left).toBe(view / 2);
  });
});

describe('a zoom on the board', () => {
  it('keeps the anchored page point under the same screen x and y', () => {
    const view = 900;
    const page0 = 400; // css px wide at zoom 1
    const slack = boardLayout(page0, view).slack;
    const origin = { x: slack, y: 80 }; // the column's top-left on the board
    const scroll = { x: 650, y: 200 };
    const anchor = { x: 420, y: 310 };
    const local = (s: { x: number; y: number }, z: number) => ({
      x: (anchor.x - (origin.x - s.x)) / z,
      y: (anchor.y - (origin.y - s.y)) / z,
    });
    const before = local(scroll, 1);
    const { zoom, scroll: next } = zoomCommit({ prevZoom: 1, nextZoom: 1.5, anchor, scroll, origin });
    expect(zoom).toBe(1.5);
    // slack is the view width, so it did not change with the zoom
    expect(boardLayout(page0 * 1.5, view).slack).toBe(slack);
    const after = local(next, 1.5);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe('vertical room', () => {
  it('has none: the board scrolls from the column top to its bottom', () => {
    expect(boardLayout(600, 900)).not.toHaveProperty('slackY');
  });
});

describe('centring with a notes column', () => {
  it('centres the whole column (page + notes), not the page alone', () => {
    const view = 900;
    const column = 600 + 240;
    const layout = boardLayout(column, view);
    expect(layout.boardWidth).toBe(column + 2 * view);
    const left = centredScrollLeft(layout, column, view);
    expect(layout.slack + column / 2 - left).toBe(view / 2);
  });
});
