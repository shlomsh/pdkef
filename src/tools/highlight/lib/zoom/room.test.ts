import { describe, expect, it } from 'vitest';
import { keepPassageOnRoom, passageInColumn } from './room.ts';

// Where a passage sits on screen, given the column's document position stays put while the scroll changes.
const viewportY = (colDocTop: number, scrollY: number, passageY: number, zoom: number) => colDocTop - scrollY + passageY * zoom;

describe('keepPassageOnRoom', () => {
  const before = { rect: { left: 300, top: -200 }, scroll: { x: 40, y: 1000 }, zoom: 1.5 };

  it('keeps the passage on the same line of the screen when the page shrinks (zoom 1.5 to 1.2)', () => {
    const passage = { x: 120, y: 900 };
    const next = keepPassageOnRoom({ before, nextZoom: 1.2, passage });
    const colDocTop = before.rect.top + before.scroll.y;
    const y0 = viewportY(colDocTop, before.scroll.y, passage.y, before.zoom);
    const y1 = viewportY(colDocTop, next.y, passage.y, 1.2);
    expect(Math.abs(y1 - y0)).toBeLessThan(0.5);
    expect(next.y).toBeCloseTo(730);
  });

  it('keeps it still when the room is given back (zoom 1.2 to 1.5)', () => {
    const passage = { x: 0, y: 450 };
    const shrunk = { rect: { left: 300, top: 70 }, scroll: { x: 40, y: 730 }, zoom: 1.2 };
    const next = keepPassageOnRoom({ before: shrunk, nextZoom: 1.5, passage });
    const colDocTop = shrunk.rect.top + shrunk.scroll.y;
    const y0 = viewportY(colDocTop, shrunk.scroll.y, passage.y, 1.2);
    expect(Math.abs(viewportY(colDocTop, next.y, passage.y, 1.5) - y0)).toBeLessThan(0.5);
  });

  it('leaves the horizontal scroll alone, so the left edge of the page stays at the same viewport x', () => {
    const next = keepPassageOnRoom({ before, nextZoom: 1.2, passage: { x: 500, y: 900 } });
    expect(next.x).toBe(before.scroll.x);
  });

  it('does not move at all when the zoom does not change', () => {
    expect(keepPassageOnRoom({ before, nextZoom: 1.5, passage: { x: 5, y: 900 } })).toEqual(before.scroll);
  });

  it('keeps a passage at the top of the column where it is', () => {
    expect(keepPassageOnRoom({ before, nextZoom: 1, passage: { x: 0, y: 0 } }).y).toBe(before.scroll.y);
  });
});

describe('passageInColumn', () => {
  it('turns a point measured on screen into unscaled column pixels', () => {
    expect(passageInColumn({ x: 700, y: 400 }, { left: 300, top: -200 }, 2)).toEqual({ x: 200, y: 300 });
  });
});
