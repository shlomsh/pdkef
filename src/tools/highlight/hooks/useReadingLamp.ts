import { useState } from 'preact/hooks';
import { toggleWorkspaceFullscreen, useFullscreenChange } from '#editor-ui/hooks/workspaceFullscreen.ts';
import { useLampEntrance } from './useLampEntrance.ts';

/**
 * The reading lamp's state: real fullscreen on the workspace when the browser allows it, else the pseudo lamp the
 * tool draws itself. `fullscreen` is either one; `toggleLamp` enters or leaves whichever applies, with the cord's entrance
 * or the capsule's exit playing around the change (useLampEntrance).
 */
export function useReadingLamp(workspaceRef: { current: HTMLElement | null }) {
  const [lamp, setLamp] = useState({ real: false, pseudo: false });
  useFullscreenChange(workspaceRef, (real) => setLamp((s) => ({ ...s, real })));
  const setPseudo = (pseudo: boolean) => setLamp((s) => ({ ...s, pseudo }));
  const fullscreen = lamp.real || lamp.pseudo;
  const toggleLamp = useLampEntrance({
    workspaceRef, fullscreen,
    toggleLamp: () => toggleWorkspaceFullscreen(workspaceRef.current, lamp.pseudo, setPseudo),
  });
  return {
    fullscreen,
    pseudoFullscreen: lamp.pseudo,
    toggleLamp,
  };
}
