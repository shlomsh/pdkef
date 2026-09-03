import { uniqueId } from './ids.ts';

/**
 * One reversible editor operation (used by `useUndoShortcut` and
 * `UndoHistoryModal`). Creation entries have no snapshot and undo by removing
 * `elementId`; deletion entries retain the removed elements and undo by
 * restoring that snapshot. Edits are intentionally not logged: reverting
 * those would require the prior value for every mutation.
 *
 * The generic keeps this shared model usable by both the Sign editor and
 * Redact's additional preview-only element types.
 */
export interface ActionHistoryEntry<TElement = unknown> {
  id: string;
  type: string;
  elementId: string | null;
  pageIndex: number;
  description: string;
  timestamp: number;
  snapshot: TElement[] | null;
}

export function createActionEntry<TElement = unknown>(
  type: string,
  elementId: string | null,
  pageIndex: number,
  description: string,
  snapshot: TElement[] | null = null,
): ActionHistoryEntry<TElement> {
  return { id: uniqueId(), type, elementId, pageIndex, description, timestamp: Date.now(), snapshot };
}
