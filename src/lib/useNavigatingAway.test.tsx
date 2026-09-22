// @ts-nocheck - matches the rest of the lib hook tests
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { useNavigatingAway } from './useNavigatingAway.ts';

// A control that disables itself on the way out, which is what every caller of
// this hook is: the home page's recent tiles and picker, and the hand-off
// buttons in Merge, Split and Redact.
function Leaving({ onLeave = () => {} }) {
  const [navigatingAway, setNavigatingAway] = useNavigatingAway();
  return <button
    type="button"
    disabled={navigatingAway}
    onClick={() => { setNavigatingAway(true); onLeave(); }}
  >{navigatingAway ? 'leaving' : 'go'}</button>;
}

function pageShow(persisted) {
  const event = new Event('pageshow');
  event.persisted = persisted;
  act(() => { window.dispatchEvent(event); });
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

  it('clears itself on a restore, so the control works a second time', () => {
    const onLeave = vi.fn();
    const button = mount({ onLeave });
    act(() => button.click());
    expect(onLeave).toHaveBeenCalledTimes(1);

    pageShow(true);

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('go');
    act(() => button.click());
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  // An ordinary load fires `pageshow` too, after `load` - which is well after a
  // client:load island is interactive, so it can land while a hand-off is still
  // reading its file. Clearing on that one would re-enable the control under
  // work that is already running.
  it('ignores the pageshow of an ordinary load', () => {
    const button = mount();
    act(() => button.click());

    pageShow(false);

    expect(button.disabled).toBe(true);
  });

  it('removes its own listener when its owner unmounts', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    mount();
    const handler = added.mock.calls.find(([type]) => type === 'pageshow')?.[1];
    expect(handler).toBeTypeOf('function');

    act(() => render(null, container));

    expect(removed).toHaveBeenCalledWith('pageshow', handler);
    added.mockRestore();
    removed.mockRestore();
  });
});
