import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Guards the per-element toolbar popover positioning (font list + color palette),
// which regressed twice: the menu ended up `position: absolute`, so the
// viewport coordinates Floating UI computes got resolved against the tiny
// `.sign-tool-dropdown-container` offset parent and the menu was flung to the
// top-left corner instead of anchoring under its trigger. useDropdownMenu now
// owns positioning entirely — these tests fail if that ownership is ever handed
// back to CSS (or if the fixed-before-measure ordering is reintroduced wrong).
//
// @floating-ui/dom is mocked because jsdom has no layout engine, so the real
// computePosition can't produce meaningful coordinates. The mock also lets us
// inspect the floating element's state at the exact moment it's measured.
const { computePosition, autoUpdate } = vi.hoisted(() => ({
  computePosition: vi.fn(),
  autoUpdate: vi.fn()
}));

vi.mock('@floating-ui/dom', () => ({
  computePosition,
  autoUpdate,
  offset: () => ({ name: 'offset' }),
  flip: () => ({ name: 'flip' }),
  shift: () => ({ name: 'shift' })
}));

// Imported after the mock so they pick up the mocked module.
import FontPickerMenu from '../components/FontPickerMenu.jsx';
import ColorPickerMenu from '../components/ColorPickerMenu.jsx';

describe('useDropdownMenu popover positioning', () => {
  let container;
  // Captures the floating element's inline `position` at the instant Floating UI
  // measures it — the offsetParent it reads depends on this being `fixed`.
  let positionAtMeasure;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    positionAtMeasure = undefined;
    computePosition.mockImplementation((reference, floating) => {
      positionAtMeasure = floating.style.position;
      return Promise.resolve({ x: 120, y: 340 });
    });
    // Mirror the real autoUpdate: run the update once immediately, return teardown.
    autoUpdate.mockImplementation((reference, floating, update) => {
      update();
      return () => {};
    });
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    vi.clearAllMocks();
  });

  async function mountAndOpen(vnode, triggerSelector) {
    act(() => render(vnode, container));
    const trigger = container.querySelector(triggerSelector);
    await act(async () => {
      trigger.click();
    });
    return trigger;
  }

  it('opens the font menu as position:fixed, not absolute (no CSS override needed)', async () => {
    await mountAndOpen(
      <FontPickerMenu value="Arimo" onChange={() => {}} />,
      '.sign-font-trigger'
    );

    const menu = container.querySelector('.sign-font-menu');
    expect(menu).toBeTruthy();
    // The core regression: the menu must be fixed-positioned by the hook itself,
    // inline, so no CSS specificity/order trivia can leave it `absolute`.
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.transform).toBe('none');
    expect(menu.style.margin).toBe('0px');
  });

  it('sets position:fixed BEFORE Floating UI measures the menu', async () => {
    await mountAndOpen(
      <FontPickerMenu value="Arimo" onChange={() => {}} />,
      '.sign-font-trigger'
    );

    // If the menu were still `absolute` at measure time, computePosition would
    // read the wrong offset parent and return coords in the wrong frame — the
    // exact top-left-fling bug. Ordering must be fixed-then-measure.
    expect(positionAtMeasure).toBe('fixed');
  });

  it('anchors to the trigger with the fixed strategy', async () => {
    const trigger = await mountAndOpen(
      <FontPickerMenu value="Arimo" onChange={() => {}} />,
      '.sign-font-trigger'
    );

    expect(computePosition).toHaveBeenCalledTimes(1);
    const [reference, , options] = computePosition.mock.calls[0];
    expect(reference).toBe(trigger);
    expect(options.strategy).toBe('fixed');
  });

  it('applies the resolved coordinates and reveals the menu', async () => {
    await mountAndOpen(
      <FontPickerMenu value="Arimo" onChange={() => {}} />,
      '.sign-font-trigger'
    );

    const menu = container.querySelector('.sign-font-menu');
    // Hidden until the first placement lands (no top-left flash), then revealed
    // at the computed coordinates.
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('340px');
    expect(menu.style.visibility).toBe('visible');
  });

  it('registers autoUpdate so the menu tracks scroll/resize', async () => {
    await mountAndOpen(
      <FontPickerMenu value="Arimo" onChange={() => {}} />,
      '.sign-font-trigger'
    );

    expect(autoUpdate).toHaveBeenCalledTimes(1);
  });

  it('applies the same fixed positioning to the color menu (shared hook)', async () => {
    await mountAndOpen(
      <ColorPickerMenu value="#000000" onChange={() => {}} title="Text color" />,
      '.sign-color-trigger'
    );

    const menu = container.querySelector('.sign-color-menu');
    expect(menu).toBeTruthy();
    expect(menu.style.position).toBe('fixed');
    expect(positionAtMeasure).toBe('fixed');
  });
});
