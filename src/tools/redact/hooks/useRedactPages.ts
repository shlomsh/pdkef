import { useRef, useState, useCallback } from 'preact/hooks';
import { toggleWorkspaceFullscreen, useFullscreenChange } from '#editor-ui/hooks/workspaceFullscreen.ts';
import { sampleRingColor } from '#editor-ui/whiteout/pageSampling.ts';
import type { PercentBox } from '#editor-ui/whiteout/pageColor.ts';
import useCurrentPage from '#editor-ui/hooks/useCurrentPage.js';
import type { NeedsUnlockKind } from '#shell/NeedsUnlock.tsx';
import { isFullscreenActive as isFullscreenActiveOf, type RedactAction, type RedactState } from '../state/redactState.ts';
import useSelectionDismiss from './useSelectionDismiss.ts';

/**
 * The page column's own plumbing: the workspace element and its fullscreen,
 * one wrapper ref per page, the colour sample read from a page's canvas, which
 * pages have their real size yet, the protected-file state, and the page the
 * reader is on.
 */
export default function useRedactPages({ state, dispatch }: {
  state: RedactState;
  dispatch: (action: RedactAction) => void;
}) {
  const { activeStyle } = state.tool;
  const { activeBoxId, selectedBoxId } = state.selection;
  const { isPseudoFullscreen } = state.view;
  const { numPages } = state.document;

  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useFullscreenChange(workspaceRef, (active) => dispatch({ type: 'FULLSCREEN_CHANGED', active }));

  const tapOutside = useSelectionDismiss({ activeStyle, activeBoxId, selectedBoxId, dispatch });

  const toggleFullscreen = () => toggleWorkspaceFullscreen(
    workspaceRef.current,
    isPseudoFullscreen,
    (active) => dispatch({ type: 'PSEUDO_FULLSCREEN_CHANGED', active }),
  );

  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  // RED-51: the page's colour just outside a box, read from that page's canvas.
  const samplePage = (pageIndex: number, box: PercentBox) => sampleRingColor(pageWrapperRefs.current[pageIndex]?.querySelector('canvas'), box);
  // The restored document's 77 page canvases acquire their intrinsic size
  // asynchronously. Keep the informational content below the editor out of
  // paint until all of those dimensions are real: otherwise it visibly walks
  // down once per canvas while Redact reconstructs a long saved document.
  // This is deliberately Redact-local; Sign's workspace has its own render
  // path and this is not a layout contract shared with Merge.
  const renderedPageNumbersRef = useRef(new Set<number>());
  // ENC-02: a protected PDF is not a failed load. It gets one quiet state in place of the editor
  // (src/shell/NeedsUnlock.tsx), reset whenever a new file is chosen.
  const [needsUnlock, setNeedsUnlock] = useState<NeedsUnlockKind | null>(null);
  const handlePageViewportReady = useCallback((pageNum: number) => {
    // PdfPageCanvas calls this immediately after it gives the canvas its real
    // viewport dimensions. A Set makes repeated React effects harmless and
    // correctly accepts a legitimate 300×150 PDF page.
    if (renderedPageNumbersRef.current.has(pageNum)) return;
    renderedPageNumbersRef.current.add(pageNum);
    dispatch({ type: 'PAGE_SIZED', sizedPageCount: renderedPageNumbersRef.current.size });
  }, []);

  const isFullscreenActive = isFullscreenActiveOf(state);
  const currentPage = useCurrentPage({
    active: isFullscreenActive,
    rootRef: workspaceRef,
    pageRefs: pageWrapperRefs,
    numPages,
  });

  return {
    workspaceRef, tapOutside, toggleFullscreen, pageWrapperRefs, samplePage, renderedPageNumbersRef,
    needsUnlock, setNeedsUnlock, handlePageViewportReady, isFullscreenActive, currentPage,
  };
}

export type RedactPages = ReturnType<typeof useRedactPages>;
