import { useRef, useState } from 'preact/hooks';
import { NO_HISTORY, recorded, redone, undone, type CornerHistory, type CornerShape } from '../lib/cornerHistory.ts';

/** Undo and redo for one page's corners, pins and Fine-tune switch. `current` is the page's shape now (from props); `apply` puts a shape on the page (the tool's commit). */
export function useCornerHistory(pageId: number, current: CornerShape, apply: (shape: CornerShape) => void) {
  const histories = useRef(new Map<number, CornerHistory>());
  const [, setVersion] = useState(0);
  const latest = useRef({ current, apply });
  latest.current = { current, apply };

  const get = () => histories.current.get(pageId) ?? NO_HISTORY;
  const set = (h: CornerHistory) => {
    histories.current.set(pageId, h);
    setVersion((v) => v + 1);
  };

  const h = get();
  return {
    /** A change by the person: records the shape it replaces, then applies it. */
    commit(next: CornerShape) {
      set(recorded(get(), latest.current.current));
      latest.current.apply(next);
    },
    /** Records the shape now as a step without applying anything, for a change some other code is about to make (Auto-detect). */
    remember() {
      set(recorded(get(), latest.current.current));
    },
    undo() {
      const step = undone(get(), latest.current.current);
      if (!step) return;
      set(step.history);
      latest.current.apply(step.shape);
    },
    redo() {
      const step = redone(get(), latest.current.current);
      if (!step) return;
      set(step.history);
      latest.current.apply(step.shape);
    },
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
