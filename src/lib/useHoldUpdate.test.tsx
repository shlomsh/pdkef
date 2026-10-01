// @ts-nocheck - matches the rest of the lib hook tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { isUpdateHeld } from './appUpdate/updateHolds.ts';
import { useHoldUpdate } from './useHoldUpdate.ts';

function Probe({ active }) {
  useHoldUpdate(active);
  return null;
}

describe('useHoldUpdate', () => {
  let container = null;

  function show(active) {
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
    }
    act(() => render(<Probe active={active} />, container));
  }

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('holds while active is true', () => {
    show(true);
    expect(isUpdateHeld()).toBe(true);
  });

  it('does not hold while active is false', () => {
    show(false);
    expect(isUpdateHeld()).toBe(false);
  });

  it('releases when active toggles to false', () => {
    show(true);
    show(false);
    expect(isUpdateHeld()).toBe(false);
  });

  it('releases on unmount', () => {
    show(true);
    act(() => render(null, container));
    expect(isUpdateHeld()).toBe(false);
  });
});
