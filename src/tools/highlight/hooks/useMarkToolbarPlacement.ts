import { useCallback, useLayoutEffect } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import useElementToolbarFloating from '#editor-ui/hooks/useElementToolbarFloating.ts';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';

/** Sign's placement for the rest toolbar: above the mark, start edge (end for RTL), inside the page wrapper and the visual viewport. */
export default function useMarkToolbarPlacement(rootRef: MutableRef<HTMLDivElement | null>, markId: string, rtl: boolean) {
  const toolbar = useElementToolbarFloating({ rtl, coarse: useCoarsePointer() });
  const { setReference, setFloating } = toolbar;
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setFloating(node);
  }, [rootRef, setFloating]);
  // The mark's node lives in the same page overlay as the bar.
  useLayoutEffect(() => {
    const page = rootRef.current?.closest('[data-page-wrapper]');
    setReference(page?.querySelector(`[data-editor-element-id="${CSS.escape(markId)}"]`) ?? null);
  }, [markId, rootRef, setReference]);
  return { setRoot, style: toolbar.style };
}
