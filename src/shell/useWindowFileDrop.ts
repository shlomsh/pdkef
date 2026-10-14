import { useEffect, useRef, useState } from 'preact/hooks';
import { isDragging, isFileDrag, nextDragDepth } from './fileDragDepth';

/**
 * A dragleave that means the pointer left the window. relatedTarget null alone
 * is not enough: WebKit reports null on every dragleave, including moves
 * between elements inside the page, so the pointer must also be at or past
 * the viewport edge.
 */
export function leftWindow(
  e: { relatedTarget: EventTarget | null; clientX: number; clientY: number },
  width: number,
  height: number,
): boolean {
  return e.relatedTarget === null && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= width || e.clientY >= height);
}

/**
 * True while a file drag is over the window. A file dropped anywhere that no
 * element handler already took goes to `onDrop`, which gets the DataTransfer
 * so a caller can walk a dropped folder. Text and element drags pass
 * through untouched. dragover never touches state (gesture golden rule).
 */
export function useWindowFileDrop({
  enabled,
  onDrop,
}: {
  enabled: boolean;
  onDrop: (dataTransfer: DataTransfer) => void;
}): boolean {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    if (!enabled) return undefined;
    let depth = 0;
    let shown = false;
    const apply = (kind: 'enter' | 'leave' | 'drop' | 'reset') => {
      depth = nextDragDepth(depth, kind);
      const next = isDragging(depth);
      if (next !== shown) {
        shown = next;
        setDragging(next);
      }
    };

    // A drag that started inside this document (an <img> preview can report
    // Files in Chrome) is never a file arriving from outside.
    let internal = false;
    const onStart = () => {
      internal = true;
    };
    const onEnd = () => {
      internal = false;
    };

    const onEnter = (e: DragEvent) => {
      if (internal || !isFileDrag(e.dataTransfer)) return;
      e.preventDefault(); // Safari needs dragenter accepted too
      apply('enter');
    };
    const onOver = (e: DragEvent) => {
      if (!internal && isFileDrag(e.dataTransfer)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (internal || !isFileDrag(e.dataTransfer)) return;
      // The pointer left the window: any unpaired enter (a node removed
      // mid-drag) must not leave the state stuck on.
      apply(leftWindow(e, window.innerWidth, window.innerHeight) ? 'reset' : 'leave');
    };
    const onWindowDrop = (e: DragEvent) => {
      if (internal) {
        internal = false;
        return;
      }
      if (!isFileDrag(e.dataTransfer)) return;
      const alreadyTaken = e.defaultPrevented;
      e.preventDefault();
      apply('drop');
      if (alreadyTaken) return;
      if (e.dataTransfer) onDropRef.current(e.dataTransfer);
    };

    window.addEventListener('dragstart', onStart);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragstart', onStart);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onWindowDrop);
      apply('reset');
    };
  }, [enabled]);

  return dragging;
}
