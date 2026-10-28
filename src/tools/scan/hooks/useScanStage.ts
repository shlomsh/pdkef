import type { RefObject } from 'preact';
import { useHoldUpdate } from '#lib/hooks/useHoldUpdate.ts';
import { useFloorHeight } from '#shell/pageWorkspace/useFloorHeight.ts';

/** While there are photos: the card fills the first screen down to its foot (desktop), and a forced
 * update waits, as an open document's would. Returns the height to fit the stage to, or null. */
export function useScanStage(workbenchRef: RefObject<HTMLElement>, hasPages: boolean) {
  const stageHeight = useFloorHeight(workbenchRef, hasPages);
  useHoldUpdate(hasPages, 'open');
  return stageHeight;
}
