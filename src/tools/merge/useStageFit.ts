import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import { fitCellWidth, type FitItem } from './stageFit.ts';
import styles from './components/PageStrip.module.css';

/* The desktop cell is a 104 x 138 box that may grow; these are its fixed
   parts (PageStrip.module.css: the 12px grid gap, the cell's flex gap plus
   the page number line under the thumbnail). */
export const MIN_CELL = 104;
const MAX_CELL = 240;
export const CELL_RATIO = 104 / 138;
const GRID_GAP = 12;
const LABEL_HEIGHT = 22;
/* Grouped mode adds the 16px name strip and its 0.3rem flex gap. */
const GROUPED_LABEL_HEIGHT = LABEL_HEIGHT + 16 + 5;
const CAPTION = '[data-caption-for]';
const DESKTOP = '(min-width: 1024px)';

const px = (value: string) => parseFloat(value) || 0;

/* The label chrome under (and above) a thumbnail, measured: a page cell's
   height minus its thumb box. Grouped mode adds the name strip, so the fixed
   constants only hold as the fallback before any cell renders. It does not depend
   on the cell width, so it cannot feed back. */
function measureLabelHeight(grid: HTMLElement): number {
  for (const cell of Array.from(grid.querySelectorAll<HTMLElement>('li[data-key]'))) {
    const thumb = cell.querySelector<HTMLElement>(`.${styles['thumb-box']}`);
    if (!thumb) continue;
    const extra = cell.getBoundingClientRect().height - thumb.getBoundingClientRect().height;
    if (extra > 0) return extra;
  }
  return grid.hasAttribute('data-grouped') ? GROUPED_LABEL_HEIGHT : LABEL_HEIGHT;
}

/* Full-width caption rows are grid items too: their height plus the row gap. */
function measureCaptionRows(grid: HTMLElement): number {
  let total = 0;
  for (const caption of Array.from(grid.querySelectorAll<HTMLElement>(`:scope > ${CAPTION}`))) {
    const height = caption.getBoundingClientRect().height;
    if (height > 0) total += height + GRID_GAP;
  }
  return total;
}

/* Reads the stage from the DOM. The floor is the card's MIN-HEIGHT, never its
   content height, so bigger pages can never feed back into the measurement.
   No card or no min-height (jsdom has no layout) keeps today's size. */
function measureCell(grid: HTMLElement, items: FitItem[]): number {
  const card = grid.closest<HTMLElement>('[data-tool-loaded]');
  if (!card) return MIN_CELL;
  const cardStyle = getComputedStyle(card);
  const minHeight = px(cardStyle.minHeight);
  if (minHeight <= 0) return MIN_CELL;
  const gridStyle = getComputedStyle(grid);
  const floor = card.getBoundingClientRect().top + minHeight;
  const contentTop = grid.getBoundingClientRect().top + px(gridStyle.paddingTop);
  return fitCellWidth({
    items,
    width: grid.clientWidth - px(gridStyle.paddingLeft) - px(gridStyle.paddingRight),
    height: floor - contentTop - px(gridStyle.paddingBottom) - px(cardStyle.paddingBottom) - measureCaptionRows(grid),
    gap: GRID_GAP,
    labelHeight: measureLabelHeight(grid),
    ratio: CELL_RATIO,
    min: MIN_CELL,
    max: MAX_CELL,
  });
}

/* The fitted cell width in px on a desktop viewport, null elsewhere (callers
   keep the tablet and phone sizes). `items` are the grid items the pages
   occupy. Re-measures on a resize of the grid, the card or the window,
   coalesced to one frame, and sets state only when the width changes. */
export function useStageFit(gridRef: RefObject<HTMLElement>, items: FitItem[]): number | null {
  const [cell, setCell] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // The array is new every render; effects depend on what it says.
  const signature = items.map((item) => `${item.span}${item.breakBefore ? 'b' : ''}`).join();
  const measureRef = useRef<() => void>(() => {});

  /* Before paint: the first frame the grid shows already has its fitted size
     (state set here re-renders before the browser paints), so nothing reflows
     afterwards. Re-runs when the items change; grouping changes them too. */
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof window.matchMedia !== 'function') return;
    const next = window.matchMedia(DESKTOP).matches ? measureCell(grid, items) : null;
    setCell((current) => (current === next ? current : next));
  }, [gridRef, signature]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DESKTOP);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = query.matches ? measureCell(grid, itemsRef.current) : null;
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
    /* Anything above the grid that changes height moves the grid down without
       resizing grid or card: watch every earlier sibling on the way up to the card. */
    const above: Element[] = [];
    for (let node: Element | null = grid; node && node !== card; node = node.parentElement) {
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) above.push(sibling);
    }
    for (const element of above) observer?.observe(element);
    window.addEventListener('resize', schedule);
    // Grouping changes the name strip and caption rows without resizing the grid.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    mutations?.observe(grid, { childList: true, attributes: true, attributeFilter: ['data-grouped'] });
    measure();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [gridRef, signature]);

  // A page added, removed or rotated changes the items without resizing anything.
  useEffect(() => { measureRef.current(); }, [signature]);

  return cell;
}
