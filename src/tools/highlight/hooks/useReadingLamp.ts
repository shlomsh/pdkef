import { useState } from 'preact/hooks';
import { toggleWorkspaceFullscreen, useFullscreenChange } from '#editor-ui/hooks/workspaceFullscreen.ts';

/**
 * The reading lamp's state: real fullscreen on the workspace when the browser allows it, else the pseudo lamp the
 * tool draws itself. `fullscreen` is either one; `toggleLamp` enters or leaves whichever applies.
 */
export function useReadingLamp(workspaceRef: { current: HTMLElement | null }) {
  const [lamp, setLamp] = useState({ real: false, pseudo: false });
  useFullscreenChange(workspaceRef, (real) => setLamp((s) => ({ ...s, real })));
  const setPseudo = (pseudo: boolean) => setLamp((s) => ({ ...s, pseudo }));
  return {
    fullscreen: lamp.real || lamp.pseudo,
    pseudoFullscreen: lamp.pseudo,
    toggleLamp: () => toggleWorkspaceFullscreen(workspaceRef.current, lamp.pseudo, setPseudo),
  };
}
