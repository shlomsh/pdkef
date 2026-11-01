import type { EditorElementPatch } from '#editor/model/editorModel.ts';

/** READ-02: the element actions the shared highlight and comment gestures dispatch. A tool's own
 * action union includes these (Sign's `WorkspaceGestureAction`), so its `dispatch` fits as is. */
export type ElementAction =
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; changes: EditorElementPatch } }
  | { type: 'DELETE_ELEMENT'; payload: string }
  | { type: 'SET_ACTIVE_ELEMENT_ID'; payload: string | null }
  | { type: 'DISARM_TOOL' };
