import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import { useEditHistory } from './useEditHistory.js';

// Same harness pattern as src/lib/useObjectUrls.test.jsx: no
// @testing-library/preact-hooks in this repo, so a tiny component exposes
// the hook's return value onto a ref every render.
function Harness({ apiRef }) {
  apiRef.current = useEditHistory();
  return null;
}

function snapshot(n) {
  return { pages: [{ pageNumber: n, thumbnail: null }], removedPageNums: new Set(), rotations: {} };
}

describe('useEditHistory', () => {
  let container;
  let apiRef;

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    apiRef = { current: null };
    act(() => {
      render(<Harness apiRef={apiRef} />, container);
    });
  }

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('starts with nothing to undo or redo', () => {
    mount();
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('commit makes undo available and undo restores the committed snapshot', () => {
    mount();
    const before = snapshot(1);
    act(() => apiRef.current.commit(before));
    expect(apiRef.current.canUndo).toBe(true);

    let restored;
    act(() => {
      restored = apiRef.current.undo(snapshot(2));
    });
    expect(restored).toBe(before);
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(true);
  });

  it('undo on an empty past returns null and changes nothing', () => {
    mount();
    let restored;
    act(() => {
      restored = apiRef.current.undo(snapshot(1));
    });
    expect(restored).toBeNull();
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('redo restores the snapshot undo displaced, and round-trips back to the same state', () => {
    mount();
    const before = snapshot(1);
    const current = snapshot(2);
    act(() => apiRef.current.commit(before));

    let undone;
    act(() => {
      undone = apiRef.current.undo(current);
    });
    expect(undone).toBe(before);

    let redone;
    act(() => {
      redone = apiRef.current.redo(before);
    });
    expect(redone).toBe(current);
    expect(apiRef.current.canUndo).toBe(true);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('redo on an empty future returns null and changes nothing', () => {
    mount();
    let restored;
    act(() => {
      restored = apiRef.current.redo(snapshot(1));
    });
    expect(restored).toBeNull();
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('a new commit after an undo clears the redo future', () => {
    mount();
    act(() => apiRef.current.commit(snapshot(1)));
    act(() => apiRef.current.undo(snapshot(2)));
    expect(apiRef.current.canRedo).toBe(true);

    act(() => apiRef.current.commit(snapshot(3)));
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('reset clears both stacks', () => {
    mount();
    act(() => apiRef.current.commit(snapshot(1)));
    act(() => apiRef.current.undo(snapshot(2)));
    expect(apiRef.current.canUndo || apiRef.current.canRedo).toBe(true);

    act(() => apiRef.current.reset());
    expect(apiRef.current.canUndo).toBe(false);
    expect(apiRef.current.canRedo).toBe(false);
  });

  it('caps the past stack depth, dropping the oldest entries first', () => {
    mount();
    // Commit more than the 50-entry cap; only the most recent 50 should survive.
    for (let i = 0; i < 55; i += 1) {
      act(() => apiRef.current.commit(snapshot(i)));
    }
    expect(apiRef.current.canUndo).toBe(true);

    // Undo all the way: exactly 50 undos should be possible, the 51st should not be.
    let undoneCount = 0;
    let current = snapshot(999);
    for (let i = 0; i < 60; i += 1) {
      let restored;
      act(() => {
        restored = apiRef.current.undo(current);
      });
      if (restored === null) break;
      undoneCount += 1;
      current = restored;
    }
    expect(undoneCount).toBe(50);
    // The oldest surviving snapshot is commit index 5 (0..4 were evicted by the cap).
    expect(current.pages[0].pageNumber).toBe(5);
  });
});
