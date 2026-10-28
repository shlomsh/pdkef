import { useState, useRef } from 'preact/hooks';
import { toggleWorkspaceFullscreen, useFullscreenChange } from '#editor-ui/hooks/workspaceFullscreen.ts';
import useCurrentPage from '#editor-ui/hooks/useCurrentPage.js';

/** The workspace's DOM handles, its full-screen state and the page the viewer is on while full screen. */
export function useSignFullscreen(numPages: number) {
  // Live DOM nodes for each page wrapper, read imperatively at event time (e.g.
  // placeSignatureAt reads getBoundingClientRect to size a dropped signature).
  // These are NOT passed to overlay elements for sizing — each element measures its
  // own container via the DOM instead (see DraggableOverlayElement), so there's no
  // render-time dependency on this array being populated yet.
  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const isFullscreenActive = isFullscreen || isPseudoFullscreen;
  const currentPage = useCurrentPage({
    active: isFullscreenActive,
    rootRef: workspaceRef,
    pageRefs: pageWrapperRefs,
    numPages,
  });

  // Track fullscreen state (also covers exiting via Esc, not just our own button)
  useFullscreenChange(workspaceRef, setIsFullscreen);

  const toggleFullscreen = () => toggleWorkspaceFullscreen(workspaceRef.current, isPseudoFullscreen, setIsPseudoFullscreen);

  return {
    pageWrapperRefs,
    workspaceRef,
    isFullscreen,
    isPseudoFullscreen,
    isFullscreenActive,
    currentPage,
    toggleFullscreen,
  };
}
