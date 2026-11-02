import type { ActionHistoryEntry, HistoryLogger } from '#editor/model/actionHistory.ts';
import type { EditorElement, EditorElementPatch, HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementsAction } from '#editor/model/elementsReducer.ts';
import { createElementId } from '#editor/model/ids.ts';
import { signUpdateDescription } from '#editor/registry/signLabels.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { recordAction } from '#lib/telemetry/actionTrail.ts';
import { buildMarkEdit } from '../marker/markEdit.ts';
import type { Marker } from '../marker/markerState.ts';
import { deleteWithComments } from '../notes/deleteElement.ts';
import { openCommentFor } from '../notes/openComment.ts';
import type { NoteTarget } from '../notes/noteWriter.ts';

interface MarkCommandDeps {
  /** Every element of the document: a delete takes the mark's comments with it, a comment is found or added. */
  elements: EditorElement[];
  dispatch: (action: ElementsAction) => void;
  logAction: HistoryLogger<EditorElement>;
  /** Every change made on a highlight becomes the marker for the next stroke (R5). */
  rearm: (change: Partial<Marker>) => void;
  setAnnouncement: (message: string) => void;
}

interface MarkCommands {
  change(mark: HighlightElement, change: Partial<Marker>): void;
  remove(mark: HighlightElement): void;
  /** R27: opens the mark's comment card; a blank one is added first, unlogged (it is saved, and logged, with its text). Returns the note it made active. */
  comment(mark: HighlightElement): NoteTarget;
}

/** What can be done to one highlight, wherever its controls are drawn: on the mark (a fine pointer) or up top (touch). */
export function markCommands({ elements, dispatch, logAction, rearm, setAnnouncement }: MarkCommandDeps): MarkCommands {
  return {
    change(mark, change) {
      const { changes, entry } = buildMarkEdit(mark, change, (kind) => signUpdateDescription(englishSignMessages, kind, 'highlight'));
      dispatch({ type: 'UPDATE_ELEMENT', payload: { id: mark.id, changes: changes as EditorElementPatch } });
      if (entry) dispatch({ type: 'ADD_ACTION_HISTORY', payload: entry as ActionHistoryEntry<EditorElement> });
      rearm(change);
      recordAction('edit_mark');
    },
    remove(mark) {
      deleteWithComments(elements, mark.id, englishSignMessages, { dispatch, logAction });
      recordAction('delete_mark');
      setAnnouncement(englishSignMessages.removedElement);
    },
    comment(mark) {
      const { add, activeId } = openCommentFor(elements, mark, createElementId());
      if (add) dispatch({ type: 'ADD_ELEMENT', payload: add });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: activeId });
      if (add) return { id: activeId, comment: '', isNew: true };
      const existing = elements.find((el) => el.id === activeId);
      return { id: activeId, comment: existing && 'comment' in existing ? existing.comment : '', isNew: false };
    },
  };
}
