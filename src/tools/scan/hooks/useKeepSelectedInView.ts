import { useEffect } from 'preact/hooks';
import type { RefObject } from 'preact';

/** The selected page stays in view inside the pages list (a capped column from 1024px), by scrolling
 * the list alone: scrollIntoView would also move the page away from the photo on a phone. On a new
 * selection only: an added page is selected, and removing another page must leave the list where it is. */
export function useKeepSelectedInView(listRef: RefObject<HTMLElement>, selectedId: number | null) {
  useEffect(() => {
    const list = listRef.current;
    const tile = list?.querySelector<HTMLElement>('[data-selected]');
    if (!list || !tile) return;
    // Inset by the strip's 10px padding, which keeps the selected ring and the remove disc in the clear.
    const { top, bottom, left, right } = list.getBoundingClientRect();
    const box = { top: top + 10, bottom: bottom - 10, left: left + 10, right: right - 10 };
    const at = tile.getBoundingClientRect();
    if (at.top < box.top) list.scrollTop -= box.top - at.top;
    else if (at.bottom > box.bottom) list.scrollTop += at.bottom - box.bottom;
    if (at.left < box.left) list.scrollLeft -= box.left - at.left;
    else if (at.right > box.right) list.scrollLeft += at.right - box.right;
  }, [selectedId]);
}
