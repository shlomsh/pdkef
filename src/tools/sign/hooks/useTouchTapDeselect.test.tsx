import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { useTouchTapDeselect } from './useTouchTapDeselect.ts';

let host: HTMLDivElement;
let handlers: ReturnType<typeof useTouchTapDeselect>;

function Harness({ selectedTool, deactivateAll }: { selectedTool: string | null; deactivateAll: () => void }) {
  handlers = useTouchTapDeselect({ workspaceRef: { current: null }, selectedTool, dispatch: deactivateAll });
  return null;
}

function mount(selectedTool: string | null) {
  const deactivateAll = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Harness selectedTool={selectedTool} deactivateAll={deactivateAll} />, host));
  return deactivateAll;
}
afterEach(() => { act(() => render(null, host)); host.remove(); });

const touch = (target: Element) => ({ identifier: 1, clientX: 50, clientY: 50, target }) as unknown as Touch;
function tap(target: Element) {
  handlers.onTouchStart({ touches: [touch(target)], changedTouches: [touch(target)] } as unknown as TouchEvent);
  handlers.onTouchEnd({ changedTouches: [touch(target)], target, defaultPrevented: false } as unknown as TouchEvent);
}

// `deactivateAll` here is the dispatch spy: a deselect is one SET_ACTIVE_ELEMENT_ID null.
describe('useTouchTapDeselect', () => {
  it('a still tap on blank page area deselects', () => {
    const deactivateAll = mount(null);
    tap(document.body);
    expect(deactivateAll).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  });
  it('a tap on a control does not', () => {
    const deactivateAll = mount(null);
    const button = document.createElement('button');
    document.body.appendChild(button);
    tap(button);
    expect(deactivateAll).not.toHaveBeenCalled();
    button.remove();
  });
  it('a tap with a tool armed does not', () => {
    const deactivateAll = mount('text');
    tap(document.body);
    expect(deactivateAll).not.toHaveBeenCalled();
  });
});
