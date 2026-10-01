import { useEffect } from 'preact/hooks';
import { holdUpdate } from './appUpdate/updateHolds.ts';

/**
 * Holds a new build back from taking over this tab while `active` is true:
 * pass the tool's "a person-initiated export is running" state. See
 * `appUpdate/updateHolds.ts` for why (MEM-10).
 */
export function useHoldUpdate(active: boolean): void {
  useEffect(() => (active ? holdUpdate() : undefined), [active]);
}
