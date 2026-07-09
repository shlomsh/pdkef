import { uniqueId } from './sign.js';

// One entry in a tool's undo-able action log (see useUndoShortcut.js and
// UndoHistoryModal.jsx). Both the Sign and Redact tools log two kinds of
// events:
//   - creation (draw/place/duplicate): `snapshot` is null, `elementId` is set.
//     Undoing removes the element by id.
//   - deletion (single delete, or a bulk removal like Redact's "Clear page"):
//     `snapshot` holds the removed element(s) (always an array, even for one).
//     Undoing re-inserts them. `elementId` is still set for a single delete
//     (handy for display/debugging) but undo uses `snapshot`, not `elementId`.
// Edits (color, resize, drag) are intentionally not logged: reverting those
// would need snapshotting previous *values* on every change, a materially
// bigger feature than this simple "undo my last add/delete".
export function createActionEntry(type, elementId, pageIndex, description, snapshot = null) {
  return { id: uniqueId(), type, elementId, pageIndex, description, timestamp: Date.now(), snapshot };
}
