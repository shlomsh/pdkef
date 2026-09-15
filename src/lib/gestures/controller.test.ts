import { describe, expect, it, vi } from 'vitest';
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
});
