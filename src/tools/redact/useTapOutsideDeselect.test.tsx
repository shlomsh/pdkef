import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTapOutsideDeselect } from './useTapOutsideDeselect.ts';

// Unit tests for the hook's own wiring (armed check, excluded-target check,
// touch tracking across start/end/cancel). The tap classification itself
// (slop, duration, multi-touch) is tapOutsideDeselect.ts's own test file.
describe('useTapOutsideDeselect', () => {
  let container = document.createElement('div');
  const EXCLUDED_SELECTOR = '.redact-box';

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function mount({ onDeselect, isArmed }: { onDeselect: () => void; isArmed: () => boolean }) {
    document.body.appendChild(container);
    function Host() {
      const handlers = useTapOutsideDeselect({ onDeselect, isArmed, excludedSelector: EXCLUDED_SELECTOR });
      return (
        <div class="blank" {...handlers}>
          <div class="redact-box">box</div>
        </div>
      );
    }
    act(() => render(<Host />, container));
    return {
      blank: container.querySelector<HTMLDivElement>('.blank')!,
      box: container.querySelector<HTMLDivElement>('.redact-box')!,
    };
  }

  function touchPoint(clientX: number, clientY: number, identifier = 1): Touch {
    // jsdom's TouchEvent does not validate/coerce Touch objects; a plain
    // point literal carrying only the fields this module reads is enough.
    return { clientX, clientY, identifier } as Touch;
  }

  function touchStart(target: Element, touches: Touch[]) {
    act(() => {
      target.dispatchEvent(
        new TouchEvent('touchstart', { touches, changedTouches: touches, bubbles: true, cancelable: true }),
      );
    });
  }

  function touchEnd(
    target: Element,
    remainingTouches: Touch[],
    endedTouch: Touch,
    { defaultPrevented = false }: { defaultPrevented?: boolean } = {},
  ) {
    act(() => {
      const event = new TouchEvent('touchend', {
        touches: remainingTouches,
        changedTouches: [endedTouch],
        bubbles: true,
        cancelable: true,
      });
      if (defaultPrevented) event.preventDefault();
      target.dispatchEvent(event);
    });
  }

  function touchCancel(target: Element) {
    act(() => {
      target.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: true }));
    });
  }

  it('deselects on click on blank area, not on click inside the excluded selector', () => {
    const onDeselect = vi.fn();
    const { blank, box } = mount({ onDeselect, isArmed: () => false });

    act(() => { box.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onDeselect).not.toHaveBeenCalled();

    act(() => { blank.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('does not deselect on click while a tool is armed', () => {
    const onDeselect = vi.fn();
    const { blank } = mount({ onDeselect, isArmed: () => true });

    act(() => { blank.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('deselects on a stationary touch tap on blank area', () => {
    const onDeselect = vi.fn();
    const { blank } = mount({ onDeselect, isArmed: () => false });
    const point = touchPoint(50, 60);

    touchStart(blank, [point]);
    touchEnd(blank, [], point);

    expect(onDeselect).toHaveBeenCalledTimes(1);
  });

  it('does not deselect when the touch moved 100px away (a pan)', () => {
    const onDeselect = vi.fn();
    const { blank } = mount({ onDeselect, isArmed: () => false });

    touchStart(blank, [touchPoint(50, 60)]);
    touchEnd(blank, [], touchPoint(150, 60));

    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('does not deselect when a second finger joins the sequence', () => {
    const onDeselect = vi.fn();
    const { blank } = mount({ onDeselect, isArmed: () => false });
    const point = touchPoint(50, 60, 1);

    touchStart(blank, [point]);
    touchStart(blank, [point, touchPoint(80, 90, 2)]);
    touchEnd(blank, [], point);

    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('does not deselect when the touchend already had preventDefault() called', () => {
    const onDeselect = vi.fn();
    const { blank } = mount({ onDeselect, isArmed: () => false });
    const point = touchPoint(50, 60);

    touchStart(blank, [point]);
    touchEnd(blank, [], point, { defaultPrevented: true });

    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('does not deselect when a touchcancel lands between start and end', () => {
    const onDeselect = vi.fn();
    const { blank } = mount({ onDeselect, isArmed: () => false });
    const point = touchPoint(50, 60);

    touchStart(blank, [point]);
    touchCancel(blank);
    touchEnd(blank, [], point);

    expect(onDeselect).not.toHaveBeenCalled();
  });

  it('does not deselect on a touch tap that lands on an excluded target', () => {
    const onDeselect = vi.fn();
    const { box } = mount({ onDeselect, isArmed: () => false });
    const point = touchPoint(50, 60);

    touchStart(box, [point]);
    touchEnd(box, [], point);

    expect(onDeselect).not.toHaveBeenCalled();
  });
});
