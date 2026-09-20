import { useCallback, useState } from 'preact/hooks';

// Edit Pages has exactly one consumer for this hook today, so it lives beside
// the tool rather than in src/lib/ or src/editor/ (docs/module-boundaries.md:
// single-consumer modules stay in the tool's own folder; it gets promoted the
// day a second tool wants it).
//
// The tool's whole mutable document is three lightweight values (pages order,
// removedPageNums, rotations); every mutation already replaces them
// immutably (new array/Set/object), so a "snapshot" is just those three
// references held onto - an array of pointers, not a copy of the thumbnails
// they carry.
//
// No history cap exists anywhere else in this app to copy (nothing else here
// keeps a snapshot stack at all), so this is a fresh call: cap `past` at 50
// entries. Session-only state, but an uncapped stack would retain every
// intermediate pages/removedPageNums/rotations snapshot for the life of the
// tab, growing without bound on a long editing session - 50 is generous for
// "undo my last few actions" while keeping that retention bounded.
const MAX_HISTORY_DEPTH = 50;

export function useEditHistory() {
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  // Call before applying a mutation, with the snapshot of state as it was
  // *before* that mutation. Starts a new branch: any redo future is discarded,
  // matching every other undo/redo stack (a fresh action after an undo
  // overwrites what could have been redone).
  const commit = useCallback((snapshot) => {
    setPast((current) => {
      const next = [...current, snapshot];
      return next.length > MAX_HISTORY_DEPTH
        ? next.slice(next.length - MAX_HISTORY_DEPTH)
        : next;
    });
    setFuture([]);
  }, []);

  // Pass the current (about-to-be-replaced) snapshot so it can be pushed onto
  // the redo future. Returns the snapshot to restore, or null when there is
  // nothing to undo.
  const undo = useCallback((currentSnapshot) => {
    if (past.length === 0) return null;
    const restored = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture((current) => [...current, currentSnapshot]);
    return restored;
  }, [past]);

  const redo = useCallback((currentSnapshot) => {
    if (future.length === 0) return null;
    const restored = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setPast((current) => [...current, currentSnapshot]);
    return restored;
  }, [future]);

  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    commit,
    undo,
    redo,
    reset,
  };
}
