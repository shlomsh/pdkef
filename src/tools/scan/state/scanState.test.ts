import { describe, expect, it } from 'vitest';
import { initialScanState, reduceScan } from './scanState.ts';

type ScanState = Parameters<typeof reduceScan>[0];
import { FULL_QUAD } from '../lib/quad.ts';

const corners: ScanState = { ...initialScanState, phase: 'corners', selectedId: 1 };
const landing = { quad: FULL_QUAD, turns: 1 };

describe('reduceScan', () => {
  it('starts on the result with nothing selected or pending', () => {
    expect(initialScanState).toMatchObject({ phase: 'result', selectedId: null, full: null, landing: null, topPending: false, focusPending: false });
  });

  describe('photosAdded', () => {
    it('selects the first new photo, opens its corners and owes the top', () => {
      expect(reduceScan(initialScanState, { type: 'photosAdded', firstId: 4 })).toMatchObject({ phase: 'corners', selectedId: 4, topPending: true });
    });
    it('from the corners moves the selection on', () => {
      expect(reduceScan(corners, { type: 'photosAdded', firstId: 7 })).toMatchObject({ phase: 'corners', selectedId: 7, topPending: true });
    });
    it('is a no-op when everything already holds', () => {
      const s = { ...corners, selectedId: 7, topPending: true };
      expect(reduceScan(s, { type: 'photosAdded', firstId: 7 })).toBe(s);
    });
  });

  describe('pageSelected', () => {
    it('selects the page in either phase and keeps the phase', () => {
      expect(reduceScan(initialScanState, { type: 'pageSelected', id: 2 })).toMatchObject({ phase: 'result', selectedId: 2 });
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
      expect(reduceScan(initialScanState, { type: 'resultShown' })).toBe(initialScanState);
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
    it('another page leaving only forgets its failure', () => {
      const s: ScanState = { ...corners, failedIds: [9] };
      const next = reduceScan(s, { type: 'pageRemoved', id: 9, neighbourId: 2, nextNewId: 8 });
      expect(next).toEqual({ ...s, failedIds: [] });
    });
    it('another page leaving with nothing failed is a no-op', () => {
      expect(reduceScan(corners, { type: 'pageRemoved', id: 9, neighbourId: 2, nextNewId: null })).toBe(corners);
    });
    it('the photo under review hands over to the next new one and owes the top', () => {
      expect(reduceScan(corners, { type: 'pageRemoved', id: 1, neighbourId: 2, nextNewId: 3 })).toMatchObject({ phase: 'corners', selectedId: 3, topPending: true });
    });
    it('with no new photo left, the corners give way to the result on the neighbour', () => {
      expect(reduceScan(corners, { type: 'pageRemoved', id: 1, neighbourId: 2, nextNewId: null })).toMatchObject({ phase: 'result', selectedId: 2, topPending: false });
    });
    it('from the result it selects the neighbour, or nothing, and stays on the result', () => {
      const s: ScanState = { ...initialScanState, selectedId: 1 };
      expect(reduceScan(s, { type: 'pageRemoved', id: 1, neighbourId: 2, nextNewId: null })).toMatchObject({ phase: 'result', selectedId: 2 });
      expect(reduceScan(s, { type: 'pageRemoved', id: 1, neighbourId: null, nextNewId: null })).toMatchObject({ phase: 'result', selectedId: null });
    });
  });

  describe('cleared', () => {
    it('empties the selection, the failures and the corners, keeping the rest', () => {
      const busy: ScanState = { ...corners, failedIds: [1], finding: 1, findMissed: [1], full: 'layer', topPending: true };
      expect(reduceScan(busy, { type: 'cleared' })).toEqual({ ...busy, phase: 'result', selectedId: null, failedIds: [] });
    });
    it('is a no-op when already empty', () => {
      expect(reduceScan(initialScanState, { type: 'cleared' })).toBe(initialScanState);
    });
  });

  describe('full screen', () => {
    it('the browser entering it is native; leaving it clears native only', () => {
      const native = reduceScan(corners, { type: 'fullscreenChanged', native: true });
      expect(native.full).toBe('native');
      expect(reduceScan(native, { type: 'fullscreenChanged', native: false }).full).toBeNull();
    });
    it('the browser leaving full screen keeps the layer, and a change with nothing in it is a no-op', () => {
      const layer = reduceScan(corners, { type: 'fullLayerEntered' });
      expect(layer.full).toBe('layer');
      expect(reduceScan(layer, { type: 'fullscreenChanged', native: false })).toBe(layer);
      expect(reduceScan(corners, { type: 'fullscreenChanged', native: false })).toBe(corners);
    });
    it('the layer replaces native, and entering it twice is a no-op', () => {
      const native = reduceScan(corners, { type: 'fullscreenChanged', native: true });
      const layer = reduceScan(native, { type: 'fullLayerEntered' });
      expect(layer.full).toBe('layer');
      expect(reduceScan(layer, { type: 'fullLayerEntered' })).toBe(layer);
    });
    it('exits from either mode and is a no-op when not in it', () => {
      const layer = reduceScan(corners, { type: 'fullLayerEntered' });
      expect(reduceScan(layer, { type: 'fullExited' }).full).toBeNull();
      expect(reduceScan(corners, { type: 'fullExited' })).toBe(corners);
    });
  });

  describe('result after full screen', () => {
    const waiting: ScanState = { ...corners, full: 'native', landing };
    it('queues the landing without leaving the corners', () => {
      expect(reduceScan({ ...corners, full: 'native' }, { type: 'resultAfterFullQueued', landing })).toEqual(waiting);
    });
    it('queuing the same landing again is a no-op', () => {
      expect(reduceScan(waiting, { type: 'resultAfterFullQueued', landing })).toBe(waiting);
    });
    it('shows the result once the card is back, consuming the landing', () => {
      const back = reduceScan(waiting, { type: 'fullscreenChanged', native: false });
      expect(back.full).toBeNull();
      expect(reduceScan(back, { type: 'resultAfterFullShown' })).toMatchObject({ phase: 'result', landing: null });
    });
    it('does nothing while still full screen or with no landing waiting', () => {
      expect(reduceScan(waiting, { type: 'resultAfterFullShown' })).toBe(waiting);
      expect(reduceScan(corners, { type: 'resultAfterFullShown' })).toBe(corners);
    });
  });
});
