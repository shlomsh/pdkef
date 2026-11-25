import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_VIEW, type CameraHandle } from '../lib/camera/types.ts';
import { englishScanMessages as t } from '../messages.ts';
import Viewfinder from './Viewfinder.tsx';

let handle: CameraHandle & { shooting?: boolean; photoRefused?: boolean };
let cameraInput: { onTaken: (page: unknown) => void; paused?: boolean };
vi.mock('../hooks/useCamera.ts', () => ({ useCamera: (input: typeof cameraInput) => { cameraInput = input; return handle; } })); // forced: a camera already live with the view each test names, with no stream

let container: HTMLElement | null = null;
const baseProps = () => ({
  mode: 'many' as const, count: 2, lastSrc: 'blob:last', scanFiles: [],
  onTaken: vi.fn(), onClose: vi.fn(), onReview: vi.fn(), paused: false, onFallbackFiles: vi.fn(),
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
  handle = { status: 'live', live: IDLE_VIEW, videoSize: { width: 1280, height: 720 }, videoRef: () => {}, auto: true, setAuto: vi.fn(), shoot: vi.fn(), track: () => undefined };
  const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void };
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
});
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('Viewfinder', () => {
  it('says the hint for point, hold and turn', () => {
    mount();
    const hint = () => container!.querySelector('[data-camera-hint]')?.textContent;
    expect(hint()).toBe('Point at a page');
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'hold' } };
    act(() => render(null, container!));
    act(() => render(<Viewfinder {...baseProps()} count={3} />, container!));
    expect(hint()).toBe('Hold still');
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'turn' } };
    act(() => render(<Viewfinder {...baseProps()} count={3} />, container!));
    expect(hint()).toBe('Page 3. Turn the page.');
  });

  it('a guidance hint shows on the line, on its pill; the plain ones without', () => {
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'flatter' } };
    mount();
    const line = container!.querySelector('[data-camera-hint]')!;
    expect(line.getAttribute('data-camera-hint')).toBe('flatter');
    expect(line.textContent).toBe(t.hintFlatter);
    expect(line.querySelector('[data-advice]')).not.toBeNull();
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'hold' } };
    act(() => render(<Viewfinder {...baseProps()} />, container!));
    expect(line.querySelector('[data-advice]')).toBeNull();
  });

  it('screen readers hear what was spoken, politely, not the line itself', () => {
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'contrast', spoken: 'point' } };
    mount();
    const live = container!.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0].getAttribute('aria-live')).toBe('polite');
    expect(live[0].textContent).toBe('Point at a page');
    expect(container!.querySelector('[data-camera-hint]')!.hasAttribute('aria-live')).toBe(false);
    expect(container!.querySelector('[data-camera-hint]')!.getAttribute('aria-hidden')).toBe('true');
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'turn', spoken: 'turn' } };
    act(() => render(<Viewfinder {...baseProps()} count={4} />, container!));
    expect(live[0].textContent).toBe('Page 4. Turn the page.');
  });

  it('SCAN-38: the turn line counts the page being taken as soon as the shot starts', () => {
    handle = { ...handle, live: { ...IDLE_VIEW, hint: 'turn' }, shooting: true };
    mount({ count: 2 });
    expect(container!.querySelector('[data-camera-hint]')?.textContent).toBe('Page 3. Turn the page.');
    handle = { ...handle, shooting: false };
    act(() => render(<Viewfinder {...baseProps()} count={3} />, container!));
    expect(container!.querySelector('[data-camera-hint]')?.textContent).toBe('Page 3. Turn the page.');
  });

  it('nothing is spoken before the first hint', () => {
    mount();
    expect(container!.querySelector('[data-hint-spoken]')!.textContent).toBe('');
  });

  it('the shutter takes the shot', () => {
    mount();
    click(byLabel('Take this page'));
    expect(handle.shoot).toHaveBeenCalled();
  });

  it('SCAN-78: a refused photo is told, with the phone\'s own camera beside it and the shutter still there', () => {
    mount();
    expect(container!.querySelector('[role="alert"]')).toBeNull();
    handle = { ...handle, photoRefused: true };
    act(() => render(<Viewfinder {...baseProps()} />, container!));
    const notice = container!.querySelector('[role="alert"]')!;
    expect(notice.textContent).toContain("That photo didn't come through. Tap the shutter to try again, or take it with your phone's camera.");
    expect(notice.querySelector('input[type="file"][capture]')).not.toBeNull();
    expect(byLabel('Take this page')).not.toBeNull();
  });

  it('SCAN-78: a photo that lands after the camera closed joins the scan, and makes no snapshot URL to leak', () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const { props } = mount();
    act(() => render(null, container!));
    const file = new File(['x'], 'p.jpg');
    cameraInput.onTaken({ file, snapshot: new Blob(['s']), quad: null });
    expect(props.onTaken).toHaveBeenCalledWith(file);
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it('SCAN-78: a retake closed before its photo landed keeps the old page', () => {
    const { props } = mount({ mode: 'one' });
    act(() => render(null, container!));
    cameraInput.onTaken({ file: new File(['x'], 'p.jpg'), snapshot: null, quad: null });
    expect(props.onTaken).not.toHaveBeenCalled();
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

  it('paused reaches the camera as given', () => {
    mount({ paused: true });
    expect(cameraInput.paused).toBe(true);
    act(() => render(null, container!));
    mount({ paused: false });
    expect(cameraInput.paused).toBe(false);
  });

  it('a page without a snapshot is still taken', () => {
    const { props } = mount();
    const file = new File(['x'], 'p.jpg');
    expect(() => act(() => cameraInput.onTaken({ file, snapshot: null, quad: null }))).not.toThrow();
    expect(props.onTaken).toHaveBeenCalledWith(file);
  });

  it('revokes the snapshot URL on unmount', () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    (HTMLImageElement.prototype as unknown as { decode: () => Promise<void> }).decode = () => new Promise(() => {});
    mount({ lastSrc: null, count: 0 });
    act(() => cameraInput.onTaken({ file: new File(['x'], 'p.jpg'), snapshot: new Blob(['s']), quad: null }));
    expect(create).toHaveBeenCalledTimes(1);
    const snapshotUrl = create.mock.results[0].value as string;
    expect(snapshotUrl).toMatch(/^blob:/);
    expect(revoke).not.toHaveBeenCalled();
    act(() => render(null, container!));
    expect(revoke).toHaveBeenCalledWith(snapshotUrl);
    create.mockRestore();
    revoke.mockRestore();
  });

  it('Done and the close button close', () => {
    const { props } = mount();
    click(byText('Done'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    click(container!.querySelector('[data-close]'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('the stack calls onReview and shows no sheet', () => {
    const { props } = mount();
    click(container!.querySelector('[data-stack]'));
    expect(props.onReview).toHaveBeenCalledTimes(1);
    expect(byText('Keep')).toBeUndefined();
    expect(byText('Retake')).toBeUndefined();
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
