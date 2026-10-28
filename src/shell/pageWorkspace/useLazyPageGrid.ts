import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { reportError } from '#lib/telemetry/errorReport.ts';
import type { PageGridProps } from '../pageGrid/PageGrid.tsx';

/**
 * The page grid, loaded through a dynamic import() once a file is open, so the grid, its
 * preview dialog and Sortable stay off the eager graph check-page-weight.js measures.
 * Null until it arrives.
 */
export function useLazyPageGrid(fileOpen: boolean): ComponentType<PageGridProps> | null {
  const [PageGrid, setPageGrid] = useState<ComponentType<PageGridProps> | null>(null);
  useEffect(() => {
    if (!fileOpen || PageGrid) return undefined;
    let cancelled = false;
    import('../pageGrid/PageGrid.tsx')
      .then((module) => { if (!cancelled) setPageGrid(() => module.default); })
      .catch((err) => reportError('pdf_render', err, 'load_page_grid'));
    return () => { cancelled = true; };
  }, [fileOpen, PageGrid]);
  return PageGrid;
}
