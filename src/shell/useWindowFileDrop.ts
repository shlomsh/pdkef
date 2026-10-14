import { useEffect, useRef, useState } from 'preact/hooks';
import { isDragging, isFileDrag, nextDragDepth } from './fileDragDepth';

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

    const onEnter = (e: DragEvent) => {
      if (isFileDrag(e.dataTransfer)) apply('enter');
    };
    const onOver = (e: DragEvent) => {
      if (isFileDrag(e.dataTransfer)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (isFileDrag(e.dataTransfer)) apply('leave');
    };
    const onWindowDrop = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer)) return;
      const alreadyTaken = e.defaultPrevented;
      e.preventDefault();
      apply('drop');
      if (alreadyTaken) return;
      if (e.dataTransfer) onDropRef.current(e.dataTransfer);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onWindowDrop);
      apply('reset');
    };
  }, [enabled]);

  return dragging;
}
