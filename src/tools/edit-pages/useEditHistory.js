import { useCallback, useState } from 'preact/hooks';

// Edit Pages has exactly one consumer for this hook today, so it lives beside
// the tool rather than in src/lib/ or src/editor/ (docs/module-boundaries.md:
// single-consumer modules stay in the tool's own folder; it gets promoted the
// day a second tool wants it).
//
// The hook owns the whole document, not just the two undo/redo stacks: one
// `{ past, present, future }` value behind a single useState, where every
// transition is a *functional* update (`setState(s => ...)`). That is load
// bearing, not a style choice:
//
// - There is no ref mirroring "the latest state" and no render-scoped read of
//   `past`/`future`/`present` inside undo/redo/commit. Two mutations
//   dispatched in the same task (two rotate clicks, or two Cmd+Z keydowns
//   from key auto-repeat, which the shortcut hook does not suppress) each
//   still see the *other* one's effect, because the functional updater form
//   is applied in order by Preact's own state queue - the same guarantee
//   `commit` already relied on before this rewrite. A ref updated from a
//   `useEffect` cannot give that guarantee: Preact defers effects to
//   `requestAnimationFrame`, so two same-task events both read a stale ref.
// - `commit`'s updater receives the *current* `present`, not a snapshot the
//   caller took earlier and may have gone stale by the time it lands, so the
//   caller never needs to hold or synchronize its own copy of the document.
// - Returning the exact same `present` reference from a `commit` updater is
//   the no-op contract: no history entry is pushed and no state changes. A
//   caller uses this to make a bulk action that changes nothing (e.g. "Keep
//   all" with nothing removed) not enable Undo over a step that would
//   visibly do nothing when pressed.
//
// `amend` is the other half: a way for an async writer (thumbnails arriving
// after the user has already moved on) to change the *document* without
// creating a history entry. It applies the same mapper to `present` and to
// every entry in `past` and `future`, so a thumbnail that finishes rendering
// after a commit is not lost when the user undoes past that commit - the
// thumbnail is not a user edit, so undo must not be able to take it away
// (see PdfEditPagesTool.tsx's `renderPdfThumbnails` callback).
//
// No history cap exists anywhere else in this app to copy (nothing else here
// keeps a snapshot stack at all), so this is a fresh call: cap `past` at 50
// entries. Session-only state, but an uncapped stack would retain every
// intermediate document snapshot for the life of the tab, growing without
// bound on a long editing session - 50 is generous for "undo my last few
// actions" while keeping that retention bounded.
const MAX_HISTORY_DEPTH = 50;

function capPast(past) {
  return past.length > MAX_HISTORY_DEPTH ? past.slice(past.length - MAX_HISTORY_DEPTH) : past;
}

export function useEditHistory(initialPresent) {
  const [state, setState] = useState(() => ({ past: [], present: initialPresent, future: [] }));

  // `updater` is `(present) => nextPresent`, or a plain nextPresent value.
  // Starts a new branch: any redo future is discarded, matching every other
  // undo/redo stack (a fresh action after an undo overwrites what could have
  // been redone). Returning the same `present` reference from `updater` is a
  // no-op: no history entry, no state change.
  const commit = useCallback((updater) => {
    setState((s) => {
      const nextPresent = typeof updater === 'function' ? updater(s.present) : updater;
      if (nextPresent === s.present) return s;
      return {
        past: capPast([...s.past, s.present]),
        present: nextPresent,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      const restored = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: restored,
        future: [s.present, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const [restored, ...rest] = s.future;
      return {
        past: [...s.past, s.present],
        present: restored,
        future: rest,
      };
    });
  }, []);

  // Apply `mapper` (present) => present to the live document *and* to every
  // snapshot in past/future, without creating a history entry or touching
  // the future. See the module comment above for why this exists.
  const amend = useCallback((mapper) => {
    setState((s) => ({
      past: s.past.map(mapper),
      present: mapper(s.present),
      future: s.future.map(mapper),
    }));
  }, []);

  const reset = useCallback((nextPresent) => {
    setState({ past: [], present: nextPresent, future: [] });
  }, []);

  return {
    present: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    undo,
    redo,
    amend,
    reset,
  };
}
