import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import Sortable from 'sortablejs';

/** The photo types Scan and Image to PDF take. */
export const PHOTO_ACCEPTED_TYPES = ['image/jpeg', 'image/png'];
export const PHOTO_ACCEPT = PHOTO_ACCEPTED_TYPES.join(',');

interface PhotoTileListOptions {
  /** Whether the list is on screen: the drag handler is made when it first is. */
  active: boolean;
  /** The list's items; focus is put back after each change to them. */
  items: unknown;
  /** The CSS Modules class a tile wears while it is dragged over its old place. */
  ghostClass: string;
  /** Optional class for the tile in hand. */
  chosenClass?: string;
  /** A drop that moved a tile. The caller reads the new order back into state. */
  onReorder: (oldIndex: number, newIndex: number) => void;
}

/**
 * The shared behaviour of a reorderable list of photo tiles (`<ul>` of `[data-id]` items, each
 * holding a `[data-page]` focus target): SortableJS owns the DOM during a drag and the order
 * is read back on drop, and focus returns to a tile after a keyboard move or a removal.
 * Set `focusIdRef.current` to a tile id before the change that should restore focus.
 */
export function usePhotoTileList({ active, items, ghostClass, chosenClass, onReorder }: PhotoTileListOptions) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const focusIdRef = useRef<number | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // A keyboard move re-parents the tile, which can drop focus: put it back.
  // A layout effect, so the focus is back before the next auto-repeated key lands.
  useLayoutEffect(() => {
    const id = focusIdRef.current;
    if (id === null) return;
    focusIdRef.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"] [data-page]`)?.focus();
  }, [items]);

  useEffect(() => {
    if (!listRef.current) return undefined;
    const sortable = Sortable.create(listRef.current, {
      animation: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      draggable: '[data-id]',
      filter: 'button',
      preventOnFilter: false,
      delay: 150,
      delayOnTouchOnly: true,
      ghostClass,
      ...(chosenClass ? { chosenClass } : {}),
      forceFallback: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex === evt.newIndex || evt.oldIndex == null || evt.newIndex == null) return;
        onReorderRef.current(evt.oldIndex, evt.newIndex);
      },
    });
    return () => sortable.destroy();
  }, [active]);

  return { listRef, focusIdRef };
}
