import { useRef } from 'preact/hooks';
import { elementsReducer, type ElementsAction, type ElementsState } from '#editor/model/elementsReducer.ts';
import type { Point } from '../lib/zoom/anchor.ts';
import { affectsNotes, roomChange } from '../lib/notes/roomChange.ts';
import { passageInColumn } from '../lib/zoom/room.ts';

/**
 * R28: a dispatch that opens the first card or closes the last one makes (or gives back) the room for the notes
 * column in the same event, before the state renders, with the passage of the mark being commented measured from
 * the page as it is now. Every other action goes straight through. `zoom` and `isWide` are read when an action
 * arrives, so they may belong to hooks that are created after this one.
 */
export function useNoteRoom({ state, dispatch, columnRef, zoom, isWide }: {
  state: ElementsState;
  dispatch: (action: ElementsAction) => void;
  columnRef: { current: HTMLElement | null };
  zoom: () => { zoom: number; makeRoom(noted: boolean, passage: Point): void };
  isWide: () => boolean;
}) {
  // The state as the actions of this event have left it: several dispatches share one render.
  const pending = useRef(state);
  pending.current = state;

  return {
    dispatch: (action: ElementsAction) => {
      if (!affectsNotes(action)) return dispatch(action);
      const before = pending.current;
      const after = elementsReducer(before, action);
      pending.current = after;
      const change = roomChange(before, after, isWide());
      const passage = change && passageOfMark(change.markId, columnRef.current, zoom().zoom);
      if (change && passage) zoom().makeRoom(change.noted, passage);
      dispatch(action);
    },
  };
}

/** The top-left of a mark's node as a passage in the column, or null when the mark or the column is not on screen. */
function passageOfMark(markId: string, column: HTMLElement | null, zoom: number): Point | null {
  const node = column?.querySelector(`[data-editor-element-id="${CSS.escape(markId)}"]`);
  if (!column || !node) return null;
  const rect = node.getBoundingClientRect();
  return passageInColumn({ x: rect.left, y: rect.top }, column.getBoundingClientRect(), zoom);
}
