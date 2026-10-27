/**
 * revealFieldAfterKeyboard - the tap path's reveal (useFieldNavigation.ts).
 *
 * jsdom, because the reveal is nothing but `visualViewport` events, a rect and
 * `window.scrollTo`. Numbers are the ones measured on an iPhone 17 simulator
 * (form 101 restored from a draft at scroll 0): a 714px-tall visible slice
 * before the keyboard, 377px once it is up, and a tapped box at a rect top of
 * 586 - on screen when tapped, under the keyboard once it opens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealFieldAfterKeyboard } from './useFieldNavigation.ts';

const BOX_HEIGHT = 8.3;

type FakeViewport = EventTarget & { scale: number; width: number; height: number; offsetLeft: number; offsetTop: number; pageLeft: number; pageTop: number };

function installViewport(props: Partial<FakeViewport>): FakeViewport {
  const vv = Object.assign(new EventTarget(), {
    scale: 1, width: 402, height: 714, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, ...props,
  }) as FakeViewport;
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
  return vv;
}

function setScrollY(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
}

/** A box whose textarea holds the focus, as the tap leaves it. */
function boxAt(top: number, id = 'el-1') {
  const node = document.createElement('div');
  node.setAttribute('data-editor-element-id', id);
  const input = document.createElement('textarea');
  node.appendChild(input);
  node.getBoundingClientRect = () => ({
    top, bottom: top + BOX_HEIGHT, left: 100, right: 180, width: 80, height: BOX_HEIGHT, x: 100, y: top, toJSON: () => ({}),
  });
  document.body.appendChild(node);
  input.focus();
  return node;
}

/** The keyboard opening: the visible slice shrinks and `resize` fires. */
function raiseKeyboard(vv: FakeViewport, height = 377) {
  vv.height = height;
  vv.dispatchEvent(new Event('resize'));
}

describe('revealFieldAfterKeyboard', () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    setScrollY(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true, writable: true });
    setScrollY(0);
  });

  it('waits for the keyboard, then lifts a box it covered back into the visible slice', () => {
    const vv = installViewport({});
    boxAt(586);
    revealFieldAfterKeyboard('el-1');
    expect(scrollTo, 'nothing moves before the keyboard is up: the box is still on screen').not.toHaveBeenCalled();

    raiseKeyboard(vv);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const { top } = scrollTo.mock.calls[0][0] as { top: number };
    const landed = 586 - top;
    expect(landed).toBeGreaterThanOrEqual(0);
    expect(landed + BOX_HEIGHT).toBeLessThanOrEqual(377);
  });

  it('leaves a box the keyboard did not cover exactly where it is', () => {
    const vv = installViewport({});
    boxAt(200);
    revealFieldAfterKeyboard('el-1');
    raiseKeyboard(vv);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('measures the slice from pageTop, not the offsetTop iOS misreports with the keyboard up', () => {
    // Measured: page at 401, keyboard up, offsetTop 337 (the keyboard's
    // height), pageTop 401, and the box on screen at 185. An offsetTop band
    // (337-714) would call it hidden and throw the page 340px further down.
    setScrollY(401);
    const vv = installViewport({ height: 377, offsetTop: 337, pageTop: 401 });
    boxAt(185);
    revealFieldAfterKeyboard('el-1');
    raiseKeyboard(vv);
    vi.runAllTimers();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing if the edit session closed before the keyboard settled', () => {
    const vv = installViewport({});
    boxAt(586);
    revealFieldAfterKeyboard('el-1');
    (document.activeElement as HTMLElement).blur();
    raiseKeyboard(vv);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('keeps one reveal pending: a second tap supersedes the first', () => {
    const vv = installViewport({});
    boxAt(586, 'el-1');
    revealFieldAfterKeyboard('el-1');
    boxAt(600, 'el-2');
    revealFieldAfterKeyboard('el-2');
    raiseKeyboard(vv);
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    const { top } = scrollTo.mock.calls[0][0] as { top: number };
    const landed = 600 - top;
    expect(landed + BOX_HEIGHT, 'the move was measured for the second box').toBeLessThanOrEqual(377);
  });

  it('still reveals when the keyboard was already up and no resize comes, and only once', () => {
    const vv = installViewport({ height: 377 });
    boxAt(586);
    revealFieldAfterKeyboard('el-1');
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    raiseKeyboard(vv, 300);
    expect(scrollTo, 'the resize listener went with the first reveal').toHaveBeenCalledTimes(1);
  });
});
