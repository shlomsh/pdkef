import type { RedactBoxElement } from '../lib/redactElements.ts';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RedactBox from './RedactBox.tsx';

const EL: RedactBoxElement = { id: 'a', type: 'blackout', left: 10, top: 10, width: 30, height: 10, pageIndex: 0 };

function mockPointer(coarse: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('fine') ? !coarse : coarse && q.includes('coarse'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as any;
}

describe('RedactBox touch behaviour', () => {
  let container = document.createElement('div');
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function mount(isSelected: boolean, onChange = vi.fn(), onSelect = vi.fn(), pseudoHost?: HTMLElement) {
    (pseudoHost ?? document.body).appendChild(container);
    const wrapper = document.createElement('div');
    wrapper.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 700, right: 500, bottom: 700, x: 0, y: 0, toJSON() {} }) as DOMRect;
    document.body.appendChild(wrapper);
    act(() => render(
      <RedactBox
        el={EL}
        isSelected={isSelected}
        pointer={{ onSelect, onChange, getPageWrapper: () => wrapper, onHoverEnter: () => {}, onHoverLeave: () => {} }}
        actions={{ onDelete: () => {}, onDuplicate: () => {}, onChangeStrength: () => {} }}
        color={{ onPick: () => {}, onMatchPage: () => {}, eyedropping: false, onToggleEyedropper: () => {} }}
      />,
      container,
    ));
    return { box: container.querySelector('.redact-box, [class*="redact-box"]') as HTMLElement, onChange, onSelect };
  }

  const touch = (type: string, x: number, y: number) =>
    new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [{ identifier: 1, target: document.body, clientX: x, clientY: y } as any] });

  it('a touch on an unselected box does not start a move or select', () => {
    mockPointer(true);
    const { box, onChange } = mount(false);
    act(() => { box.dispatchEvent(touch('touchstart', 100, 100)); });
    act(() => { document.dispatchEvent(touch('touchmove', 140, 160)); });
    act(() => { document.dispatchEvent(touch('touchend', 140, 160)); });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('only a selected box takes over one-finger panning', () => {
    mockPointer(true);
    const unselected = mount(false).box.style.touchAction;
    act(() => render(null, container));
    const selected = mount(true).box.style.touchAction;
    expect(unselected).toContain('pan-y');
    expect(selected).not.toContain('pan');
  });

  it('on a coarse pointer the selected box controls render in a bar in document.body', () => {
    mockPointer(true);
    const { box } = mount(true);
    const bar = document.body.querySelector('[data-redact-box-bar]');
    expect(bar).not.toBeNull();
    expect(box.contains(bar)).toBe(false);
    expect(bar!.parentElement).toBe(document.body);
  });

  it('in pseudo full screen the bar portals into the element carrying data-pseudo-fullscreen', () => {
    mockPointer(true);
    const host = document.createElement('div');
    host.setAttribute('data-pseudo-fullscreen', '');
    document.body.appendChild(host);
    mount(true, vi.fn(), vi.fn(), host);
    const bar = document.querySelector('[data-redact-box-bar]');
    expect(bar!.parentElement).toBe(host);
    act(() => render(null, container));
    host.remove();
  });

  it('pressing the toolbar Delete button starts no drag and selects nothing', () => {
    mockPointer(false);
    const { box, onChange, onSelect } = mount(true);
    const del = box.querySelector<HTMLButtonElement>('[data-editor-actions] button[title="Delete"]')!;
    act(() => { del.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true })); });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300, bubbles: true })); });
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['whiteout', { id: 'w', type: 'whiteout', left: 10, top: 10, width: 30, height: 10, pageIndex: 0, color: '#ffffff' }, null],
    ['blackout', { id: 'w', type: 'blackout', left: 10, top: 10, width: 30, height: 10, pageIndex: 0 }, 3],
    ['blur', { id: 'w', type: 'blur', left: 10, top: 10, width: 30, height: 10, pageIndex: 0, strength: 0.3 }, 3],
  ] as [string, RedactBoxElement, number | null][])('a %s shows its toolbar and eight resizers only once selected', (type, whiteout, buttonCount) => {
    mockPointer(false);
    const wrapper = document.createElement('div');
    const renderBox = (isSelected: boolean) => act(() => render(
      <RedactBox
        el={whiteout}
        isSelected={isSelected}
        pointer={{ onSelect: () => {}, onChange: () => {}, getPageWrapper: () => wrapper, onHoverEnter: () => {}, onHoverLeave: () => {} }}
        actions={{ onDelete: () => {}, onDuplicate: () => {}, onChangeStrength: () => {} }}
        color={{ onPick: () => {}, onMatchPage: () => {}, eyedropping: false, onToggleEyedropper: () => {} }}
        repeatGroup={{ onRepeatOnEveryPage: () => {} }}
      />,
      container,
    ));
    document.body.appendChild(container);

    renderBox(false);
    const box = container.querySelector<HTMLElement>('[data-redact-box-id="w"]')!;
    expect(box.querySelector('[data-editor-actions]')).toBeNull();

    renderBox(true);
    expect(box.hasAttribute('data-editor-shape')).toBe(true);
    expect(box.querySelectorAll('[data-editor-resizer]')).toHaveLength(8);
    expect(box.querySelector('[data-editor-actions] button[title="Delete"]')).not.toBeNull();
    if (buttonCount !== null) expect(box.querySelectorAll('[data-editor-actions] button')).toHaveLength(buttonCount);
    expect(box.querySelector('[data-editor-actions] [data-editor-blur-strength-input]') !== null).toBe(type === 'blur');
  });

  describe('press and hold to peek', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('holding the box for 250ms peeks it, release covers it again, and it never moves', () => {
      mockPointer(false);
      const { box, onChange } = mount(true);
      vi.useFakeTimers();
      act(() => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true })); });
      act(() => { vi.advanceTimersByTime(250); });
      expect(box.hasAttribute('data-peeking')).toBe(true);
      document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 180, bubbles: true }));
      expect(box.style.transform).not.toContain('translate(');
      expect(onChange).not.toHaveBeenCalled();
      act(() => { document.dispatchEvent(new MouseEvent('mouseup')); window.dispatchEvent(new MouseEvent('mouseup')); });
      expect(box.hasAttribute('data-peeking')).toBe(false);
    });

    it('moving 8px before 250ms is a normal move, not a peek', () => {
      mockPointer(false);
      const { box } = mount(true);
      vi.useFakeTimers();
      act(() => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true })); });
      act(() => { document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 108, clientY: 100, bubbles: true })); });
      expect(box.style.transform).toContain('translate(');
      act(() => { vi.advanceTimersByTime(400); });
      expect(box.hasAttribute('data-peeking')).toBe(false);
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    });
  });

  it('on a fine pointer the toolbar floats inside the box', () => {
    mockPointer(false);
    const { box } = mount(true);
    expect(document.body.querySelector('[data-redact-box-bar]')).toBeNull();
    expect(box.querySelector('[data-editor-actions]')).not.toBeNull();
  });
});

describe('RedactBox floating toolbar gap (RED-53)', () => {
  it('the pill sits 16px above the box, so the top handles can be grabbed', () => {
    mockPointer(false);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wrapper = document.createElement('div');
    act(() => render(
      <RedactBox el={EL} isSelected={true} pointer={{ onSelect: () => {}, onChange: () => {}, getPageWrapper: () => wrapper, onHoverEnter: () => {}, onHoverLeave: () => {} }}
        actions={{ onDelete: () => {}, onDuplicate: () => {}, onChangeStrength: () => {} }}
        color={{ onPick: () => {}, onMatchPage: () => {}, eyedropping: false, onToggleEyedropper: () => {} }} />,
      container,
    ));
    const pill = container.querySelector('[data-editor-actions]') as HTMLElement;
    expect(pill.style.transform).toContain('16px');
    act(() => render(null, container));
    container.remove();
  });
});

describe('RedactBox keyboard (RED-43)', () => {
  it('is focusable, named, and routes keys to the existing callbacks', () => {
    mockPointer(false);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onChange = vi.fn(), onSelect = vi.fn(), onDelete = vi.fn();
    const wrapper = document.createElement('div');
    act(() => render(
      <RedactBox el={EL} isSelected={true} pointer={{ onSelect: onSelect, onChange: onChange, getPageWrapper: () => wrapper, onHoverEnter: () => {}, onHoverLeave: () => {} }}
        actions={{ onDelete: onDelete, onDuplicate: () => {}, onChangeStrength: () => {} }}
        color={{ onPick: () => {}, onMatchPage: () => {}, eyedropping: false, onToggleEyedropper: () => {} }}
        pageSize={{ width: 500, height: 1000 }} />,
      container,
    ));
    const box = container.querySelector('[data-redact-box-id="a"]') as HTMLElement;
    expect(box.tabIndex).toBe(0);
    expect(box.getAttribute('aria-label')).toBe('Blackout box');
    const key = (k: string, init: any = {}) => act(() => { box.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
    key('ArrowRight', { shiftKey: true });
    expect(onChange).toHaveBeenCalledWith('a', { left: 12, top: 10 });
    key('Delete');
    expect(onDelete).toHaveBeenCalledWith('a');
    key('Enter');
    expect(onSelect).toHaveBeenCalledWith('a');
    act(() => render(null, container));
    container.remove();
  });
});
