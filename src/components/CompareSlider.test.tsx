// @ts-nocheck
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import CompareSlider from './CompareSlider.tsx';
import styles from './CompareSlider.module.css';

// Real drag math needs a realistic mocked rect, not jsdom's default 0x0 -
// see CLAUDE.md's "Vacuous geometry tests from unmocked 0x0 rects" hazard.
// A 0-width rect saturates the clamp identically at both ends and proves
// nothing about the actual percent math.
const MOCK_RECT = { left: 100, right: 500, width: 400, top: 0, bottom: 0, height: 0, x: 100, y: 0 };

function fireMouse(type, x) {
  window.dispatchEvent(new MouseEvent(type, { clientX: x, bubbles: true, cancelable: true }));
}

describe('CompareSlider', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('renders the before/after images and labels', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <CompareSlider beforeSrc="data:before" afterSrc="data:after" beforeLabel="Original" afterLabel="Compressed" />,
        container,
      );
    });

    const images = container.querySelectorAll(`.${styles['compare-image']}`);
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute('src')).toBe('data:before');
    expect(images[1].getAttribute('src')).toBe('data:after');
    expect(container.textContent).toContain('Compressed');
    expect(container.textContent).toContain('Original');
  });

  it('starts at 50% reveal', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<CompareSlider beforeSrc="data:before" afterSrc="data:after" />, container);
    });

    const slider = container.querySelector(`.${styles['compare-slider']}`);
    expect(slider.style.getPropertyValue('--reveal')).toBe('50%');

    const handle = container.querySelector(`.${styles['compare-handle']}`);
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
  });

  it('mutates the DOM directly during a drag and commits state exactly once on release', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<CompareSlider beforeSrc="data:before" afterSrc="data:after" />, container);
    });

    const slider = container.querySelector(`.${styles['compare-slider']}`);
    const handle = container.querySelector(`.${styles['compare-handle']}`);
    slider.getBoundingClientRect = () => MOCK_RECT;

    // mousedown at the container's left edge (0%) starts the gesture and
    // immediately paints there, without waiting for a move.
    act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true }));
    });
    expect(slider.style.getPropertyValue('--reveal')).toBe('0%');
    // The commit-once rule: aria-valuenow (driven by committed state) has
    // not moved yet mid-gesture.
    expect(handle.getAttribute('aria-valuenow')).toBe('50');

    // Drag to the halfway point (clientX 300 of a 400-wide rect starting at 100).
    act(() => {
      fireMouse('mousemove', 300);
    });
    expect(slider.style.getPropertyValue('--reveal')).toBe('50%');
    expect(handle.getAttribute('aria-valuenow')).toBe('50');

    // Drag further, to 90%.
    act(() => {
      fireMouse('mousemove', 460);
    });
    expect(slider.style.getPropertyValue('--reveal')).toBe('90%');
    expect(handle.getAttribute('aria-valuenow')).toBe('50');

    // Release commits exactly once.
    act(() => {
      fireMouse('mouseup', 460);
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('90');
  });

  it('clamps drag past either edge of the rect to 0-100', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<CompareSlider beforeSrc="data:before" afterSrc="data:after" />, container);
    });

    const slider = container.querySelector(`.${styles['compare-slider']}`);
    const handle = container.querySelector(`.${styles['compare-handle']}`);
    slider.getBoundingClientRect = () => MOCK_RECT;

    act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true, cancelable: true }));
    });
    act(() => {
      fireMouse('mousemove', 5000);
    });
    expect(slider.style.getPropertyValue('--reveal')).toBe('100%');
    act(() => {
      fireMouse('mouseup', 5000);
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('100');
  });

  it('supports keyboard control (arrows, Home, End)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<CompareSlider beforeSrc="data:before" afterSrc="data:after" />, container);
    });

    const handle = container.querySelector(`.${styles['compare-handle']}`);

    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('55');

    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('45');

    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('100');

    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    expect(handle.getAttribute('aria-valuenow')).toBe('0');
  });
});
