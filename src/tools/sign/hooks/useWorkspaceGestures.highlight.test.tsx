/**
 * SIGN-46: the highlight swipe commits once. A synthetic two-line raster stands in for the page
 * canvas (words 20-60 and 90-130 on rows at y 100-114 and 140-154).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import useWorkspaceGestures from './useWorkspaceGestures.ts';

const W = 300;
const H = 400;
const rects: Array<[number, number, number, number]> = [];
for (const y of [100, 140]) for (const x of [20, 90]) rects.push([x, y, 40, 14]);

function getImageData(sx: number, sy: number, w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [x, y, rw, rh] of rects) {
    for (let j = y; j < y + rh; j += 1) {
      for (let i = x; i < x + rw; i += 1) {
        const px = i - sx;
        const py = j - sy;
        if (px >= 0 && px < w && py >= 0 && py < h) data.fill(0, (py * w + px) * 4, (py * w + px) * 4 + 3);
      }
    }
  }
  return { data, width: w, height: h };
}

function makeOverlay(withCanvas = true) {
  const canvas = { width: W, height: H, getContext: () => ({ getImageData }) };
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H }),
    closest: () => null,
    querySelectorAll: () => [],
    parentElement: { querySelector: () => (withCanvas ? canvas : null) },
  } as unknown as HTMLElement;
}

function press(overlay: HTMLElement, x: number, y: number) {
  return {
    clientX: x, clientY: y, currentTarget: overlay,
    target: { closest: () => null }, stopPropagation: vi.fn(), preventDefault: vi.fn(), touches: null,
  } as never;
}

function setup(overlay: HTMLElement) {
  const dispatch = vi.fn();
  const hook = useWorkspaceGestures({
    selectedTool: 'highlight', dispatch, activeSignature: null, setTempPlacement: vi.fn(), setDialogOpen: vi.fn(),
    placeSignatureAt: vi.fn(), logAction: vi.fn(), setAnnouncement: vi.fn(), initialHighlightColor: '#9CF27A',
  });
  hook.handleOverlayPointerDown(press(overlay, 30, 107), 0);
  return dispatch;
}

const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const release = () => window.dispatchEvent(new MouseEvent('mouseup'));
const types = (dispatch: ReturnType<typeof vi.fn>) => dispatch.mock.calls.map(([a]) => a.type);

afterEach(() => release());

describe('highlight swipe', () => {
  it('dispatches nothing during moves and commits one UPDATE_ELEMENT with bands', () => {
    const dispatch = setup(makeOverlay());
    expect(dispatch.mock.calls[0][0].payload).toMatchObject({ type: 'highlight', color: '#9CF27A' });
    const before = dispatch.mock.calls.length;
    move(60, 107);
    move(100, 147);
    move(128, 147);
    expect(dispatch.mock.calls.length).toBe(before);
    release();
    const updates = dispatch.mock.calls.filter(([a]) => a.type === 'UPDATE_ELEMENT');
    expect(updates).toHaveLength(1);
    expect(updates[0][0].payload.changes.bands).toHaveLength(2);
    expect(types(dispatch)).toContain('DISARM_TOOL');
  });

  it('a tap with no movement highlights the word row under the finger', () => {
    const dispatch = setup(makeOverlay());
    release();
    const update = dispatch.mock.calls.find(([a]) => a.type === 'UPDATE_ELEMENT');
    expect(update?.[0].payload.changes.bands).toHaveLength(1);
  });

  it('cancels when the canvas cannot be read', () => {
    const dispatch = setup(makeOverlay(false));
    move(100, 107);
    release();
    expect(types(dispatch)).not.toContain('UPDATE_ELEMENT');
    expect(types(dispatch)).toContain('DELETE_ELEMENT');
  });
});
