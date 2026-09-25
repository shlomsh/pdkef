import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import useFillTap, {
  type FillMouseEvent,
  type FillPointerEvent,
  type FillTouchEvent,
  type FillTapHandlers,
  type UseFillTapOptions,
} from './useFillTap.ts';
import { FillContext, FILL_OFF, type FillContextValue } from './FillContext.tsx';
import { FILL_INPUT_ATTR, FILL_KEY_ATTR } from './fillTypes.ts';
import type { ReachTarget } from './fillTypes.ts';

// jsdom has no Touch or PointerEvent constructors (same reasoning as
// tapOutsideDeselect.ts's own tests), so every event here is a plain object
// carrying only the fields useFillTap.ts actually reads, cast past TS.
function mouseEvent(overlay: HTMLElement, target: Element, clientX: number, clientY: number): FillMouseEvent {
  return {
    currentTarget: overlay,
    target,
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as FillMouseEvent;
}

function pointerEvent(
  overlay: HTMLElement,
  target: Element,
  clientX: number,
  clientY: number,
  pointerType: string,
  buttons: number,
): FillPointerEvent {
  return {
    currentTarget: overlay,
    target,
    clientX,
    clientY,
    pointerType,
    buttons,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as FillPointerEvent;
}

function fakeTouch(identifier: number, clientX: number, clientY: number): Touch {
  return { identifier, clientX, clientY } as unknown as Touch;
}

function touchEvent(overlay: HTMLElement, target: Element, touches: Touch[], changedTouches: Touch[]): FillTouchEvent {
  return {
    currentTarget: overlay,
    target,
    touches,
    changedTouches,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as FillTouchEvent;
}

/** A page overlay with a realistic, stubbed rect: 1000x1000 at the viewport origin, so
 * a client point's page-percent is simply clientX/10, clientY/10 (editor.md's geometry
 * rule: jsdom's default 0x0 rect would turn every point into NaN or Infinity). */
function makeOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.getBoundingClientRect = () => (
    { left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  );
  document.body.appendChild(overlay);
  return overlay;
}

function makeProxy(): HTMLInputElement {
  const input = document.createElement('input');
  document.body.appendChild(input);
  return input;
}

function appendFillInput(parent: HTMLElement, key: string): HTMLInputElement {
  const input = document.createElement('input');
  input.setAttribute(FILL_INPUT_ATTR, '');
  input.setAttribute(FILL_KEY_ATTR, key);
  parent.appendChild(input);
  return input;
}

/** A reach target whose default box straddles page-percent (50, 50) - the point a
 * client tap at (500, 500) lands on with makeOverlay()'s rect - so most tests need no
 * reach-tolerance arithmetic of their own. */
function target(kind: ReachTarget['kind'], key: string, box = { left: 45, top: 45, width: 10, height: 10 }): ReachTarget {
  return { kind, key, pageIndex: 0, box };
}

// Same tiny-harness pattern as useFillFocus.test.tsx: a component that calls the hook
// and stashes its result on an outer ref, rendered once inside the FillContext this
// hook reads (setAimedKey/openFreeSlot/proxyRef) via useFill().
function TapHarness({ options, apiRef }: { options: UseFillTapOptions; apiRef: { current: FillTapHandlers | null } }) {
  apiRef.current = useFillTap(options);
  return null;
}

function mount(options: UseFillTapOptions, value: FillContextValue): FillTapHandlers {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const apiRef: { current: FillTapHandlers | null } = { current: null };
  act(() => {
    render(
      <FillContext.Provider value={value}>
        <TapHarness options={options} apiRef={apiRef} />
      </FillContext.Provider>,
      host,
    );
  });
  if (!apiRef.current) throw new Error('useFillTap did not run');
  return apiRef.current;
}

/** Wires a fresh overlay, spies and handlers for one test; `overrides` replaces only
 * the UseFillTapOptions fields that test cares about (defaults: Text armed, nothing in
 * reach, not engaged, no page geometry - see fillTypes.ts and docs/sign-fill-mode.md). */
function setup(overrides: Partial<UseFillTapOptions> = {}) {
  const overlay = makeOverlay();
  const setAimedKey = vi.fn();
  const openFreeSlot = vi.fn();
  const delegate = vi.fn();
  const dismiss = vi.fn();
  const proxyInput = makeProxy();
  const options: UseFillTapOptions = {
    tool: 'text',
    targetsOf: () => [],
    pageGeometryOf: () => undefined,
    engaged: () => false,
    delegate,
    dismiss,
    ...overrides,
  };
  const handlers = mount(options, { ...FILL_OFF, enabled: true, setAimedKey, openFreeSlot, proxyRef: { current: proxyInput } });
  return { handlers, overlay, setAimedKey, openFreeSlot, delegate, dismiss, proxyInput };
}

describe('useFillTap', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a free slot at the tap point when Text is armed, nothing is in reach and nothing is engaged', () => {
    const { handlers, overlay, openFreeSlot, delegate, proxyInput } = setup();

    const event = mouseEvent(overlay, overlay, 300, 400);
    handlers.onClickCapture(event, 0);

    expect(openFreeSlot).toHaveBeenCalledWith({ pageIndex: 0, x: 30, y: 40 });
    expect(document.activeElement).toBe(proxyInput);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(delegate).not.toHaveBeenCalled();
  });

  it('focuses a fill target within reach when Text is armed', () => {
    const { handlers, overlay, delegate } = setup({ targetsOf: () => [target('fill', 'slot:a')] });
    const fillInput = appendFillInput(overlay, 'slot:a');

    const event = mouseEvent(overlay, overlay, 500, 500);
    handlers.onClickCapture(event, 0);

    expect(document.activeElement).toBe(fillInput);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(delegate).not.toHaveBeenCalled();
  });

  it('dismisses a typing session engaged at mousedown, even though the click lands on blank area', () => {
    const { handlers, overlay, dismiss, openFreeSlot } = setup({ engaged: () => true });

    handlers.onMouseDown();
    handlers.onClickCapture(mouseEvent(overlay, overlay, 300, 400), 0);

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(openFreeSlot).not.toHaveBeenCalled();
  });

  it('does nothing when the click target is itself a fill input: native focus takes over', () => {
    const { handlers, overlay, delegate, dismiss } = setup();
    const fillInput = appendFillInput(overlay, 'slot:a');

    const event = mouseEvent(overlay, fillInput, 500, 500);
    handlers.onClickCapture(event, 0);

    expect(delegate).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('delegates a click inside an existing element to production, with no corrected point', () => {
    const { handlers, overlay, delegate } = setup();
    const element = document.createElement('div');
    element.setAttribute('data-editor-element', '');
    overlay.appendChild(element);

    const event = mouseEvent(overlay, element, 500, 500);
    handlers.onClickCapture(event, 0);

    expect(delegate).toHaveBeenCalledWith(event, 0);
  });

  it('delegates to the box centre when Mark is armed and a tick box is in reach', () => {
    const { handlers, overlay, delegate } = setup({ tool: 'mark', targetsOf: () => [target('box', 'box:1')] });

    const event = mouseEvent(overlay, overlay, 500, 500);
    handlers.onClickCapture(event, 0);

    expect(delegate).toHaveBeenCalledWith(event, 0, { pageIndex: 0, x: 50, y: 50 });
  });

  it('acts on a touch tap that starts and ends at the same point inside the tap window', () => {
    const { handlers, overlay, openFreeSlot } = setup();

    const touch = fakeTouch(1, 300, 400);
    handlers.onTouchStart(touchEvent(overlay, overlay, [touch], [touch]), 0);
    const endEvent = touchEvent(overlay, overlay, [], [fakeTouch(1, 300, 400)]);
    handlers.onTouchEnd(endEvent, 0);

    expect(openFreeSlot).toHaveBeenCalledWith({ pageIndex: 0, x: 30, y: 40 });
    expect(endEvent.preventDefault).toHaveBeenCalled();
  });

  it('does not act on a touch that moved past the tap slop: a scroll or drag is not a tap', () => {
    const { handlers, overlay, openFreeSlot, delegate } = setup();

    handlers.onTouchStart(touchEvent(overlay, overlay, [fakeTouch(1, 300, 400)], [fakeTouch(1, 300, 400)]), 0);
    const endEvent = touchEvent(overlay, overlay, [], [fakeTouch(1, 400, 400)]);
    handlers.onTouchEnd(endEvent, 0);

    expect(openFreeSlot).not.toHaveBeenCalled();
    expect(delegate).not.toHaveBeenCalled();
    expect(endEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('takes no action on end once a second touch has joined', () => {
    const { handlers, overlay, openFreeSlot } = setup();

    const first = fakeTouch(1, 300, 400);
    handlers.onTouchStart(touchEvent(overlay, overlay, [first], [first]), 0);
    const second = fakeTouch(2, 500, 500);
    handlers.onTouchStart(touchEvent(overlay, overlay, [first, second], [second]), 0);
    const endEvent = touchEvent(overlay, overlay, [], [fakeTouch(1, 300, 400)]);
    handlers.onTouchEnd(endEvent, 0);

    expect(openFreeSlot).not.toHaveBeenCalled();
    expect(endEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('aims a touch near a target on touchstart, and clears the aim on touchend', () => {
    const { handlers, overlay, setAimedKey } = setup({
      targetsOf: () => [target('fill', 'slot:z', { left: 25, top: 35, width: 10, height: 10 })],
    });

    const touch = fakeTouch(1, 300, 400);
    handlers.onTouchStart(touchEvent(overlay, overlay, [touch], [touch]), 0);
    expect(setAimedKey).toHaveBeenCalledWith('slot:z');

    handlers.onTouchEnd(touchEvent(overlay, overlay, [], [fakeTouch(1, 300, 400)]), 0);
    expect(setAimedKey).toHaveBeenLastCalledWith(null);
  });

  it('aims a hovering mouse near a target, ignores a touch pointer, and clears on leave', () => {
    const { handlers, overlay, setAimedKey } = setup({ targetsOf: () => [target('fill', 'slot:z')] });

    handlers.onPointerMove(pointerEvent(overlay, overlay, 500, 500, 'mouse', 0), 0);
    expect(setAimedKey).toHaveBeenCalledWith('slot:z');

    setAimedKey.mockClear();
    handlers.onPointerMove(pointerEvent(overlay, overlay, 500, 500, 'touch', 0), 0);
    expect(setAimedKey).not.toHaveBeenCalled();

    handlers.onPointerLeave();
    expect(setAimedKey).toHaveBeenCalledWith(null);
  });
});
