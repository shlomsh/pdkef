import { describe, expect, it } from 'vitest';
import { initialScanState, reduceScan } from './scanState.ts';

type ScanState = Parameters<typeof reduceScan>[0];

const corners: ScanState = { ...initialScanState, phase: 'corners', selectedId: 1 };

describe('reduceScan', () => {
  it('starts on the table with nothing selected or pending', () => {
    expect(initialScanState).toMatchObject({ phase: 'table', selectedId: null, topPending: false, focusPending: false });
  });

  describe('photosAdded', () => {
    it('selects the first new photo, stays on the table and owes the top', () => {
      expect(reduceScan(initialScanState, { type: 'photosAdded', firstId: 4 })).toMatchObject({ phase: 'table', selectedId: 4, topPending: true });
    });
    it('from the corners goes back to the table', () => {
      expect(reduceScan(corners, { type: 'photosAdded', firstId: 7 })).toMatchObject({ phase: 'table', selectedId: 7, topPending: true });
    });
    it('is a no-op when everything already holds', () => {
      const s: ScanState = { ...initialScanState, selectedId: 7, topPending: true };
      expect(reduceScan(s, { type: 'photosAdded', firstId: 7 })).toBe(s);
    });
  });

  describe('pageOpened, tableShown, pageRetaken', () => {
    it('pageOpened shows the result of that page and owes the top and the heading focus', () => {
      expect(reduceScan(initialScanState, { type: 'pageOpened', id: 3 })).toMatchObject({ phase: 'result', selectedId: 3, topPending: true, focusPending: true });
    });
    it('tableShown goes back to the table', () => {
      expect(reduceScan(corners, { type: 'tableShown' }).phase).toBe('table');
      expect(reduceScan(initialScanState, { type: 'tableShown' })).toBe(initialScanState);
    });
    it('pageRetaken selects the new page, stays on the result and forgets the old one', () => {
      const s: ScanState = { ...initialScanState, phase: 'result', selectedId: 1, failedIds: [1, 5], findMissed: [1, 6] };
      expect(reduceScan(s, { type: 'pageRetaken', oldId: 1, newId: 2 })).toMatchObject({ phase: 'result', selectedId: 2, failedIds: [5], findMissed: [6] });
    });
  });

  describe('pageSelected', () => {
    it('selects the page in either phase and keeps the phase', () => {
      expect(reduceScan(initialScanState, { type: 'pageSelected', id: 2 })).toMatchObject({ phase: 'table', selectedId: 2 });
      expect(reduceScan(corners, { type: 'pageSelected', id: 2 })).toMatchObject({ phase: 'corners', selectedId: 2 });
    });
    it('is a no-op for the page already selected', () => {
      expect(reduceScan(corners, { type: 'pageSelected', id: 1 })).toBe(corners);
    });
  });

  describe('cornersOpened', () => {
    it('opens the corners, asking for focus only when told to', () => {
      expect(reduceScan(initialScanState, { type: 'cornersOpened', focus: true })).toMatchObject({ phase: 'corners', focusPending: true });
      const quiet = reduceScan(initialScanState, { type: 'cornersOpened', focus: false });
      expect(quiet).toMatchObject({ phase: 'corners', focusPending: false });
    });
    it('keeps what is running for a page', () => {
      const s: ScanState = { ...corners, finding: 3 };
      expect(reduceScan(s, { type: 'cornersOpened', focus: false })).toBe(s);
    });
  });

  describe('failedPageShown', () => {
    it('selects the page, opens its corners and owes top and focus', () => {
      expect(reduceScan(initialScanState, { type: 'failedPageShown', id: 5 })).toMatchObject({ phase: 'corners', selectedId: 5, topPending: true, focusPending: true });
    });
    it('is a no-op once all of that holds', () => {
      const s = reduceScan(initialScanState, { type: 'failedPageShown', id: 5 });
      expect(reduceScan(s, { type: 'failedPageShown', id: 5 })).toBe(s);
    });
  });

  describe('resultShown', () => {
    it('leaves the corners for the result', () => {
      expect(reduceScan(corners, { type: 'resultShown' }).phase).toBe('result');
    });
    it('is a no-op on the result', () => {
      const result: ScanState = { ...initialScanState, phase: 'result' };
      expect(reduceScan(result, { type: 'resultShown' })).toBe(result);
    });
  });

  describe('scroll and focus', () => {
    it('requests each owed move separately', () => {
      expect(reduceScan(initialScanState, { type: 'scrollFocusRequested', top: true })).toMatchObject({ topPending: true, focusPending: false });
      expect(reduceScan(initialScanState, { type: 'scrollFocusRequested', focus: true })).toMatchObject({ topPending: false, focusPending: true });
      expect(reduceScan(initialScanState, { type: 'scrollFocusRequested', top: true, focus: true })).toMatchObject({ topPending: true, focusPending: true });
    });
    it('a request that asks for nothing, or for what is owed, changes nothing', () => {
      expect(reduceScan(initialScanState, { type: 'scrollFocusRequested' })).toBe(initialScanState);
      const owed = { ...initialScanState, topPending: true };
      expect(reduceScan(owed, { type: 'scrollFocusRequested', top: true })).toBe(owed);
    });
    it('consuming clears both and is a no-op when nothing is owed', () => {
      const owed = { ...corners, topPending: true, focusPending: true };
      expect(reduceScan(owed, { type: 'scrollFocusConsumed' })).toMatchObject({ topPending: false, focusPending: false });
      expect(reduceScan(initialScanState, { type: 'scrollFocusConsumed' })).toBe(initialScanState);
    });
  });

  describe('find the page', () => {
    it('runs for one page and ends', () => {
      const running = reduceScan(corners, { type: 'findStarted', id: 1 });
      expect(running.finding).toBe(1);
      expect(reduceScan(running, { type: 'findEnded' }).finding).toBeNull();
    });
    it('ending when nothing runs, or starting the same run again, is a no-op', () => {
      expect(reduceScan(corners, { type: 'findEnded' })).toBe(corners);
      const running = reduceScan(corners, { type: 'findStarted', id: 1 });
      expect(reduceScan(running, { type: 'findStarted', id: 1 })).toBe(running);
    });
    it('a run outlives a change of view', () => {
      const running = reduceScan(corners, { type: 'findStarted', id: 1 });
      expect(reduceScan(running, { type: 'resultShown' }).finding).toBe(1);
    });
    it('records a miss once and forgets it when found', () => {
      const missed = reduceScan(initialScanState, { type: 'findMissed', id: 2 });
      expect(missed.findMissed).toEqual([2]);
      expect(reduceScan(missed, { type: 'findMissed', id: 2 })).toBe(missed);
      expect(reduceScan(missed, { type: 'findFound', id: 2 }).findMissed).toEqual([]);
    });
    it('finding a page that never missed is a no-op', () => {
      expect(reduceScan(initialScanState, { type: 'findFound', id: 2 })).toBe(initialScanState);
    });
  });

  describe('unreadable pages', () => {
    it('marks a page once and clears it', () => {
      const failed = reduceScan(initialScanState, { type: 'pageFailed', id: 3 });
      expect(failed.failedIds).toEqual([3]);
      expect(reduceScan(failed, { type: 'pageFailed', id: 3 })).toBe(failed);
      expect(reduceScan(failed, { type: 'failureCleared', id: 3 }).failedIds).toEqual([]);
    });
    it('clearing a page that did not fail is a no-op', () => {
      expect(reduceScan(initialScanState, { type: 'failureCleared', id: 3 })).toBe(initialScanState);
    });
  });

  describe('pageRemoved', () => {
    it('a neighbour that could not be read opens on its corners, where Remove is', () => {
      const result = { ...initialScanState, phase: 'result', selectedId: 1, failedIds: [2] } as ScanState;
      expect(reduceScan(result, { type: 'pageRemoved', id: 1, neighbourId: 2 })).toMatchObject({ phase: 'corners', selectedId: 2 });
    });
    it('another page leaving only forgets its failure', () => {
      const s: ScanState = { ...corners, failedIds: [9] };
      expect(reduceScan(s, { type: 'pageRemoved', id: 9, neighbourId: 2 })).toEqual({ ...s, failedIds: [] });
    });
    it('another page leaving with nothing failed is a no-op', () => {
      expect(reduceScan(corners, { type: 'pageRemoved', id: 9, neighbourId: 2 })).toBe(corners);
    });
    it('the open page leaving, from the corners or the result, stays in the viewer on the neighbour', () => {
      expect(reduceScan(corners, { type: 'pageRemoved', id: 1, neighbourId: 2 })).toMatchObject({ phase: 'result', selectedId: 2 });
      const result: ScanState = { ...initialScanState, phase: 'result', selectedId: 1 };
      expect(reduceScan(result, { type: 'pageRemoved', id: 1, neighbourId: 2 })).toMatchObject({ phase: 'result', selectedId: 2 });
    });
    it('the open page leaving with no neighbour goes to the table', () => {
      const result: ScanState = { ...initialScanState, phase: 'result', selectedId: 1 };
      expect(reduceScan(result, { type: 'pageRemoved', id: 1, neighbourId: null })).toMatchObject({ phase: 'table', selectedId: null });
    });
    it('from the table it selects the neighbour and stays', () => {
      const s: ScanState = { ...initialScanState, selectedId: 1 };
      expect(reduceScan(s, { type: 'pageRemoved', id: 1, neighbourId: 2 })).toMatchObject({ phase: 'table', selectedId: 2 });
    });
  });

  describe('pageRestored', () => {
    it('selects the page, keeps the phase, and brings back its failure', () => {
      const s: ScanState = { ...initialScanState, phase: 'result', selectedId: 2, failedIds: [5] };
      expect(reduceScan(s, { type: 'pageRestored', id: 1, failed: true })).toMatchObject({ phase: 'result', selectedId: 1, failedIds: [5, 1] });
      expect(reduceScan(s, { type: 'pageRestored', id: 1, failed: false })).toMatchObject({ phase: 'result', selectedId: 1, failedIds: [5] });
    });
    it('keeps the table as the table', () => {
      expect(reduceScan(initialScanState, { type: 'pageRestored', id: 3, failed: false })).toMatchObject({ phase: 'table', selectedId: 3 });
    });
  });

  describe('cleared', () => {
    it('empties the selection, the failures and the corners, keeping the rest', () => {
      const busy: ScanState = { ...corners, failedIds: [1], finding: 1, findMissed: [1], topPending: true };
      expect(reduceScan(busy, { type: 'cleared' })).toEqual({ ...busy, phase: 'table', selectedId: null, failedIds: [] });
    });
    it('is a no-op when already empty', () => {
      expect(reduceScan(initialScanState, { type: 'cleared' })).toBe(initialScanState);
    });
  });
});

describe('the camera (SCAN-08)', () => {
  it('opens for the scan or for one page, and closes', () => {
    const many = reduceScan(initialScanState, { type: 'cameraOpened', camera: { mode: 'many' } });
    expect(many.camera).toEqual({ mode: 'many' });
    const one = reduceScan(initialScanState, { type: 'cameraOpened', camera: { mode: 'one', pageId: 4 } });
    expect(one.camera).toEqual({ mode: 'one', pageId: 4 });
    expect(reduceScan(many, { type: 'cameraClosed' }).camera).toBeNull();
  });

  it('closing a closed camera changes nothing', () => {
    expect(reduceScan(initialScanState, { type: 'cameraClosed' })).toBe(initialScanState);
  });

  describe('Retake from the one-page screen (SCAN-13)', () => {
    const open: ScanState = { ...initialScanState, phase: 'result', selectedId: 4 };

    it('over the table: the camera opens for that page and the page stays open under it', () => {
      const next = reduceScan(open, { type: 'retakeOpened', pageId: 4 });
      expect(next).toMatchObject({ phase: 'result', camera: { mode: 'one', pageId: 4 } });
      expect(reduceScan(next, { type: 'cameraClosed' })).toMatchObject({ phase: 'result', camera: null });
    });

    it('over the camera: the page steps aside, and closing goes back to taking pages', () => {
      const overCamera: ScanState = { ...open, camera: { mode: 'many' } };
      const next = reduceScan(overCamera, { type: 'retakeOpened', pageId: 4 });
      expect(next).toMatchObject({ phase: 'table', camera: { mode: 'one', pageId: 4, thenMany: true } });
      expect(reduceScan(next, { type: 'cameraClosed' }).camera).toEqual({ mode: 'many' });
    });
  });
});
