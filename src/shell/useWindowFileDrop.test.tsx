import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as preactRender } from 'preact';
import { act } from 'preact/test-utils';
import { useWindowFileDrop, leftWindow } from './useWindowFileDrop';

function fileDragEvent(type: string, { withFiles = true, relatedTarget, clientX, clientY }: { withFiles?: boolean; relatedTarget?: null; clientX?: number; clientY?: number } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer: unknown;
  };
  event.dataTransfer = {
    types: withFiles ? ['Files'] : ['text/plain'],
    files: withFiles ? [new File([''], 'dropped.pdf', { type: 'application/pdf' })] : [],
  };
  if (relatedTarget === null) (event as unknown as { relatedTarget: null }).relatedTarget = null;
  // jsdom's Event has no pointer coordinates; define them directly.
  if (clientX !== undefined) Object.defineProperty(event, 'clientX', { value: clientX });
  if (clientY !== undefined) Object.defineProperty(event, 'clientY', { value: clientY });
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

  it('resets a stuck dragging state when the pointer leaves the window (relatedTarget null)', () => {
    const { getByTestId } = render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragenter'));
    fire(fileDragEvent('dragenter'));
    fire(fileDragEvent('dragleave', { relatedTarget: null, clientX: 0, clientY: 0 }));
    expect(getByTestId('p').textContent).toBe('no');
  });

  it('keeps dragging on a null-relatedTarget leave inside the viewport (Safari)', () => {
    const { getByTestId } = render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragenter'));
    fire(fileDragEvent('dragenter'));
    fire(fileDragEvent('dragleave', { relatedTarget: null, clientX: 200, clientY: 200 }));
    expect(getByTestId('p').textContent).toBe('yes');
  });

  it('leftWindow: needs a null relatedTarget and a position at or past an edge', () => {
    const at = (x: number, y: number, related: EventTarget | null = null) =>
      leftWindow({ relatedTarget: related, clientX: x, clientY: y }, 1000, 800);
    expect(at(0, 300)).toBe(true);
    expect(at(300, 0)).toBe(true);
    expect(at(1000, 300)).toBe(true);
    expect(at(300, 800)).toBe(true);
    expect(at(-5, 300)).toBe(true);
    expect(at(200, 200)).toBe(false);
    expect(at(0, 0, document.body)).toBe(false);
  });

  it('ignores drags that start inside the document until dragend', () => {
    const onFiles = vi.fn();
    const { getByTestId } = render(<Probe onFiles={onFiles} />);
    fire(fileDragEvent('dragstart'));
    fire(fileDragEvent('dragenter'));
    expect(getByTestId('p').textContent).toBe('no');
    const over = fileDragEvent('dragover');
    fire(over);
    expect(over.defaultPrevented).toBe(false);
    const drop = fileDragEvent('drop');
    fire(drop);
    expect(onFiles).not.toHaveBeenCalled();
    fire(fileDragEvent('dragend'));
    fire(fileDragEvent('dragenter'));
    expect(getByTestId('p').textContent).toBe('yes');
  });

  it('clears the internal-drag flag on drop', () => {
    const onFiles = vi.fn();
    const { getByTestId } = render(<Probe onFiles={onFiles} />);
    fire(fileDragEvent('dragstart'));
    fire(fileDragEvent('drop'));
    fire(fileDragEvent('dragenter'));
    expect(getByTestId('p').textContent).toBe('yes');
  });

  it('prevents default on a file dragenter (Safari)', () => {
    render(<Probe onFiles={vi.fn()} />);
    const enter = fileDragEvent('dragenter');
    fire(enter);
    expect(enter.defaultPrevented).toBe(true);
    const textEnter = fileDragEvent('dragenter', { withFiles: false });
    fire(textEnter);
    expect(textEnter.defaultPrevented).toBe(false);
  });

  it('a non-file drop and a non-file dragleave change nothing', () => {
    const onFiles = vi.fn();
    const { getByTestId } = render(<Probe onFiles={onFiles} />);
    fire(fileDragEvent('dragenter'));
    const leave = fileDragEvent('dragleave', { withFiles: false, relatedTarget: null });
    fire(leave);
    expect(getByTestId('p').textContent).toBe('yes');
    const drop = fileDragEvent('drop', { withFiles: false });
    fire(drop);
    expect(drop.defaultPrevented).toBe(false);
    expect(onFiles).not.toHaveBeenCalled();
    expect(getByTestId('p').textContent).toBe('yes');
  });

  it('accepts a file drag after an internal drag whose dragend never arrived', () => {
    const { getByTestId } = render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragstart'));
    const ignored = fileDragEvent('dragover');
    fire(ignored);
    expect(ignored.defaultPrevented).toBe(false);
    // Pointer events never fire during a native drag: one means it is over.
    fire(new Event('pointermove'));
    const over = fileDragEvent('dragover');
    fire(over);
    expect(over.defaultPrevented).toBe(true);
    fire(fileDragEvent('dragenter'));
    expect(getByTestId('p').textContent).toBe('yes');
  });

  it('clears a stuck internal flag on pointerdown too', () => {
    render(<Probe onFiles={vi.fn()} />);
    fire(fileDragEvent('dragstart'));
    fire(new Event('pointerdown'));
    const over = fileDragEvent('dragover');
    fire(over);
    expect(over.defaultPrevented).toBe(true);
  });

  it('adds no window listeners when disabled', () => {
    const spy = vi.spyOn(window, 'addEventListener');
    render(<Probe enabled={false} onFiles={vi.fn()} />);
    const types = spy.mock.calls.map((c) => c[0]);
    spy.mockRestore();
    expect(types.filter((t) => String(t).startsWith('drag') || t === 'drop')).toEqual([]);
  });
});
