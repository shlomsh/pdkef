import { useRef } from 'preact/hooks';
import { highlightReducer, type HighlightAction, type HighlightState } from '../lib/marks/highlightState.ts';
import type { Point } from '../lib/zoom/anchor.ts';
import { affectsNotes, roomChange } from '../lib/notes/roomChange.ts';

/**
 * R28: a dispatch that opens the first card or closes the last one makes (or gives back) the room for the notes
 * column in the same event, before the state renders, with the point of the mark being commented as it is on
 * screen now. Every other action goes straight through, but is still folded into `pending`. `zoom` and `isWide` are read when an action
 * arrives, so they may belong to hooks that are created after this one.
 */
export function useNoteRoom({ state, dispatch, columnRef, zoom, isWide }: {
  state: HighlightState;
  dispatch: (action: HighlightAction) => void;
  columnRef: { current: HTMLElement | null };
  zoom: () => { makeRoom(noted: boolean, point: Point): void };
  isWide: () => boolean;
}) {
  // The state as the actions of this event have left it: several dispatches share one render.
  const pending = useRef(state);
  pending.current = state;

  return {
    dispatch: (action: HighlightAction) => {
      const before = pending.current;
      const after = highlightReducer(before, action);
      pending.current = after;
      if (!affectsNotes(action)) return dispatch(action);
      const change = roomChange(before, after, isWide());
      const point = change && markOnScreen(change.markId, columnRef.current);
      if (change && point) zoom().makeRoom(change.noted, point);
      dispatch(action);
    },
  };
}

/** The top-left of a mark's node in viewport px, or null when the mark or the column is not on screen. */
function markOnScreen(markId: string, column: HTMLElement | null): Point | null {
  const node = column?.querySelector(`[data-editor-element-id="${CSS.escape(markId)}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}
