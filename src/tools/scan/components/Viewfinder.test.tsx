import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_VIEW, type CameraHandle } from '../lib/camera/types.ts';
import Viewfinder from './Viewfinder.tsx';

let handle: CameraHandle;
let cameraInput: { onTaken: (page: unknown) => void; paused?: boolean };
vi.mock('../hooks/useCamera.ts', () => ({ useCamera: (input: typeof cameraInput) => { cameraInput = input; return handle; } }));
// The model is another file's work; the component only calls it.
vi.mock('../lib/camera/viewfinderModel.ts', () => ({
  hintText: (hint: string, count: number) => (hint === 'point' ? 'Point at a page' : hint === 'hold' ? 'Hold still' : `Page ${count}. Turn the page.`),
  coverRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
}));

let container: HTMLElement | null = null;
const baseProps = () => ({
  mode: 'many' as const, count: 2, lastSrc: 'blob:last',
  onTaken: vi.fn(), onClose: vi.fn(), onRetakeLast: vi.fn(), onFixCorners: vi.fn(), onFallbackFiles: vi.fn(),
});
function mount(props: Record<string, unknown> = {}) {
  const all = { ...baseProps(), ...props };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<Viewfinder {...all} />, container!));
  return { container, props: all };
}
const byLabel = (label: string) => container!.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const byText = (text: string) => [...container!.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes(text));
const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });

beforeEach(() => {
  handle = { status: 'live', live: IDLE_VIEW, videoSize: { width: 1280, height: 720 }, videoRef: () => {}, auto: true, setAuto: vi.fn(), shoot: vi.fn() };
  const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void };
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
});
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('Viewfinder', () => {
  it('says the hint for point, hold and turn', () => {
    mount();
    const hint = () => container!.querySelector('[aria-live="polite"]')?.textContent;
    expect(hint()).toBe('Point at a page');
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'hold' } };
    act(() => render(null, container!));
    act(() => render(<Viewfinder {...baseProps()} count={3} />, container!));
    expect(hint()).toBe('Hold still');
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'turn' } };
    act(() => render(<Viewfinder {...baseProps()} count={3} />, container!));
    expect(hint()).toBe('Page 3. Turn the page.');
  });

  it('the shutter takes the shot', () => {
    mount();
    click(byLabel('Take this page'));
    expect(handle.shoot).toHaveBeenCalled();
  });

  it('Auto is a switch that toggles', () => {
    mount();
    const sw = container!.querySelector('[role="switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    click(sw);
    expect(handle.setAuto).toHaveBeenCalledWith(false);
  });

  it('Escape closes', () => {
    const { container, props } = mount();
    const event = new Event('cancel', { cancelable: true });
    container.querySelector('dialog')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('Escape with the review open closes only the sheet', () => {
    const { container, props } = mount();
    click(container.querySelector('[data-stack]'));
    expect(byText('Keep')).toBeDefined();
    const event = new Event('cancel', { cancelable: true });
    act(() => { container.querySelector('dialog')!.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(byText('Keep')).toBeUndefined();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('auto is paused while the review is open', () => {
    const { container } = mount();
    expect(cameraInput.paused).toBe(false);
    click(container.querySelector('[data-stack]'));
    expect(cameraInput.paused).toBe(true);
    click(byText('Keep'));
    expect(cameraInput.paused).toBe(false);
  });

  it('a page without a snapshot is still taken', () => {
    const { props } = mount();
    const file = new File(['x'], 'p.jpg');
    expect(() => act(() => cameraInput.onTaken({ file, snapshot: null, quad: null }))).not.toThrow();
    expect(props.onTaken).toHaveBeenCalledWith(file);
  });

  it('revokes the snapshot URL on unmount', () => {
    const create = vi.fn(() => 'blob:snap');
    const revoke = vi.fn();
    (HTMLImageElement.prototype as unknown as { decode: () => Promise<void> }).decode = () => new Promise(() => {});
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    mount({ lastSrc: null, count: 0 });
    act(() => cameraInput.onTaken({ file: new File(['x'], 'p.jpg'), snapshot: new Blob(['s']), quad: null }));
    expect(create).toHaveBeenCalled();
    act(() => render(null, container!));
    expect(revoke).toHaveBeenCalledWith('blob:snap');
  });

  it('Done and the close button close', () => {
    const { props } = mount();
    click(byText('Done'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    click(container!.querySelector('[data-close]'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('the stack opens the review: Retake, Keep, Fix the corners', () => {
    const { props } = mount();
    const open = () => click(container!.querySelector('[data-stack]'));
    open();
    click(byText('Retake'));
    expect(props.onRetakeLast).toHaveBeenCalled();
    expect(byText('Keep')).toBeUndefined();
    open();
    click(byText('Keep'));
    expect(byText('Keep')).toBeUndefined();
    open();
    click(byText('Fix the corners'));
    expect(props.onFixCorners).toHaveBeenCalled();
  });

  it('refused shows the camera-off line and a photo control', () => {
    handle = { ...handle, status: 'refused' };
    mount();
    expect(container!.textContent).toContain("The camera didn't open here");
    expect(container!.textContent).toContain('Take a photo');
  });

  it('mode one has no stack and no Done', () => {
    mount({ mode: 'one' });
    expect(container!.querySelector('[data-stack]')).toBeNull();
    expect(byText('Done')).toBeUndefined();
  });
});
