import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { fitCellWidth } from './stageFit.ts';

/* The desktop cell is a 104 x 138 box that may grow; these are its fixed
   parts (PageStrip.module.css: the 12px grid gap, the cell's flex gap plus
   the page number line under the thumbnail). */
export const MIN_CELL = 104;
const MAX_CELL = 240;
export const CELL_RATIO = 104 / 138;
const GRID_GAP = 12;
const LABEL_HEIGHT = 22;
const DESKTOP = '(min-width: 1024px)';

const px = (value: string) => parseFloat(value) || 0;

/* Reads the stage from the DOM. The floor is the card's MIN-HEIGHT, never its
   content height, so bigger pages can never feed back into the measurement.
   No card or no min-height (jsdom has no layout) keeps today's size. */
function measureCell(grid: HTMLElement, units: number): number {
  const card = grid.closest<HTMLElement>('[data-tool-loaded]');
  if (!card) return MIN_CELL;
  const cardStyle = getComputedStyle(card);
  const minHeight = px(cardStyle.minHeight);
  if (minHeight <= 0) return MIN_CELL;
  const gridStyle = getComputedStyle(grid);
  const floor = card.getBoundingClientRect().top + minHeight;
  const contentTop = grid.getBoundingClientRect().top + px(gridStyle.paddingTop);
  return fitCellWidth({
    units,
    width: grid.clientWidth - px(gridStyle.paddingLeft) - px(gridStyle.paddingRight),
    height: floor - contentTop - px(gridStyle.paddingBottom) - px(cardStyle.paddingBottom),
    gap: GRID_GAP,
    labelHeight: LABEL_HEIGHT,
    ratio: CELL_RATIO,
    min: MIN_CELL,
    max: MAX_CELL,
  });
}

/* The fitted cell width in px on a desktop viewport, null elsewhere (callers
   keep the tablet and phone sizes). `units` is the grid columns the pages
   occupy. Re-measures on a resize of the grid, the card or the window,
   coalesced to one frame, and sets state only when the width changes. */
export function useStageFit(gridRef: RefObject<HTMLElement>, units: number): number | null {
  const [cell, setCell] = useState<number | null>(null);
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const measureRef = useRef<() => void>(() => {});

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DESKTOP);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = query.matches ? measureCell(grid, unitsRef.current) : null;
      setCell((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measureRef.current = schedule;
    const card = grid.closest('[data-tool-loaded]');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(grid);
    if (card) observer?.observe(card);
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [gridRef]);

  // A page added, removed or rotated changes the units without resizing anything.
  useEffect(() => { measureRef.current(); }, [units]);

  return cell;
}
