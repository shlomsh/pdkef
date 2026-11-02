import { useEffect, useRef } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { noteStaysOpen } from '../lib/notes/noteFocus.ts';

const CARD = '[data-comment-card]';
const MARK = '[data-editor-element-id]';

interface Options {
  rootRef: { current: HTMLElement | null };
  elements: readonly EditorElement[];
  activeElementId: string | null;
  enabled: boolean;
  onClose(): void;
}

/**
 * Closes the open note when focus (or a press) goes anywhere but its card or the mark it hangs on. A card whose text field is open
 * never closes, so a draft is not lost, and a window that lost focus closes nothing. @testSeam until HighlightWorkspace consumes it
 */
export function useNoteFocusOut({ rootRef, elements, activeElementId, enabled, onClose }: Options): void {
  const latest = useRef({ elements, activeElementId, onClose });
  latest.current = { elements, activeElementId, onClose };
  const listening = enabled && activeElementId !== null;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !listening) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fieldOpen = (id: string) => !!root.querySelector(`[data-comment-card="${CSS.escape(id)}"] textarea`);
    const onFocusOut = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { elements: els, activeElementId: id, onClose: close } = latest.current;
        if (!id || !document.hasFocus() || fieldOpen(id)) return;
        const to = document.activeElement;
        const next = {
          cardId: to?.closest(CARD)?.getAttribute('data-comment-card') ?? null,
          elementId: to?.closest(MARK)?.getAttribute('data-editor-element-id') ?? null,
        };
        if (!noteStaysOpen(els, id, next)) close();
      }, 0);
    };
    const onPointerDown = (event: Event) => {
      const { activeElementId: id, onClose: close } = latest.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!id || target?.closest(CARD) || target?.closest(MARK) || fieldOpen(id)) return;
      close();
    };
    root.addEventListener('focusout', onFocusOut);
    root.addEventListener('pointerdown', onPointerDown);
    return () => {
      clearTimeout(timer);
      root.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('pointerdown', onPointerDown);
    };
  }, [rootRef, listening]);
}
