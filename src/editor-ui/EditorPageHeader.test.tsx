import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi } from 'vitest';
import EditorPageHeader from './EditorPageHeader.tsx';

function mount(vnode: preact.ComponentChildren): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { render(vnode, host); });
  return host;
}

describe('EditorPageHeader', () => {
  it('puts Rotate before Clear page in one end-side group', () => {
    const host = mount(<EditorPageHeader pageNumber={1} onClear={() => {}} onRotate={() => {}} />);
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Rotate', 'Clear page']);
    expect(buttons[0].parentElement).toBe(buttons[1].parentElement);
    expect(buttons[0].parentElement).not.toBe(host.firstElementChild);
  });

  it('shows Rotate on an empty page, where Clear is hidden', () => {
    const onRotate = vi.fn();
    const host = mount(<EditorPageHeader pageNumber={2} onClear={null} onRotate={onRotate} />);
    const buttons = host.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    act(() => { buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onRotate).toHaveBeenCalledOnce();
  });

  it('renders no Rotate without onRotate (Redact)', () => {
    const host = mount(<EditorPageHeader pageNumber={1} onClear={() => {}} />);
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Clear page']);
  });
});
