// @ts-nocheck - matches the rest of the shell/lib hook tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { useNavigatingAway } from './useNavigatingAway.ts';

// A control that disables itself on the way out, which is what every caller of
// this hook is: the home page's recent tiles and picker, and the "Compress it"
// / "Sign it" hand-offs in Merge, Split and Redact.
function Leaving({ onLeave = () => {} }) {
  const [navigatingAway, setNavigatingAway] = useNavigatingAway();
  return <button
    type="button"
    disabled={navigatingAway}
    onClick={() => { setNavigatingAway(true); onLeave(); }}
  >{navigatingAway ? 'leaving' : 'go'}</button>;
}

describe('useNavigatingAway', () => {
  let container = null;

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Leaving {...props} />, container));
    return container.querySelector('button');
  }

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  it('stays set for as long as the page is on its way out', () => {
    const button = mount();
    act(() => button.click());
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('leaving');
  });

  // The bug: a back-navigation restores the page the browser froze on the way
  // out (bfcache), flag and all, so the control that set it came back disabled
  // for good. On the home page that was every recent tile plus the picker,
  // stuck on "Opening..." (reported 2026-09-22 on iOS).
  it('clears itself when the page is shown again, so the control works a second time', () => {
    const onLeave = vi.fn();
    const button = mount({ onLeave });
    act(() => button.click());
    expect(onLeave).toHaveBeenCalledTimes(1);

    act(() => { window.dispatchEvent(new Event('pageshow')); });

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('go');
    act(() => button.click());
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it('stops listening once its owner unmounts', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    mount();
    act(() => render(null, container));
    expect(removeListener.mock.calls.some(([type]) => type === 'pageshow')).toBe(true);
    removeListener.mockRestore();
  });
});
