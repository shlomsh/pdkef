import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RedactBox from './RedactBox.tsx';

const EL = { id: 'a', type: 'blackout', left: 10, top: 10, width: 30, height: 10, page: 0 };

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
        isActiveHover={false}
        onSelect={onSelect}
        onChange={onChange}
        getPageWrapper={() => wrapper}
        onHoverEnter={() => {}}
        onHoverLeave={() => {}}
        onDelete={() => {}}
        onPickColor={() => {}} onMatchPage={() => {}} eyedropping={false} onToggleEyedropper={() => {}}
        onChangeStrength={() => {}}
        onDuplicate={() => {}}
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

  it('on a fine pointer the toolbar floats inside the box', () => {
    mockPointer(false);
    const { box } = mount(true);
    expect(document.body.querySelector('[data-redact-box-bar]')).toBeNull();
    expect(box.querySelector('[data-editor-actions]')).not.toBeNull();
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
      <RedactBox el={EL} isSelected={true} isActiveHover={false} onSelect={onSelect} onChange={onChange}
        getPageWrapper={() => wrapper} onHoverEnter={() => {}} onHoverLeave={() => {}} onDelete={onDelete}
        onPickColor={() => {}} onMatchPage={() => {}} eyedropping={false} onToggleEyedropper={() => {}} onChangeStrength={() => {}} onDuplicate={() => {}}
        pageWidthPoints={500} pageHeightPoints={1000} />,
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
