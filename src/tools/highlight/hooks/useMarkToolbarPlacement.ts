import { useCallback, useLayoutEffect } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import useElementToolbarFloating from '#editor-ui/hooks/useElementToolbarFloating.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';

/**
 * Sign's placement for the mark toolbar: above the reference, start edge (end for RTL), inside the page wrapper
 * and the visual viewport. The reference is the page's `[data-panel-anchor]` node when there is one, sized to the
 * bar so the bar centres on the click; else the mark. `anchorKey` re-runs the effect when the anchor moves.
 */
export default function useMarkToolbarPlacement(rootRef: MutableRef<HTMLDivElement | null>, markId: string, rtl: boolean, anchorKey?: string) {
  const toolbar = useElementToolbarFloating({ rtl, coarse: useCoarsePointer() });
  const { setReference, setFloating } = toolbar;
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setFloating(node);
  }, [rootRef, setFloating]);
  // The mark's node lives in the same page overlay as the bar.
  useLayoutEffect(() => {
    const page = rootRef.current?.closest('[data-page-wrapper]');
    const anchor = page?.querySelector<HTMLElement>('[data-panel-anchor]') ?? null;
    const root = rootRef.current;
    if (anchor && root) anchor.style.width = `${root.getBoundingClientRect().width}px`;
    setReference(anchor ?? page?.querySelector(`[data-editor-element-id="${CSS.escape(markId)}"]`) ?? null);
  }, [markId, anchorKey, rootRef, setReference]);
  return { setRoot, style: toolbar.style };
}
