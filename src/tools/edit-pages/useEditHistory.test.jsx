import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import { useEditHistory } from './useEditHistory.js';

// Same harness pattern as src/lib/useObjectUrls.test.jsx: no
// @testing-library/preact-hooks in this repo, so a tiny component exposes
// the hook's return value onto a ref every render.
function Harness({ apiRef, initial }) {
  apiRef.current = useEditHistory(initial);
  return null;
}

function present(n) {
  return { pages: [{ pageNumber: n, thumbnail: null }], removedPageNums: new Set(), rotations: {} };
}

describe('useEditHistory', () => {
  let container;
  let apiRef;

  function mount(initial = present(0)) {
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
    act(() => {
      render(<Harness apiRef={apiRef} initial={initial} />, container);
    });
  }

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('starts at the given initial present with nothing to undo or redo', () => {
    const initial = present(0);
    mount(initial);
    expect(apiRef.current.present).toBe(initial);
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('commit accepts a plain value and makes undo available', () => {
    mount(present(0));
    act(() => apiRef.current.commit(present(1)));
    expect(apiRef.current.present).toEqual(present(1));
    expect(apiRef.current.canUndo).toBe(true);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('commit accepts an updater function that receives the live present', () => {
    mount(present(0));
    act(() => apiRef.current.commit((current) => ({ ...current, rotations: { 1: 90 } })));
    expect(apiRef.current.present.rotations).toEqual({ 1: 90 });
    expect(apiRef.current.canUndo).toBe(true);
  });

  it('a commit whose updater returns the same present reference is a no-op: no history entry', () => {
    mount(present(0));
    act(() => apiRef.current.commit((current) => current));
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.present).toEqual(present(0));
  });

  it('undo restores the previous present; undo on an empty past changes nothing', () => {
    mount(present(0));
    act(() => apiRef.current.undo());
    expect(apiRef.current.present).toEqual(present(0));
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(false);

    act(() => apiRef.current.commit(present(1)));
    act(() => apiRef.current.undo());
    expect(apiRef.current.present).toEqual(present(0));
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(true);
  });

  it('redo restores what undo displaced; redo on an empty future changes nothing', () => {
    mount(present(0));
    act(() => apiRef.current.redo());
    expect(apiRef.current.present).toEqual(present(0));
    expect(apiRef.current.canRedo).toBe(false);

    act(() => apiRef.current.commit(present(1)));
    act(() => apiRef.current.undo());
    act(() => apiRef.current.redo());
    expect(apiRef.current.present).toEqual(present(1));
    expect(apiRef.current.canUndo).toBe(true);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('a new commit after an undo clears the redo future', () => {
    mount(present(0));
    act(() => apiRef.current.commit(present(1)));
    act(() => apiRef.current.undo());
    expect(apiRef.current.canRedo).toBe(true);

    act(() => apiRef.current.commit(present(2)));
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('reset replaces the present and clears both stacks', () => {
    mount(present(0));
    act(() => apiRef.current.commit(present(1)));
    act(() => apiRef.current.undo());
    expect(apiRef.current.canUndo || apiRef.current.canRedo).toBe(true);

    act(() => apiRef.current.reset(present(9)));
    expect(apiRef.current.present).toEqual(present(9));
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('caps the past stack depth, dropping the oldest entries first', () => {
    mount(present(0));
    // Commit more than the 50-entry cap; only the most recent 50 pre-commit
    // presents should survive in `past`.
    for (let i = 1; i <= 55; i += 1) {
      act(() => apiRef.current.commit(present(i)));
    }
    expect(apiRef.current.present).toEqual(present(55));

    // Undo all the way: exactly 50 undos should move state, the 51st should not.
    let undoneCount = 0;
    for (let i = 0; i < 60; i += 1) {
      if (!apiRef.current.canUndo) break;
      act(() => apiRef.current.undo());
      undoneCount += 1;
    }
    expect(undoneCount).toBe(50);
    // The oldest surviving snapshot is commit index 5 (0..4 were evicted by the cap).
    expect(apiRef.current.present).toEqual(present(5));
    expect(apiRef.current.canUndo).toBe(false);
  });

  // Regression for the "undo permanently destroys thumbnails that rendered
  // after the snapshot" defect: a late-arriving thumbnail must survive an
  // undo past the commit that preceded it.
  it('amend maps a change across the live present and every past/future snapshot, without creating a history entry', () => {
    mount({
      pages: [{ pageNumber: 1, thumbnail: null }, { pageNumber: 2, thumbnail: null }],
      removedPageNums: new Set(),
      rotations: {},
    });

    // A user edit is committed while page 2's thumbnail is still null.
    act(() => apiRef.current.commit((current) => ({ ...current, rotations: { 1: 90 } })));
    expect(apiRef.current.canUndo).toBe(true);

    // Page 2's thumbnail finishes rendering asynchronously, after the commit.
    act(() => {
      apiRef.current.amend((snapshot) => ({
        ...snapshot,
        pages: snapshot.pages.map((p) => (p.pageNumber === 2 ? { ...p, thumbnail: 'data:thumb-2' } : p)),
      }));
    });
    expect(apiRef.current.present.pages[1].thumbnail).toBe('data:thumb-2');
    // amend never touches the undo/redo stacks themselves.
    expect(apiRef.current.canUndo).toBe(true);
    expect(apiRef.current.canRedo).toBe(false);

    // Undoing past the rotate must not lose the thumbnail: amend already
    // rewrote the snapshot sitting in `past`, not just the live present.
    act(() => apiRef.current.undo());
    expect(apiRef.current.present.rotations).toEqual({});
    expect(apiRef.current.present.pages[1].thumbnail).toBe('data:thumb-2');
  });

  // Regression for "two actions in one task swallow a history step": with no
  // ref and no render-scoped read, each commit's updater sees what the
  // previous same-task commit did.
  it('two commits dispatched in the same task each see the other, producing two distinct undo steps', () => {
    mount({ pages: [{ pageNumber: 1, thumbnail: null }], removedPageNums: new Set(), rotations: {} });

    act(() => {
      apiRef.current.commit((current) => ({ ...current, rotations: { 1: (current.rotations[1] || 0) + 90 } }));
      apiRef.current.commit((current) => ({ ...current, rotations: { 1: (current.rotations[1] || 0) + 90 } }));
    });
    expect(apiRef.current.present.rotations).toEqual({ 1: 180 });

    act(() => apiRef.current.undo());
    expect(apiRef.current.present.rotations).toEqual({ 1: 90 });
    expect(apiRef.current.canUndo).toBe(true);

    act(() => apiRef.current.undo());
    expect(apiRef.current.present.rotations).toEqual({});
    expect(apiRef.current.canUndo).toBe(false);
  });

  // Regression for the redo-swallowing half of the same defect: two undos
  // fired in one task (key auto-repeat) must move two steps back, not one
  // real undo plus a dead redo entry.
  it('two undos dispatched in the same task move two steps back, with canUndo/canRedo correct afterwards', () => {
    mount(present(0));
    act(() => apiRef.current.commit(present(1)));
    act(() => apiRef.current.commit(present(2)));

    act(() => {
      apiRef.current.undo();
      apiRef.current.undo();
    });
    expect(apiRef.current.present).toEqual(present(0));
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(true);

    act(() => {
      apiRef.current.redo();
      apiRef.current.redo();
    });
    expect(apiRef.current.present).toEqual(present(2));
    expect(apiRef.current.canUndo).toBe(true);
    expect(apiRef.current.canRedo).toBe(false);
  });
});
