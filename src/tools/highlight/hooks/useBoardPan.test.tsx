import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useRef } from 'preact/hooks';
import { useBoardPan } from './useBoardPan.ts';

let childDown: ReturnType<typeof vi.fn>;

function Board() {
  const ref = useRef<HTMLDivElement>(null);
  useBoardPan({ workspaceRef: ref, fullscreen: false, enabled: true });
  return (
    <div ref={ref}>
      <div data-editor-page-card data-testid="card" ref={(el) => {
        if (el) el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
      }} />
    </div>
  );
}

const press = (el: Element, pointerType = 'mouse') => {
  const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  el.dispatchEvent(e);
};
const space = (type: 'keydown' | 'keyup') =>
  document.dispatchEvent(new KeyboardEvent(type, { code: 'Space', bubbles: true, cancelable: true }));

describe('useBoardPan', () => {
  let card: HTMLElement;
  beforeEach(() => {
    childDown = vi.fn();
    act(() => { render(<Board />, document.body); });
    card = document.querySelector('[data-testid="card"]') as HTMLElement;
    card.addEventListener('pointerdown', childDown);
  });
  afterEach(() => { act(() => { render(null, document.body); }); });

  it('without Space a press on a page reaches the page', () => {
    press(card);
    expect(childDown).toHaveBeenCalledTimes(1);
  });

  it('with Space held a press on a page never reaches the page', () => {
    space('keydown');
    press(card);
    expect(childDown).not.toHaveBeenCalled();
    space('keyup');
  });

  it('a touch press is not a Space pan', () => {
    space('keydown');
    press(card, 'touch');
    expect(childDown).toHaveBeenCalledTimes(1);
    space('keyup');
  });

  it('a window blur resets Space', () => {
    space('keydown');
    window.dispatchEvent(new Event('blur'));
    press(card);
    expect(childDown).toHaveBeenCalledTimes(1);
  });

  it('a hidden document resets Space', () => {
    space('keydown');
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    spy.mockRestore();
    press(card);
    expect(childDown).toHaveBeenCalledTimes(1);
  });
});
