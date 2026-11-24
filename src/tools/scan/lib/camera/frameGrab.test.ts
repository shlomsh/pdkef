// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameGrabber, grabFocusPatch, grabGray } from './frameGrab.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const unloadedVideo = () => document.createElement('video');

describe('a video with no size yet', () => {
  it('grabGray returns null and leaves the canvas as it was', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const canvas = document.createElement('canvas');
    expect(grabGray(unloadedVideo(), canvas)).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
  });

  it('grabFocusPatch returns null and leaves the canvas as it was', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const canvas = document.createElement('canvas');
    expect(grabFocusPatch(unloadedVideo(), canvas)).toBeNull();
    expect(getContext).not.toHaveBeenCalled();
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(150);
  });

  it('frameGrabber gives nothing', () => {
    expect(frameGrabber()(unloadedVideo(), 5)).toBeNull();
  });
});
