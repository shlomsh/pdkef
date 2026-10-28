import { useCallback, useEffect, useRef } from 'preact/hooks';
import { isFileDrag } from '#shell/fileDragDepth.ts';
import { cardInsertIndex, pointWithin, rowInsertIndex } from '../lib/mergeDrag.ts';

/**
 * MERGE-07 and MERGE-10: insert where dropped. BasePdfTool's card catches the
 * drop and calls addFiles; this hook only works out, during the native drag,
 * which row of the rail list or which cell of the grid the pointer is over,
 * paints the insertion line straight onto the DOM (a gesture-time DOM write,
 * not state), and leaves the index in a ref for addFiles to read once, on
 * drop through `takeDropPosition`. The hit-testing itself is pure (mergeDrag).
 */
export function useFileDropTargets(hasFiles: boolean) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const stripRef = useRef<HTMLUListElement | null>(null);
  const insertIndexRef = useRef(-1);
  /* MERGE-10: a file dropped onto the grid lands at that page position. */
  const stripInsertIndexRef = useRef(-1);

  /** The positions the last drag settled on; reading them clears them. */
  const takeDropPosition = useCallback(() => {
    const fileIndex = insertIndexRef.current;
    const planIndex = stripInsertIndexRef.current;
    insertIndexRef.current = -1;
    stripInsertIndexRef.current = -1;
    return { fileIndex, planIndex };
  }, []);

  useEffect(() => {
    if (!hasFiles) return undefined;
    const paint = (container: HTMLElement | null, index: number) => {
      if (!container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-id], :scope > [data-key]'));
      items.forEach((item, i) => {
        if (i === index) item.setAttribute('data-insert-before', '');
        else item.removeAttribute('data-insert-before');
      });
      if (index === items.length && items.length > 0) container.setAttribute('data-insert-end', '');
      else container.removeAttribute('data-insert-end');
    };
    const clear = () => {
      insertIndexRef.current = -1;
      stripInsertIndexRef.current = -1;
      paint(listRef.current, -1);
      paint(stripRef.current, -1);
    };
    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event.dataTransfer)) return;
      const list = listRef.current;
      const strip = stripRef.current;
      if (list && pointWithin(list.getBoundingClientRect(), event.clientX, event.clientY, 8)) {
        const rows = Array.from(list.children) as HTMLElement[];
        const index = rowInsertIndex(rows.map((row) => row.getBoundingClientRect()), event.clientY);
        if (index !== insertIndexRef.current || stripInsertIndexRef.current !== -1) {
          stripInsertIndexRef.current = -1;
          paint(strip, -1);
          insertIndexRef.current = index;
          paint(list, index);
        }
        return;
      }
      if (strip && pointWithin(strip.getBoundingClientRect(), event.clientX, event.clientY, 8)) {
        const cards = Array.from(strip.querySelectorAll<HTMLElement>(':scope > [data-key]'));
        const rtl = getComputedStyle(strip).direction === 'rtl';
        const index = cardInsertIndex(cards.map((card) => card.getBoundingClientRect()), event.clientX, rtl);
        if (index !== stripInsertIndexRef.current || insertIndexRef.current !== -1) {
          insertIndexRef.current = -1;
          paint(list, -1);
          stripInsertIndexRef.current = index;
          paint(strip, index);
        }
        return;
      }
      clear();
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) clear();
    };
    // `drop` on window fires after BasePdfTool's card handler has already
    // called addFiles with the refs still set; this only tidies up.
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', clear);
    window.addEventListener('dragend', clear);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', clear);
      window.removeEventListener('dragend', clear);
    };
  }, [hasFiles]);

  return { listRef, stripRef, takeDropPosition };
}
