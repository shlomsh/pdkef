import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as preactRender } from 'preact';
import { act } from 'preact/test-utils';
import { useWindowFileDrop } from './useWindowFileDrop';

function fileDragEvent(type: string, { withFiles = true } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: unknown;
  };
  event.dataTransfer = {
    types: withFiles ? ['Files'] : ['text/plain'],
    files: withFiles ? [new File([''], 'dropped.pdf', { type: 'application/pdf' })] : [],
  };
  return event;
}

let renders = 0;
function Probe({ enabled = true, onFiles }: { enabled?: boolean; onFiles: (dt: DataTransfer) => void }) {
  renders += 1;
  const dragging = useWindowFileDrop({ enabled, onDrop: onFiles });
  return <div data-testid="p">{dragging ? 'yes' : 'no'}</div>;
}

const fire = (e: Event) =>
  act(() => {
    window.dispatchEvent(e);
  });

let container: HTMLElement;
let mounted: HTMLElement[] = [];
function render(vnode: preact.VNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  mounted.push(container);
  act(() => preactRender(vnode, container));
  return {
    getByTestId: (_id?: string) => container.querySelector('[data-testid="p"]') as HTMLElement,
    rerender: (v: preact.VNode) => act(() => preactRender(v, container)),
  };
}

afterEach(() => {
  for (const c of mounted) {
    act(() => preactRender(null, c));
    c.remove();
  }
  mounted = [];
  renders = 0;
});

describe('useWindowFileDrop', () => {
  it('shows dragging on file enter, survives nested pairs, clears on final leave', () => {
    const { getByTestId } = render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragenter'));
    expect(getByTestId('p').textContent).toBe('yes');
    fire(fileDragEvent('dragenter'));
    fire(fileDragEvent('dragleave'));
    expect(getByTestId('p').textContent).toBe('yes');
    fire(fileDragEvent('dragleave'));
    expect(getByTestId('p').textContent).toBe('no');
  });

  it('ignores non-file drags', () => {
    const { getByTestId } = render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragenter', { withFiles: false }));
    expect(getByTestId('p').textContent).toBe('no');
    const over = fileDragEvent('dragover', { withFiles: false });
    fire(over);
    expect(over.defaultPrevented).toBe(false);
  });

  it('calls onFiles on a file drop and clears dragging', () => {
    const onFiles = vi.fn();
    const { getByTestId } = render(<Probe onFiles={onFiles} />);
    fire(fileDragEvent('dragenter'));
    const drop = fileDragEvent('drop');
    fire(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].files).toHaveLength(1);
    expect(onFiles.mock.calls[0][0].types).toContain('Files');
    expect(getByTestId('p').textContent).toBe('no');
  });

  it('skips onFiles when an inner handler already took the drop', () => {
    const onFiles = vi.fn();
    render(<Probe onFiles={onFiles} />);
    const inner = (e: Event) => e.preventDefault();
    document.body.addEventListener('drop', inner);
    const drop = fileDragEvent('drop');
    act(() => {
      document.body.dispatchEvent(drop);
    });
    document.body.removeEventListener('drop', inner);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('dragover prevents default without re-rendering', () => {
    render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragenter'));
    const before = renders;
    const over = fileDragEvent('dragover');
    for (let i = 0; i < 5; i++) fire(fileDragEvent('dragover'));
    fire(over);
    expect(over.defaultPrevented).toBe(true);
    expect(renders).toBe(before);
  });

  it('removes listeners when disabled', () => {
    const onFiles = vi.fn();
    const { getByTestId, rerender } = render(<Probe onFiles={onFiles} />);
    fire(fileDragEvent('dragenter'));
    rerender(<Probe enabled={false} onFiles={onFiles} />);
    expect(getByTestId('p').textContent).toBe('no');
    fire(fileDragEvent('dragenter'));
    expect(getByTestId('p').textContent).toBe('no');
    const drop = fileDragEvent('drop');
    fire(drop);
    expect(drop.defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
