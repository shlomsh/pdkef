import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useRef } from 'preact/hooks';
import { useCordTuck } from './useCordTuck.ts';

let api: ReturnType<typeof useCordTuck> | null = null;
let rendered = true;
let queued: FrameRequestCallback | null = null;

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  api = useCordTuck(ref);
  return <div ref={ref} />;
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = null;
  rendered = true;
  vi.restoreAllMocks();
});

function mount() {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { queued = cb; return 1; });
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() => (rendered ? [{}] : []) as unknown as DOMRectList);
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Probe />, host!));
}
const scrollTo = (y: number) => act(() => { Object.defineProperty(window, 'scrollY', { value: y, configurable: true }); window.dispatchEvent(new Event('scroll')); const cb = queued; queued = null; cb?.(0); });

describe('useCordTuck', () => {
  it('tucks after scrolling past the threshold, and pop untucks it at the new position', () => {
    scrollTo(0);
    mount();
    expect(api!.tucked).toBe(false);
    scrollTo(5);
    expect(api!.tucked).toBe(false);
    scrollTo(200);
    expect(api!.tucked).toBe(true);
    act(() => api!.pop());
    expect(api!.tucked).toBe(false);
    scrollTo(205);
    expect(api!.tucked).toBe(false);
    scrollTo(300);
    expect(api!.tucked).toBe(true);
  });

  it('a scroll while the cord is not rendered (the lamp) re-anchors untucked', () => {
    scrollTo(0);
    mount();
    scrollTo(200);
    expect(api!.tucked).toBe(true);
    rendered = false;
    scrollTo(0);
    expect(api!.tucked).toBe(false);
    rendered = true;
    scrollTo(5);
    expect(api!.tucked).toBe(false);
  });

  it('stops listening on unmount', () => {
    scrollTo(0);
    mount();
    const remove = vi.spyOn(window, 'removeEventListener');
    act(() => render(null, host!));
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
