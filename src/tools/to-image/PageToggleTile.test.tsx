// @ts-nocheck - test file
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageToggleTile from './PageToggleTile.tsx';

describe('PageToggleTile', () => {
  let container;
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onToggle = vi.fn();
    const onPreview = vi.fn();
    act(() => render(
      <PageToggleTile
        thumbnail={null}
        selected
        label="Page 3"
        onToggle={onToggle}
        onPreview={onPreview}
        previewLabel="Preview page 3"
        extra={<a href="#x" aria-label="Download page 3">dl</a>}
        {...props}
      />,
      container,
    ));
    const toggle = container.querySelector('button[aria-pressed]');
    const magnifier = container.querySelector('button[aria-label="Preview page 3"]');
    return { onToggle, onPreview, toggle, magnifier };
  }

  it('is a pressed button named "Page 3" inside a wrapper with no role', () => {
    const { toggle } = mount();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Page 3');
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    expect(toggle.parentElement.getAttribute('role')).toBeNull();
  });

  it('reflects a left-out page in aria-pressed and data-out', () => {
    const { toggle } = mount({ selected: false });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.parentElement.getAttribute('data-out')).toBe('true');
  });

  it('toggles on a press of the toggle button', () => {
    const { toggle, onToggle } = mount();
    act(() => toggle.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('keeps the magnifier and the extra control as siblings of the toggle, not inside it', () => {
    const { toggle, magnifier } = mount();
    expect(toggle.contains(magnifier)).toBe(false);
    expect(toggle.contains(container.querySelector('a'))).toBe(false);
    expect(toggle.parentElement.contains(magnifier)).toBe(true);
  });

  it('opens the preview from the magnifier without toggling, by click and by Enter', () => {
    const { magnifier, onPreview, onToggle } = mount();
    act(() => magnifier.click());
    expect(onPreview).toHaveBeenCalledTimes(1);
    act(() => {
      magnifier.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      magnifier.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does nothing when locked', () => {
    const { toggle } = mount({ locked: true });
    expect(toggle.disabled).toBe(true);
  });
});
