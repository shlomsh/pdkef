import type { ComponentProps } from 'preact';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import ScanPageViewer from './ScanPageViewer.tsx';

type ScanPageViewerProps = ComponentProps<typeof ScanPageViewer>;

let container: HTMLElement | null = null;
let openWidth = 400;
const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
beforeEach(() => {
  showModal.mockClear();
  openWidth = 400;
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal = showModal;
  proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  // A closed dialog is display: none, so nothing inside it has a width until showModal.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.closest('dialog[open]') ? openWidth : 0; } });
});
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
    onSelect: vi.fn(), onRotate: vi.fn(), onAdjustCorners: vi.fn(), onCommit: vi.fn(), onFind: vi.fn(), onApprove: vi.fn(),
    onDone: vi.fn(), onRetake: vi.fn(), onRemovePage: vi.fn(), onChooseLook: vi.fn(),
  };
  const editor = { current: null as HTMLElement | null };
  const props = {
    refs: { editor, heading: { current: null } },
    pages: six, selected: six[index], selectedIndex: index, view: 'result', results: {}, turnedPreviews: {},
    finding: null, findMissed: [], pageSize: 'fit', built: { shown: placed(6), ready: true, size: 1000 },
    actions, ...over,
  } as unknown as ScanPageViewerProps;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ScanPageViewer {...props} />, container!));
  return { actions, editor };
}
const q = (sel: string) => container!.querySelector(sel) as HTMLElement | null;

describe('ScanPageViewer', () => {
  it('opens as a modal dialog', () => {
    mount();
    expect(q('dialog[data-page-viewer]')).not.toBeNull();
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('result mode renders back, title, the page, the row and Done in that order', () => {
    mount({}, 1);
    const order = ['[data-back]', '[data-page-heading]', '[data-page-scroller]', '[data-page-actions]', '[data-page-done]'].map((s) => q(s)!);
    expect(order.every(Boolean)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(q('[data-page-heading]')!.textContent).toContain('Page 2 of 6');
    expect(q('[data-page-done]')!.textContent).toBe(t.pageDone);
  });

  it('the not-found line sits under the page, above the row', () => {
    const missed = [page(1, { found: false })];
    mount({ pages: missed, selected: missed[0], built: { shown: placed(1), ready: true, size: 1000 } });
    const line = container!.querySelector('[role="status"]') as HTMLElement;
    expect(line.textContent).toContain(t.notFound);
    expect(q('[data-page-scroller]')!.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.compareDocumentPosition(q('[data-page-actions]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a page measured as strongly bent gets the quiet note under it (SCAN-24); a flat or unmeasured one none', () => {
    const result = (bentPx?: number) => ({ key: 'k', url: 'u', thumbUrl: 't', page: { width: 1700, height: 2400, bentPx } });
    mount({ results: { 1: result(40) } } as unknown as Partial<ScanPageViewerProps>);
    const note = q('[data-bent-note]')!;
    expect(note.textContent).toBe(t.bentNote);
    expect(q('[data-page-scroller]')!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(q('[data-page-actions]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => render(null, container!));
    mount({ results: { 1: result(4), 2: result(40) } } as unknown as Partial<ScanPageViewerProps>);
    expect(q('[data-bent-note]')).toBeNull();
    act(() => render(null, container!));
    mount({ results: { 1: result() } } as unknown as Partial<ScanPageViewerProps>);
    expect(q('[data-bent-note]')).toBeNull();
  });

  it('every page has a slide, only the current page and its neighbours render a paper', () => {
    mount({}, 3);
    const slides = [...container!.querySelectorAll('[data-slide]')];
    expect(slides.length).toBe(6);
    expect(slides.map((s) => s.querySelector('[data-paper]') !== null)).toEqual([false, false, true, true, true, false]);
    expect(slides.filter((s) => s.hasAttribute('data-current')).length).toBe(1);
    expect(slides[3].hasAttribute('data-current')).toBe(true);
  });

  it('puts the scroller on the selected page before paint', () => {
    mount({}, 2);
    expect(q('[data-page-scroller]')!.scrollLeft).toBe(800);
  });

  it('a swipe that reaches another page selects it, and staying on the same page does not', () => {
    const { actions } = mount({}, 0);
    const sc = q('[data-page-scroller]')!;
    sc.scrollLeft = 100;
    act(() => { sc.dispatchEvent(new Event('scroll')); });
    expect(actions.onSelect).not.toHaveBeenCalled();
    sc.scrollLeft = 420;
    act(() => { sc.dispatchEvent(new Event('scroll')); });
    expect(actions.onSelect).toHaveBeenCalledWith(2);
  });

  it('leaves the scroller alone when it already shows the selected page', () => {
    const { actions } = mount({}, 1);
    const sc = q('[data-page-scroller]')!;
    sc.scrollLeft = 390;
    act(() => { sc.dispatchEvent(new Event('scroll')); });
    expect(sc.scrollLeft).toBe(390);
    expect(actions.onSelect).not.toHaveBeenCalled();
  });

  describe('when the width changes under the open viewer', () => {
    let resized: () => void;
    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resized = cb; } observe() {} disconnect() {} });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('the current page stays selected when a scroll lands first', () => {
      const { actions } = mount({}, 2);
      const sc = q('[data-page-scroller]')!;
      openWidth = 800;
      act(() => { sc.dispatchEvent(new Event('scroll')); });
      expect(actions.onSelect).not.toHaveBeenCalled();
      expect(sc.scrollLeft).toBe(1600);
    });

    it('the scroller is pinned back to the current page when no scroll comes', () => {
      mount({}, 2);
      openWidth = 800;
      act(() => resized());
      expect(q('[data-page-scroller]')!.scrollLeft).toBe(1600);
    });
  });

  describe('a close the browser makes on its own', () => {
    const nativeClose = () => act(() => { q('dialog')!.removeAttribute('open'); q('dialog')!.dispatchEvent(new Event('close')); });

    it('counts as Back', () => {
      const { actions } = mount();
      nativeClose();
      expect(actions.onDone).toHaveBeenCalledTimes(1);
    });

    it('in corners the viewer stays, open again, on the result', () => {
      const { actions } = mount({ view: 'corners' });
      nativeClose();
      expect(actions.onApprove).toHaveBeenCalledTimes(1);
      expect(q('dialog')!.hasAttribute('open')).toBe(true);
    });

    it('closing it ourselves is not a Back', () => {
      const { actions } = mount();
      const dialog = q('dialog')!;
      act(() => render(null, container!));
      dialog.dispatchEvent(new Event('close'));
      expect(actions.onDone).not.toHaveBeenCalled();
    });
  });

  it('Back, Escape and Done in result mode are Done', () => {
    const { actions } = mount();
    act(() => q('[data-back]')!.click());
    act(() => { q('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); });
    act(() => q('[data-page-done]')!.click());
    expect(actions.onDone).toHaveBeenCalledTimes(3);
  });

  it('corners mode: same dialog, no scroller, no Rotate, Back and Escape use the corners', () => {
    const { actions, editor } = mount({ view: 'corners' });
    expect(q('[data-page-scroller]')).toBeNull();
    expect(q('[data-page-actions]')).toBeNull();
    expect(container!.textContent).not.toContain(t.fullScreen);
    expect(container!.textContent).not.toContain(t.rotate);
    expect(container!.textContent).toContain(t.findPage);
    expect(container!.textContent).toContain(t.wholePhoto);
    expect(editor.current).not.toBeNull();
    act(() => q('[data-back]')!.click());
    const cancel = new Event('cancel', { cancelable: true });
    act(() => { q('dialog')!.dispatchEvent(cancel); });
    expect(cancel.defaultPrevented).toBe(true);
    expect(actions.onApprove).toHaveBeenCalledTimes(2);
    expect(actions.onDone).not.toHaveBeenCalled();
  });

  it('corners on an unreadable page close instead', () => {
    const bad = page(1, { preview: null });
    const { actions } = mount({ view: 'corners', pages: [bad], selected: bad });
    act(() => q('[data-back]')!.click());
    expect(actions.onDone).toHaveBeenCalledTimes(1);
    expect(actions.onApprove).not.toHaveBeenCalled();
  });

  it('the editor ref is on one element in result mode too, holding the current slide', () => {
    const { editor } = mount({}, 1);
    expect(editor.current!.querySelector('[data-current]')).not.toBeNull();
  });
});
