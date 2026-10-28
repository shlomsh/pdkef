import { useRef, useEffect } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { captureAddedElement, type HistoryLogger } from '#editor/model/actionHistory.ts';
import { uniqueId } from '#editor/model/ids.ts';
import { signElementTypeLabel } from '#editor/registry/signLabels.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { SignToolAction } from '../components/SignToolContext.tsx';
import { clipboardText, offsetClone } from '../lib/elementClipboard.ts';

interface ElementClipboardOptions {
  dispatch: (action: SignToolAction) => void;
  elements: EditorElement[];
  activeElementId: string | null;
  logAction: HistoryLogger<EditorElement>;
  setAnnouncement: (message: string) => void;
  messages: SignMessages;
}

/** Handle element copy and paste actions. */
export function useElementClipboard({ dispatch, elements, activeElementId, logAction, setAnnouncement, messages: t }: ElementClipboardOptions): void {
  const copiedElementRef = useRef<EditorElement | null>(null);

  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        const activeInput = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        const selStart = activeInput.selectionStart;
        const selEnd = activeInput.selectionEnd;
        if (selStart !== selEnd) {
          return;
        }
      }

      if (!activeElementId) return;
      const elToCopy = elements.find((el) => el.id === activeElementId);
      if (elToCopy) {
        copiedElementRef.current = elToCopy;
        if (e.clipboardData) {
          e.clipboardData.setData('text/plain', clipboardText(elToCopy));
        }
        e.preventDefault();
        setAnnouncement(t.copiedElement);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      if (!copiedElementRef.current) return;
      e.preventDefault();

      const id = uniqueId();
      const original = copiedElementRef.current;
      const clone = offsetClone(original, id);

      dispatch({ type: 'ADD_ELEMENT', payload: clone });
      dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: id });
      logAction('add', 'DUPLICATE_ELEMENT', original.pageIndex, formatMessage(t.duplicatedElementDescriptionTemplate, { label: signElementTypeLabel(t, original.type) }), [captureAddedElement(clone, elements.length)]);
      setAnnouncement(t.pastedElement);
    };

    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    };
  }, [activeElementId, elements]);
}
