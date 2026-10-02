import { useEffect } from 'preact/hooks';
import { holdUpdate } from './appUpdate/updateHolds.ts';

/**
 * Holds a new build back from taking over this tab while `active` is true.
 * 'export' (default): an export is running; a forced update waits for it too.
 * 'open': a file is merely open (tools without drafts); a force does not wait.
 * See `appUpdate/updateHolds.ts` for why (MEM-10).
 */
export function useHoldUpdate(active: boolean, kind: 'export' | 'open' = 'export'): void {
  useEffect(() => (active ? holdUpdate(kind) : undefined), [active, kind]);
}
