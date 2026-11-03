import type { RefObject } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import { fitGridColumns } from '../lib/fitGrid.ts';

/** The photo grid's metrics (BatchGrid.module.css): its gap, a caption line with its gap, a tile's range. */
const GRID = { gap: 12, caption: 28, min: 140, max: 280 };
/** Only the desktop stage is one screen tall; below it the grid's height follows its content. */
const DESKTOP = '(min-width: 1024px)';

/**
 * COMP-04: the column count that fills the desktop stage with the set (fitGridColumns), measured from the
 * grid's own box and kept current as it resizes. Null below desktop, where the CSS's auto-fill applies.
 */
export function useFittedColumns(ref: RefObject<HTMLElement>, count: number): number | null {
  const [columns, setColumns] = useState<number | null>(null);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || typeof ResizeObserver === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const desktop = window.matchMedia(DESKTOP);
    const measure = () => {
      // A hidden grid (behind a photo's preview) measures nothing; it is measured again when it shows.
      if (grid.clientWidth === 0) return;
      if (!desktop.matches) {
        setColumns(null);
        return;
      }
      const style = getComputedStyle(grid);
      const width = grid.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
      const height = grid.clientHeight - parseFloat(style.paddingBlockStart) - parseFloat(style.paddingBlockEnd);
      setColumns(fitGridColumns({ ...GRID, count, width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    desktop.addEventListener('change', measure);
    return () => {
      observer.disconnect();
      desktop.removeEventListener('change', measure);
    };
  }, [count]);
  return columns;
}
