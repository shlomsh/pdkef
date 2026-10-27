import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import Sortable from 'sortablejs';
import railStyles from '../components/MergeRail.module.css';
import docStyles from '../components/MergeDocument.module.css';

interface Options {
  /** The desktop rail's file list. */
  listRef: RefObject<HTMLUListElement>;
  /** The phone chip row: a second, independent list over the same files. */
  chipListRef: RefObject<HTMLUListElement>;
  hasFiles: boolean;
  canReorderFiles: boolean;
  onReorder: (oldIndex: number, newIndex: number) => void;
}

const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Whole-file drag-to-reorder, in the rail and in the phone chip row.
 * SortableJS owns the DOM order during a drag; on drop the final order is
 * read back through `onReorder`, which commits it once (golden rule).
 */
export function useRailSortables({ listRef, chipListRef, hasFiles, canReorderFiles, onReorder }: Options) {
  const sortableRef = useRef<Sortable | null>(null);
  const chipSortableRef = useRef<Sortable | null>(null);

  useEffect(() => {
    if (!listRef.current) return undefined;
    sortableRef.current?.destroy();
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 220,
      easing: EASING,
      handle: `.${railStyles.grip}`,
      ghostClass: railStyles['is-ghost'],
      chosenClass: railStyles['is-chosen'],
      dragClass: railStyles['is-dragging'],
      forceFallback: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null) return;
        onReorder(evt.oldIndex, evt.newIndex);
      },
    });
    return () => {
      // Clear the ref: Sortable's destroy() nulls its element, so a second
      // destroy() on the same instance throws (a production report from
      // Firefox caught it).
      sortableRef.current?.destroy();
      sortableRef.current = null;
    };
  }, [hasFiles, onReorder]);

  // The phone chip row: the same whole-file reorder, but a short press-and-hold
  // (touch only) instead of a drag handle, since a chip has no grip of its
  // own - the whole chip is the handle. Give a finger enough movement before
  // cancelling the delayed pickup; the old 5px threshold made an ordinary
  // thumb drift turn into a click before Sortable could start.
  useEffect(() => {
    if (!chipListRef.current) return undefined;
    chipSortableRef.current?.destroy();
    chipSortableRef.current = Sortable.create(chipListRef.current, {
      animation: 220,
      easing: EASING,
      draggable: `.${docStyles.chip}`,
      delay: 100,
      delayOnTouchOnly: true,
      touchStartThreshold: 10,
      // A press on a chip's remove button never starts a drag, and its click
      // still fires.
      filter: `.${docStyles['chip-remove']}`,
      preventOnFilter: false,
      onEnd(evt: Sortable.SortableEvent) {
        if (evt.oldIndex == null || evt.newIndex == null) return;
        onReorder(evt.oldIndex, evt.newIndex);
      },
    });
    return () => {
      chipSortableRef.current?.destroy();
      chipSortableRef.current = null;
    };
  }, [hasFiles, onReorder]);

  // Whole-file reorder remains available after individual pages have crossed
  // file boundaries. Dropping a file deliberately regroups its pages (the
  // same recovery behaviour as choosing a file sort order or Reset order).
  useEffect(() => {
    sortableRef.current?.option('disabled', !canReorderFiles);
    chipSortableRef.current?.option('disabled', !canReorderFiles);
  }, [canReorderFiles]);
}
