import { useCallback, useLayoutEffect, useState } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import useElementToolbarFloating from '#editor-ui/hooks/useElementToolbarFloating.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { getStickyToolShellRect } from '#editor-ui/hooks/visualViewportClamp.ts';
import { ROW_GAP, rowSide, type RowSide } from '../lib/marker/panelAnchor.ts';

/**
 * Sign's placement for the mark toolbar: above the reference, start edge (end for RTL), inside the page wrapper
 * and the visual viewport. The reference is the page's `[data-panel-anchor]` node when there is one, sized to the
 * bar so the bar sits where the anchor says; else the mark. Sign's bar never flips, so where the row belongs below
 * the line the anchor steps down past it instead. `anchorKey` re-runs the effect when the anchor moves.
 */
export default function useMarkToolbarPlacement(rootRef: MutableRef<HTMLDivElement | null>, markId: string, rtl: boolean, anchorKey?: string) {
  const toolbar = useElementToolbarFloating({ rtl, coarse: useCoarsePointer() });
  const { setReference, setFloating } = toolbar;
  const [side, setSide] = useState<RowSide>('top');
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setFloating(node);
  }, [rootRef, setFloating]);
  // The mark's node lives in the same page overlay as the bar.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const page = root?.closest('[data-page-wrapper]');
    const anchor = page?.querySelector<HTMLElement>('[data-panel-anchor]') ?? null;
    if (anchor && root) {
      const row = root.getBoundingClientRect();
      anchor.style.width = `${row.width}px`;
      anchor.style.marginTop = '';
      const line = anchor.getBoundingClientRect();
      const next = rowSide(line.top, row.height, getStickyToolShellRect()?.bottom ?? 0);
      if (next === 'bottom') anchor.style.marginTop = `${line.height + row.height + 2 * ROW_GAP}px`;
      setSide(next);
    }
    setReference(anchor ?? page?.querySelector(`[data-editor-element-id="${CSS.escape(markId)}"]`) ?? null);
  }, [markId, anchorKey, rootRef, setReference]);
  return { setRoot, style: toolbar.style, side };
}
