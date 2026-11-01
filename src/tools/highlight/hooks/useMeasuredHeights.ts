import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/**
 * Heights in points of notes drawn hidden at their print width, read once per list of notes. `needs` says the
 * hidden copies must be rendered under `ref`, each carrying `data-note-id`; `heights` is null until they are read.
 */
export function useMeasuredHeights<T extends { id: string }>(notes: readonly T[] | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ notes: readonly T[]; heights: ReadonlyMap<string, number> } | null>(null);
  const needs = notes !== null && notes.length > 0 && measured?.notes !== notes;
  useLayoutEffect(() => {
    if (!needs || !notes || !ref.current) return;
    const heights = new Map<string, number>();
    ref.current.querySelectorAll<HTMLElement>('[data-note-id]').forEach((el) => {
      heights.set(el.dataset.noteId ?? '', (el.offsetHeight * 72) / 96);
    });
    setMeasured({ notes, heights });
  }, [needs, notes]);
  return { ref, needs, heights: measured?.notes === notes ? measured.heights : null };
}
