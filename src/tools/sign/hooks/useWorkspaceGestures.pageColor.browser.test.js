import { afterEach, describe, expect, it, vi } from 'vitest';
import useWorkspaceGestures from './useWorkspaceGestures.js';

/** A real overlay, 1000 by 1000 css pixels at the window's origin, so a client point is its own percent times ten. */
function mountOverlay() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 1000px';
  document.body.append(overlay);
  return overlay;
}

/** A page surface with a real canvas: `fills` are [colour, x, y, width, height] in canvas pixels. */
function mountPage(pageIndex, fills) {
  const surface = document.createElement('div');
  surface.setAttribute('data-sign-page-surface', String(pageIndex));
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const context = canvas.getContext('2d');
  for (const [color, ...rect] of fills) {
    context.fillStyle = color;
    context.fillRect(...rect);
  }
  surface.append(canvas);
  document.body.append(surface);
}

function pressAt(clientX, clientY, overlay) {
  return {
    clientX, clientY, currentTarget: overlay, target: overlay, touches: null,
    stopPropagation: () => {}, preventDefault: () => {},
  };
}

describe('useWorkspaceGestures – whiteout takes the page colour', () => {
  afterEach(() => {
    window.dispatchEvent(new Event('blur'));
    document.body.innerHTML = '';
  });

  it('commits colorMode auto with the colour around the final box on that page, and never carries it', () => {
    mountPage(0, [['#0000ff', 0, 0, 200, 200]]);
    // Page 1 is red, with a cream band just outside the box drawn below and black inside it.
    mountPage(1, [['#ff0000', 0, 0, 200, 200], ['#f4ecd8', 16, 16, 48, 68], ['#000000', 20, 20, 40, 60]]);
    const overlay = mountOverlay();
    const dispatch = vi.fn();
    const logAction = vi.fn();
    const hook = useWorkspaceGestures({
      selectedTool: 'whiteout', dispatch, activeSignature: null, setTempPlacement: vi.fn(), setDialogOpen: vi.fn(),
      placeSignatureAt: vi.fn(), logAction, setAnnouncement: vi.fn(), carried: {},
    });
    hook.handleOverlayPointerDown(pressAt(100, 100, overlay), 1);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 400 }));
    window.dispatchEvent(new MouseEvent('mouseup'));

    const actions = dispatch.mock.calls.map(([action]) => action);
    expect(actions.find((a) => a.type === 'UPDATE_ELEMENT').payload.changes)
      .toMatchObject({ left: 10, top: 10, width: 20, height: 30, color: '#f4ecd8', colorMode: 'auto' });
    // the history snapshot agrees with the committed element
    expect(logAction.mock.calls.at(-1)[4][0].element).toMatchObject({ color: '#f4ecd8', colorMode: 'auto' });
    expect(actions.some((a) => a.type === 'SET_CARRIED' || a.type === 'SET_APP_STYLE')).toBe(false);
  });
});
