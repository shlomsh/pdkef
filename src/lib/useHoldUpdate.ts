import { useEffect } from 'preact/hooks';
import { holdUpdate } from './appUpdate/updateHolds.ts';

/**
 * Holds a new build back from taking over this tab while `active` is true:
 * pass the tool's "an export is running" state, or, in a tool without drafts,
 * "a file is open". See `appUpdate/updateHolds.ts` for why (MEM-10).
 */
export function useHoldUpdate(active: boolean): void {
  useEffect(() => (active ? holdUpdate() : undefined), [active]);
}
