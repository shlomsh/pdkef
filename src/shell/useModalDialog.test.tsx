import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as preactRender } from 'preact';
import { act } from 'preact/test-utils';
import { useRef } from 'preact/hooks';
import { useModalDialog } from './useModalDialog.ts';
import type { ModalDialogOptions } from './useModalDialog.ts';

function Harness({ open, onClose, options }: { open: boolean; onClose: () => void; options?: ModalDialogOptions }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useModalDialog(ref, open, onClose, options);
  return <dialog ref={ref} data-testid="d" />;
}

const proto = HTMLDialogElement.prototype as any;
let root: HTMLDivElement;
function render(ui: any) {
  act(() => { preactRender(ui, root); });
  return {
    container: root,
    rerender: (next: any) => { act(() => { preactRender(next, root); }); },
  };
}
function cleanup() { act(() => { preactRender(null, root); }); root.remove(); }
let saved: { showModal: any; close: any };

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
  saved = { showModal: proto.showModal, close: proto.close };
  proto.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  proto.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => {
  cleanup();
  proto.showModal = saved.showModal;
  proto.close = saved.close;
});

const dialogOf = (c: HTMLElement) => c.querySelector('dialog') as HTMLDialogElement;
const esc = (target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe('useModalDialog', () => {
  it('re-runs showModal after a native close when syncOn changes', () => {
    const first = () => {};
    const { container, rerender } = render(<Harness open onClose={first} options={{ escape: false, syncOn: first }} />);
    dialogOf(container).close();
    expect(proto.showModal).toHaveBeenCalledTimes(1);
    const second = () => {};
    rerender(<Harness open onClose={second} options={{ escape: false, syncOn: second }} />);
    expect(proto.showModal).toHaveBeenCalledTimes(2);
  });

  it('does not re-open after a native close without syncOn', () => {
    const { container, rerender } = render(<Harness open onClose={() => {}} options={{ escape: false }} />);
    dialogOf(container).close();
    rerender(<Harness open onClose={() => {}} options={{ escape: false }} />);
    expect(proto.showModal).toHaveBeenCalledTimes(1);
  });

  it('calls showModal when open turns true', () => {
    const { container, rerender } = render(<Harness open={false} onClose={() => {}} />);
    expect(proto.showModal).not.toHaveBeenCalled();
    rerender(<Harness open onClose={() => {}} />);
    expect(proto.showModal).toHaveBeenCalledTimes(1);
    expect(dialogOf(container).open).toBe(true);
  });

  it('closes when open turns false', () => {
    const { container, rerender } = render(<Harness open onClose={() => {}} />);
    rerender(<Harness open={false} onClose={() => {}} />);
    expect(proto.close).toHaveBeenCalledTimes(1);
    expect(dialogOf(container).open).toBe(false);
  });

  it('falls back to the open attribute when showModal and close are missing', () => {
    proto.showModal = undefined;
    proto.close = undefined;
    const { container, rerender } = render(<Harness open onClose={() => {}} />);
    expect(dialogOf(container).open).toBe(true);
    rerender(<Harness open={false} onClose={() => {}} />);
    expect(dialogOf(container).open).toBe(false);
  });

  it('Escape calls onClose once and does not reach a bubbling listener', () => {
    const onClose = vi.fn();
    const bubbling = vi.fn();
    document.addEventListener('keydown', bubbling);
    render(<Harness open onClose={onClose} />);
    const event = esc(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bubbling).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    document.removeEventListener('keydown', bubbling);
  });

  it('ignores Escape while closed and other keys while open', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness open={false} onClose={onClose} />);
    esc();
    rerender(<Harness open onClose={onClose} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('escape: false leaves Escape to the caller', () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} options={{ escape: false }} />);
    esc();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("escape: 'cancel' listens to the native cancel event, preventing default only", () => {
    const onClose = vi.fn();
    const outer = vi.fn();
    document.addEventListener('cancel', outer, true);
    const { container } = render(<Harness open onClose={onClose} options={{ escape: 'cancel' }} />);
    esc();
    expect(onClose).not.toHaveBeenCalled();
    const cancel = new Event('cancel', { cancelable: true });
    dialogOf(container).dispatchEvent(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancel.defaultPrevented).toBe(true);
    document.removeEventListener('cancel', outer, true);
  });

  it('fallback: false calls showModal and close unguarded', () => {
    proto.showModal = undefined;
    expect(() => render(<Harness open onClose={() => {}} options={{ fallback: false }} />)).toThrow();
  });

  it('closeWhenHidden: false never closes from the effect', () => {
    const { rerender } = render(<Harness open onClose={() => {}} options={{ closeWhenHidden: false }} />);
    rerender(<Harness open={false} onClose={() => {}} options={{ closeWhenHidden: false }} />);
    expect(proto.close).not.toHaveBeenCalled();
  });
});
