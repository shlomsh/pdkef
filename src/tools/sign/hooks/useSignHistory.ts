import type { EditorElement } from '../../../editor/model/editorModel.ts';
import type { SignMessages } from '../../../editor/registry/messages';
import {
  createActionEntry,
  type ActionHistoryEntry,
  type HistoryLogger,
} from '../../../editor/model/actionHistory.ts';
import { recordAction } from '../../../lib/actionTrail.ts';
import { formatMessage } from '../../../lib/formatMessage';
import { useHistoryShortcuts } from '../../../lib/history/useHistoryShortcuts.js';
import type { SignToolAction } from '../components/SignToolContext.tsx';

interface SignHistoryOptions {
  dispatch: (action: SignToolAction) => void;
  actionHistory: ActionHistoryEntry<EditorElement>[];
  redoHistory: ActionHistoryEntry<EditorElement>[];
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
}

/** Logging an action, and undo/redo of the most recent one (toolbar and Cmd/Ctrl+Z). */
export function useSignHistory({ dispatch, actionHistory, redoHistory, setAnnouncement, messages: t }: SignHistoryOptions) {
  const logAction: HistoryLogger<EditorElement> = (operation, type, pageIndex, description, snapshots) => {
    dispatch({
      type: 'ADD_ACTION_HISTORY',
      payload: createActionEntry({ operation, type, pageIndex, description, elements: snapshots })
    });
  };

  // Cmd/Ctrl+Z, and the toolbar's Undo: undo the single most recently logged
  // action (see actionHistory.ts).
  const undoLast = () => {
    if (actionHistory.length === 0) return;
    const lastAction = actionHistory[0];
    dispatch({ type: 'UNDO' });
    recordAction('undo');
    setAnnouncement(formatMessage(t.undidActionTemplate, { description: lastAction.description }));
  };

  // Shift+Cmd/Ctrl+Z, Ctrl+Y, and the toolbar's Redo: redo the single most
  // recently undone action (see historyStack.ts). The exact mirror of
  // undoLast above.
  const redoLast = () => {
    if (redoHistory.length === 0) return;
    const nextAction = redoHistory[0];
    dispatch({ type: 'REDO' });
    recordAction('redo');
    setAnnouncement(formatMessage(t.redidActionTemplate, { description: nextAction.description }));
  };
  useHistoryShortcuts(undoLast, redoLast);

  return { logAction, undoLast, redoLast };
}
