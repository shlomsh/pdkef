import { useEffect } from 'preact/hooks';
import type { EditorElement } from '../../../editor/model/editorModel.ts';
import { captureElementSnapshots, type HistoryLogger } from '../../../editor/model/actionHistory.ts';
import { signElementTypeLabel } from '../../../editor/registry/signLabels';
import type { SignMessages } from '../../../editor/registry/messages';
import { recordAction } from '../../../lib/actionTrail.ts';
import { formatMessage } from '../../../lib/formatMessage';
import type { SignToolAction } from '../components/SignToolContext.tsx';
import { classifySignKey } from '../lib/signKeyAction.ts';
import type { FieldNavigation } from './useFieldNavigation.ts';

interface SignKeyboardOptions {
  dispatch: (action: SignToolAction) => void;
  elements: EditorElement[];
  activeElementId: string | null;
  editingElementId: string | null;
  fieldNavigation: FieldNavigation;
  /** Fill mode leaves Tab to the browser. */
  enabled: boolean;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
}

/** Global keyboard shortcuts (Escape, Tab between fields, Enter to edit, Delete); see lib/signKeyAction.ts. */
export function useSignKeyboard({
  dispatch, elements, activeElementId, editingElementId, fieldNavigation, enabled, logAction, setAnnouncement, messages: t,
}: SignKeyboardOptions): void {
  // Delete placed element
  const deleteElement = (id: string) => {
    const el = elements.find(e => e.id === id);
    const snapshots = captureElementSnapshots(elements, (element) => element.id === id);
    dispatch({ type: 'DELETE_ELEMENT', payload: id });
    recordAction('delete_mark');
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (el) logAction('delete', 'DELETE_ELEMENT', el.pageIndex, formatMessage(t.deletedElementDescriptionTemplate, { label: signElementTypeLabel(t, el.type) }), snapshots);
    setAnnouncement(t.removedElement);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = classifySignKey({
        key: e.key,
        shiftKey: e.shiftKey,
        activeTag: document.activeElement?.tagName,
        editingElementId,
        activeElementId,
        fillEnabled: enabled,
        hasNext: fieldNavigation.hasNext,
        hasPrevious: fieldNavigation.hasPrevious,
        selectedIsText: elements.find(el => el.id === activeElementId)?.type === 'text',
      });
      switch (action.kind) {
        case 'finish-editing':
          dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: null });
          (document.activeElement as HTMLElement | null)?.blur();
          setAnnouncement(t.finishedEditingHint);
          return;
        case 'clear-selection':
          dispatch({ type: 'SET_TOOL', payload: null });
          dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        case 'field-next':
          e.preventDefault();
          fieldNavigation.goToNext();
          return;
        case 'field-previous':
          e.preventDefault();
          fieldNavigation.goToPrevious();
          return;
        case 'edit-selected':
          e.preventDefault();
          dispatch({ type: 'SET_EDITING_ELEMENT_ID', payload: activeElementId });
          return;
        case 'delete-active':
          e.preventDefault();
          deleteElement(activeElementId as string);
          return;
        default:
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // fieldNavigation is a plain object rebuilt every render (like
    // useWorkspaceGestures's handlers), so listing it here re-subscribes on
    // every render rather than risking a stale hasNext/hasPrevious closure -
    // cheap next to what a Tab press silently doing the wrong thing would cost.
  }, [activeElementId, editingElementId, elements, fieldNavigation, enabled]);
}
