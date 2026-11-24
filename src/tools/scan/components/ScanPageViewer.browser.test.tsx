import type { ComponentProps } from 'preact';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanPageViewer from './ScanPageViewer.tsx';

type ScanPageViewerProps = ComponentProps<typeof ScanPageViewer>;

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

const page = (id: number, extra: Partial<ScanPage> = {}) => (
  { id, filter: 'document', found: true, edited: false, guessed: true, preview: 'p', turns: 0, aspect: 1, quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], ...extra } as unknown as ScanPage
);
const six = [1, 2, 3, 4, 5, 6].map((id) => page(id));
const placed = (n: number) => ({ pages: Array.from({ length: n }, (_, i) => ({ url: `u${i}`, place: { pageWidth: 100, pageHeight: 140, x: 0, y: 0, width: 100, height: 140 } })) });

function mount(over: Partial<ScanPageViewerProps> = {}, index = 0) {
  const actions = {
    onSelect: vi.fn(), onRotate: vi.fn(), onRotateLeft: vi.fn(), onAdjustCorners: vi.fn(), onCommit: vi.fn(), onFind: vi.fn(), onApprove: vi.fn(),
    onDone: vi.fn(), onStep: vi.fn(), onRetake: vi.fn(), onRemovePage: vi.fn(), onChooseLook: vi.fn(),
    onAskSplit: vi.fn(), onOnePage: vi.fn(), onTwoPages: vi.fn(),
  };
  const editor = { current: null as HTMLElement | null };
  const props = {
    refs: { editor, heading: { current: null } },
    pages: six, selected: six[index], selectedIndex: index, view: 'result', results: {}, turnedPreviews: {},
    finding: null, splitting: false, splitFailed: false, findMissed: [], failedIds: [], pageSize: 'fit', built: { shown: placed(6), ready: true, size: 1000 },
    actions, ...over,
  } as unknown as ScanPageViewerProps;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ScanPageViewer {...props} />, container!));
  return { actions, editor };
}
const q = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const resizeSeen = (target: Element) => new Promise<void>((resolve) => {
  const observer = new ResizeObserver(() => { observer.disconnect(); resolve(); });
  observer.observe(target);
});
const happened = (target: EventTarget, type: string) => new Promise<void>((resolve) => { target.addEventListener(type, () => resolve(), { once: true }); });

const nativeClose = async () => {
  const dialog = q('dialog') as HTMLDialogElement;
  const closed = happened(dialog, 'close');
  act(() => dialog.close());
  await closed;
};

describe('ScanPageViewer in Chromium', () => {
  it('in result mode the dialog is modal, Back, Escape, Done and a native close are Done, closing it ourselves is not, and the Undo chip shows only when a page is held', async () => {
    let { actions } = mount();
    const dialog = q('dialog[data-page-viewer]') as HTMLDialogElement;
    expect(dialog.open, 'dialog open').toBe(true);
    expect(dialog.matches(':modal'), 'dialog modal').toBe(true);
    act(() => q('[data-back]')!.click());
    act(() => { q('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); });
    act(() => q('[data-page-done]')!.click());
    expect(actions.onDone, 'Back, Escape, Done').toHaveBeenCalledTimes(3);

    act(() => render(null, container!));
    ({ actions } = mount());
    await nativeClose();
    expect(actions.onDone, 'native close').toHaveBeenCalledTimes(1);

    act(() => render(null, container!));
    ({ actions } = mount());
    const closed = happened(q('dialog')!, 'close');
    act(() => render(null, container!));
    await closed;
    expect(actions.onDone, 'closing it ourselves').not.toHaveBeenCalled();

    const onUndo = vi.fn();
    mount({ undo: { position: 3, onUndo } } as Partial<ScanPageViewerProps>);
    const chip = q('dialog [data-undo-chip]')!;
    expect(chip.textContent, 'Undo chip').toContain('Page 3 removed');
    act(() => (chip.querySelector('button') as HTMLElement).click());
    expect(onUndo, 'Undo click').toHaveBeenCalledTimes(1);
    act(() => render(null, container!));
    mount();
    expect(q('[data-undo-chip]'), 'no chip when nothing is held').toBeNull();
  });

  it('in corners mode there is no scroller, Back and Escape use the corners, and a native close leaves the viewer open on the result', async () => {
    let { actions, editor } = mount({ view: 'corners' });
    expect(q('[data-page-scroller]'), 'no scroller').toBeNull();
    expect(q('[data-page-actions]'), 'no actions').toBeNull();
    expect(container!.textContent, 'find page').toContain(t.findPage);
    expect(container!.textContent, 'whole photo').toContain(t.wholePhoto);
    expect(editor.current, 'editor').not.toBeNull();
    act(() => q('[data-back]')!.click());
    const cancel = new Event('cancel', { cancelable: true });
    act(() => { q('dialog')!.dispatchEvent(cancel); });
    expect(cancel.defaultPrevented, 'cancel prevented').toBe(true);
    expect(actions.onApprove, 'Back and Escape').toHaveBeenCalledTimes(2);
    expect(actions.onDone, 'not Done').not.toHaveBeenCalled();

    act(() => render(null, container!));
    ({ actions } = mount({ view: 'corners' }));
    await nativeClose();
    expect(actions.onApprove, 'native close').toHaveBeenCalledTimes(1);
    const dialog = q('dialog') as HTMLDialogElement;
    expect(dialog.open, 'reopened').toBe(true);
    expect(dialog.matches(':modal'), 'reopened modal').toBe(true);
  });

  it('puts the scroller on the selected page, a swipe to another page selects it, and staying on the same page does not', async () => {
    mount({}, 2);
    let sc = q('[data-page-scroller]')!;
    expect(sc.clientWidth, 'open width').toBeGreaterThan(0);
    expect(sc.scrollLeft, 'open position').toBe(2 * sc.clientWidth);

    act(() => render(null, container!));
    let { actions } = mount({}, 0);
    sc = q('[data-page-scroller]')!;
    await resizeSeen(sc);
    sc.style.scrollSnapType = 'none';
    const width = sc.clientWidth;
    let scrolled = happened(sc, 'scroll');
    sc.scrollLeft = Math.round(width / 4);
    await scrolled;
    expect(actions.onSelect, 'short swipe').not.toHaveBeenCalled();
    scrolled = happened(sc, 'scroll');
    sc.scrollLeft = Math.round(width * 1.05);
    await scrolled;
    expect(actions.onSelect, 'swipe to the next page').toHaveBeenCalledWith(2);

    act(() => render(null, container!));
    ({ actions } = mount({}, 1));
    sc = q('[data-page-scroller]')!;
    await resizeSeen(sc);
    sc.style.scrollSnapType = 'none';
    const near = sc.clientWidth - 10;
    scrolled = happened(sc, 'scroll');
    sc.scrollLeft = near;
    await scrolled;
    expect(sc.scrollLeft, 'scroller left alone').toBe(near);
    expect(actions.onSelect, 'same page').not.toHaveBeenCalled();
  });

  it('pins the selected page when the width changes with no scroll, and keeps it selected when a scroll lands first', async () => {
    mount({}, 2);
    let sc = q('[data-page-scroller]')!;
    await resizeSeen(sc);
    sc.style.scrollSnapType = 'none';
    let resized = resizeSeen(sc);
    sc.style.width = '800px';
    await resized;
    expect(sc.clientWidth, 'width').toBe(800);
    expect(sc.scrollLeft, 'pinned').toBe(1600);

    act(() => render(null, container!));
    const { actions } = mount({}, 2);
    sc = q('[data-page-scroller]')!;
    await resizeSeen(sc);
    sc.style.scrollSnapType = 'none';
    const before = sc.clientWidth;
    resized = resizeSeen(sc);
    sc.style.width = '800px';
    sc.scrollLeft = 5 * before;
    await resized;
    expect(actions.onSelect, 'no select').not.toHaveBeenCalled();
    expect(sc.clientWidth, 'width after scroll').toBe(800);
    expect(sc.scrollLeft, 'pinned after scroll').toBe(1600);
  });
});
