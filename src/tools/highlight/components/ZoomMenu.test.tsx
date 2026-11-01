import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ZoomMenu from './ZoomMenu.tsx';
import { englishHighlightMessages as t } from '../messages.ts';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(over: Partial<Parameters<typeof ZoomMenu>[0]> = {}) {
  const props = { zoom: 4 / 3, setting: 'width' as const, onSetting: vi.fn(), onStep: vi.fn(), onActual: vi.fn(), labels: t, ...over };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ZoomMenu {...props} />, container!));
  const open = () => act(() => { (container!.querySelector('button[aria-haspopup]') as HTMLButtonElement).click(); });
  return { props, open };
}

describe('ZoomMenu', () => {
  it('shows the percent on its button', () => {
    mount({ zoom: 2 });
    expect(container!.querySelector('button')!.textContent).toBe('150%');
  });
  it('lists the fit modes and marks the current one', () => {
    const { open } = mount({ setting: 'text' });
    open();
    const items = [...container!.querySelectorAll('[role="menuitemradio"]')];
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(container!.textContent).toContain(t.fitWidth);
    expect(container!.textContent).toContain(t.fitPage);
    expect(container!.textContent).toContain(t.actualSize);
  });
  it('steps and picks', () => {
    const { props, open } = mount();
    open();
    act(() => { (container!.querySelector(`[aria-label="${t.zoomIn}"]`) as HTMLButtonElement).click(); });
    act(() => { (container!.querySelector(`[aria-label="${t.zoomOut}"]`) as HTMLButtonElement).click(); });
    expect(vi.mocked(props.onStep).mock.calls).toEqual([[1], [-1]]);
    act(() => { (container!.querySelectorAll('[role="menuitemradio"]')[2] as HTMLButtonElement).click(); });
    expect(props.onSetting).toHaveBeenCalledWith('page');
  });
  it('reports opening and closing', () => {
    const onOpenChange = vi.fn();
    const { open } = mount({ onOpenChange });
    open();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });
  it('wears the shared popover and menu-item classes', () => {
    const { open } = mount();
    open();
    const menu = container!.querySelector('[role="menu"]') as HTMLElement;
    expect(menu.className).toMatch(/popover/);
    expect(menu.className).toMatch(/toolbar-menu/);
    for (const item of menu.querySelectorAll('[role^="menuitem"]')) expect(item.className).toMatch(/menu-item/);
  });
});
