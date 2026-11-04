import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookOptions } from '../lib/scanOptions.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanResultView from './ScanResultView.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(bent = false) {
  const fns = { onChooseLook: vi.fn(), onAdjustCorners: vi.fn(), onRotate: vi.fn(), onRetake: vi.fn(), onRemovePage: vi.fn(), onDone: vi.fn() };
  const selected = { id: 7, filter: 'document', found: true, edited: false } as unknown as ScanPage;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(
    <ScanResultView selected={selected} lookOptions={lookOptions()} pageProps={{ src: null, place: null, exact: false }} detail={undefined} bent={bent} {...fns} />,
    container!,
  ));
  return fns;
}
const button = (label: string) => [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

describe('ScanResultView', () => {
  it('a bent page gets the quiet note under it, above the row; a flat one none (SCAN-24)', () => {
    mount(true);
    const note = container!.querySelector('[data-bent-note]') as HTMLElement;
    expect(note.textContent).toBe(t.bentNote);
    expect(note.compareDocumentPosition(container!.querySelector('[data-page-actions]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => render(null, container!));
    container!.remove();
    mount(false);
    expect(container!.querySelector('[data-bent-note]')).toBeNull();
  });

  it('shows one row of five items and one Done', () => {
    mount();
    const row = container!.querySelector('[data-page-actions]')!;
    expect(row.children.length).toBe(5);
    expect(row.textContent).toContain(t.cornersAction);
    expect(row.textContent).toContain(t.rotate);
    expect(row.textContent).toContain(t.lookAction);
    expect(row.textContent).toContain(t.retake);
    expect(row.textContent).toContain(t.removeShort);
    expect(button(t.pageDone)).toBeDefined();
  });

  it('calls the handlers', () => {
    const fns = mount();
    act(() => button(t.cornersAction)!.click());
    act(() => button(t.rotate)!.click());
    act(() => button(t.removeShort)!.click());
    act(() => button(t.pageDone)!.click());
    expect(fns.onAdjustCorners).toHaveBeenCalledTimes(1);
    expect(fns.onRotate).toHaveBeenCalledTimes(1);
    expect(fns.onRemovePage).toHaveBeenCalledWith(7);
    expect(fns.onDone).toHaveBeenCalledTimes(1);
  });

  it('Look toggles the options above the row', () => {
    mount();
    expect(container!.querySelector('[role="radiogroup"]')).toBeNull();
    act(() => button(t.lookAction)!.click());
    expect(container!.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(button(t.lookAction)!.getAttribute('aria-expanded')).toBe('true');
    act(() => button(t.lookAction)!.click());
    expect(container!.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('Retake emits one file', () => {
    const fns = mount();
    const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute('capture')).toBe('environment');
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(fns.onRetake).toHaveBeenCalledWith(file);
  });
});
