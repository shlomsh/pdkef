import { afterEach, describe, expect, it, vi } from 'vitest';
import { startGesture } from './controller.ts';

describe('startGesture', () => {
  it('writes every move but commits the last patch once on release', () => {
    const computePatch = vi.fn((event) => (event as MouseEvent).clientX);
    const writeDOM = vi.fn();
    const commit = vi.fn();

    startGesture({ computePatch, writeDOM, commit, target: window });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 24 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(writeDOM).toHaveBeenNthCalledWith(1, 12);
    expect(writeDOM).toHaveBeenNthCalledWith(2, 24);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(24);
  });

  it('removes listeners once the gesture finishes', () => {
    const writeDOM = vi.fn();
    const commit = vi.fn();
    startGesture({
      computePatch: () => 'patch',
      writeDOM,
      commit,
      target: window,
    });

    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove'));

    expect(writeDOM).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(undefined);
  });

  it('abandons an interrupted gesture without committing a stale patch', () => {
    const writeDOM = vi.fn();
    const commit = vi.fn();
    const cancel = vi.fn();
    startGesture({
      computePatch: (event) => (event as MouseEvent).clientX,
      writeDOM,
      commit,
      cancel,
      target: window,
    });

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12 }));
    window.dispatchEvent(new Event('touchcancel'));
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 24 }));

    expect(writeDOM).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  describe('interruptions', () => {
    // Start a drag that has painted one patch, then run `interrupt` and release.
    function interruptedDrag(interrupt: () => void) {
      const writeDOM = vi.fn();
      const commit = vi.fn();
      const cancel = vi.fn();
      startGesture({
        computePatch: (event) => (event as MouseEvent).clientX,
        writeDOM,
        commit,
        cancel,
        target: window,
      });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12 }));
      interrupt();
      window.dispatchEvent(new MouseEvent('mouseup'));
      return { writeDOM, commit, cancel };
    }

    function touchMoveWith(touches: number) {
      const event = new Event('touchmove');
      Object.defineProperty(event, 'touches', { value: new Array(touches).fill({}) });
      window.dispatchEvent(event);
    }

    function setVisibility(state: 'hidden' | 'visible') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
    }

    afterEach(() => {
      delete (document as { visibilityState?: unknown }).visibilityState;
    });

    it('cancels without committing when a second finger lands mid-drag (MOBI-31)', () => {
      const { writeDOM, commit, cancel } = interruptedDrag(() => touchMoveWith(2));

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(commit).not.toHaveBeenCalled();
      expect(writeDOM).toHaveBeenCalledTimes(1);
    });

    it('keeps a one-finger touch drag going', () => {
      const writeDOM = vi.fn();
      const commit = vi.fn();
      const cancel = vi.fn();
      startGesture({ computePatch: () => 'patch', writeDOM, commit, cancel, target: window });

      touchMoveWith(1);
      window.dispatchEvent(new Event('touchend'));

      expect(writeDOM).toHaveBeenCalledWith('patch');
      expect(cancel).not.toHaveBeenCalled();
      expect(commit).toHaveBeenCalledWith('patch');
    });

    it('cancels without committing when the window loses focus', () => {
      const { commit, cancel } = interruptedDrag(() => window.dispatchEvent(new Event('blur')));

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(commit).not.toHaveBeenCalled();
    });

    it('cancels without committing when the tab becomes hidden', () => {
      const { commit, cancel } = interruptedDrag(() => {
        setVisibility('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(cancel).toHaveBeenCalledTimes(1);
      expect(commit).not.toHaveBeenCalled();
    });

    it('ignores a visibilitychange that leaves the tab visible', () => {
      const { commit, cancel } = interruptedDrag(() => {
        setVisibility('visible');
        document.dispatchEvent(new Event('visibilitychange'));
      });

      expect(cancel).not.toHaveBeenCalled();
      expect(commit).toHaveBeenCalledWith(12);
    });
  });
});
