import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ref } from 'preact';
import { setInputFiles } from '../../../test/support/setInputFiles.js';
import { FULL_QUAD } from '../lib/quad.ts';
import { exactResultDetail } from '../lib/resultView.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import ScanPageViewerBody from './ScanPageViewerBody.tsx';
import type { ScanPageViewerBodyProps } from './ScanPageViewerBody.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

const page = (id: number, extra: Partial<ScanPage> = {}): ScanPage => ({
  id, file: new File(['x'], `p${id}.jpg`, { type: 'image/jpeg' }), preview: 'p', aspect: 1, filter: 'document', quad: FULL_QUAD, pins: null, turns: 0,
  guessed: true, edited: false, found: true, sheet: false, fine: false, opened: null, question: null, ...extra,
});
const six = [1, 2, 3, 4, 5, 6].map((id) => page(id));
const placed = (n: number) => ({
  key: 'k',
  pages: Array.from({ length: n }, (_, i) => ({ url: `u${i}`, place: { pageWidth: 100, pageHeight: 140, x: 0, y: 0, width: 100, height: 140 } })),
});
const result = (bentPx: number): PageResult => ({ key: 'k', url: 'u', thumbUrl: 't', page: { blob: new Blob(), thumb: new Blob(), width: 1700, height: 2400, bentPx } });

type Over = Partial<Omit<ScanPageViewerBodyProps, 'actions'>> & { actions?: Partial<ScanPageViewerBodyProps['actions']> };

function mount(over: Over = {}, index = 0) {
  const actions = {
    onSelect: vi.fn(), onRotate: vi.fn(), onRotateLeft: vi.fn(), onAdjustCorners: vi.fn(), onCommit: vi.fn(), onFind: vi.fn(), onApprove: vi.fn(),
    onDone: vi.fn(), onStep: vi.fn(), onRetake: vi.fn(), onRemovePage: vi.fn(), onChooseLook: vi.fn(),
    onAskSplit: vi.fn(), onOnePage: vi.fn(), onTwoPages: vi.fn(),
  };
  const editor: { current: HTMLElement | null } = { current: null };
  const heading: { current: HTMLParagraphElement | null } = { current: null };
  const props: ScanPageViewerBodyProps = {
    refs: { editor: editor as Ref<HTMLElement>, heading: heading as Ref<HTMLParagraphElement> },
    pages: six, selected: six[index], selectedIndex: index, view: 'result', results: {}, turnedPreviews: {},
    finding: null, splitting: false, splitFailed: false, findMissed: [], failedIds: [], pageSize: 'fit', built: { shown: placed(6), ready: true, size: 1000 },
    ...over, actions: { ...actions, ...over.actions },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<ScanPageViewerBody {...props} />, container!));
  const rerender = (next: Partial<ScanPageViewerBodyProps>) => act(() => render(<ScanPageViewerBody {...props} {...next} />, container!));
  return { actions, editor, heading, rerender };
}
const unmount = () => { act(() => render(null, container!)); container!.remove(); container = null; };
const q = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const buttonText = (text: string) => [...container!.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;
const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('ScanPageViewerBody', () => {
  it('result mode renders back, title, the page, the row and Done in that order', () => {
    mount({}, 1);
    const order = ['[data-back]', '[data-page-heading]', '[data-page-scroller]', '[data-page-actions]', '[data-page-done]'].map((s) => q(s)!);
    expect(order.every(Boolean)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(follows(order[i - 1], order[i])).toBe(true);
    expect(q('[data-page-heading]')!.textContent).toContain('Page 2 of 6');
    expect(q('[data-page-done]')!.textContent).toBe(t.pageDone);
  });

  it('the not-found line sits under the page, above the row', () => {
    const missed = [page(1, { found: false })];
    mount({ pages: missed, selected: missed[0], built: { shown: placed(1), ready: true, size: 1000 } });
    const line = q('[role="status"]')!;
    expect(line.textContent).toContain(t.notFound);
    expect(follows(q('[data-page-scroller]')!, line)).toBe(true);
    expect(follows(line, q('[data-page-actions]')!)).toBe(true);
  });

  it('a page measured as strongly bent gets the quiet note under it (SCAN-24); a flat or unmeasured one none', () => {
    mount({ results: { 1: result(40) } });
    const note = q('[data-bent-note]')!;
    expect(note.textContent).toBe(t.bentNote);
    expect(follows(q('[data-page-scroller]')!, note)).toBe(true);
    expect(follows(note, q('[data-page-actions]')!)).toBe(true);
    unmount();
    mount({ results: { 1: result(4), 2: result(40) } });
    expect(q('[data-bent-note]')).toBeNull();
    unmount();
    mount({ results: {} });
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

  it('the row turns the page either way: one tap left, one tap right', () => {
    const { actions } = mount();
    const left = q('[data-page-actions] [data-rotate="left"]') as HTMLButtonElement;
    const right = q('[data-page-actions] [data-rotate="right"]') as HTMLButtonElement;
    expect(left.getAttribute('aria-label')).toBe('Rotate left');
    expect(right.getAttribute('aria-label')).toBe('Rotate right');
    act(() => left.click());
    expect(actions.onRotateLeft).toHaveBeenCalledTimes(1);
    expect(actions.onRotate).not.toHaveBeenCalled();
    act(() => right.click());
    expect(actions.onRotate).toHaveBeenCalledTimes(1);
  });

  it('Back and Done in result mode are Done', () => {
    const { actions } = mount();
    act(() => q('[data-back]')!.click());
    act(() => q('[data-page-done]')!.click());
    expect(actions.onDone).toHaveBeenCalledTimes(2);
    expect(actions.onApprove).not.toHaveBeenCalled();
  });

  // Protects: the hint is one sentence, about the dots when the page is in Fine-tune edges and about the corners otherwise.
  it('corners hint is the corners sentence by default, and the dots sentence when the page is in Fine-tune edges', () => {
    const hint = () => q('[role="status"]')?.textContent ?? '';
    mount({ view: 'corners' });
    expect(hint()).toBe(t.cornersHint);
    unmount();
    mount({ view: 'corners', selected: page(1, { fine: true }) });
    expect(hint()).toBe(t.cornersTracedHint);
  });

  it('corners mode: no scroller, no row, the corners editor, and Back uses the corners', () => {
    const { actions, editor } = mount({ view: 'corners' });
    expect(q('[data-page-scroller]')).toBeNull();
    expect(q('[data-page-actions]')).toBeNull();
    expect(container!.textContent).toContain(t.findPage);
    expect(container!.textContent).toContain(t.wholePhoto);
    expect(editor.current).not.toBeNull();
    act(() => q('[data-back]')!.click());
    expect(actions.onApprove).toHaveBeenCalledTimes(1);
    expect(actions.onDone).not.toHaveBeenCalled();
  });

  it('corners keep a Rotate in the bottom bar, except on an unreadable page', () => {
    const { actions } = mount({ view: 'corners' });
    act(() => buttonText(t.rotate)!.click());
    expect(actions.onRotate).toHaveBeenCalledTimes(1);
    unmount();
    const bad = page(1, { preview: null });
    mount({ view: 'corners', pages: [bad], selected: bad, failedIds: [1] });
    expect(buttonText(t.rotate)).toBeUndefined();
  });

  describe('browsing on a mouse device', () => {
    const step = (label: string) => q(`button[aria-label="${label}"]`)!;
    const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) => act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    });

    it('Previous and Next step, and rest with aria-disabled at the ends', () => {
      const { actions } = mount({}, 0);
      expect(step(t.previousPage).getAttribute('aria-disabled')).toBe('true');
      expect(step(t.nextPage).getAttribute('aria-disabled')).toBe('false');
      act(() => step(t.nextPage).click());
      expect(actions.onStep).toHaveBeenCalledWith(1);
      act(() => step(t.previousPage).click());
      expect(actions.onStep).toHaveBeenCalledWith(-1);
    });

    it('the ends: Next is disabled on the last page', () => {
      mount({}, 5);
      expect(step(t.nextPage).getAttribute('aria-disabled')).toBe('true');
      expect(step(t.previousPage).getAttribute('aria-disabled')).toBe('false');
    });

    it('the arrow keys step, left always previous', () => {
      const { actions } = mount({}, 2);
      press('ArrowRight');
      press('ArrowLeft');
      expect(actions.onStep.mock.calls).toEqual([[1], [-1]]);
    });

    it('the arrows leave modifier keys, a handled key and a radio group alone', () => {
      const { actions } = mount({}, 2);
      press('ArrowLeft', { altKey: true });
      press('ArrowRight', { metaKey: true });
      press('ArrowRight', { ctrlKey: true });
      press('ArrowRight', { shiftKey: true });
      const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      handled.preventDefault();
      act(() => { document.body.dispatchEvent(handled); });
      const group = document.createElement('div');
      group.setAttribute('role', 'radiogroup');
      group.innerHTML = '<button></button>';
      container!.appendChild(group);
      press('ArrowRight', {}, group.firstElementChild!);
      expect(actions.onStep).not.toHaveBeenCalled();
    });

    it('corners do not browse', () => {
      const { actions } = mount({ view: 'corners' });
      press('ArrowRight');
      expect(actions.onStep).not.toHaveBeenCalled();
      expect(q(`button[aria-label="${t.nextPage}"]`)).toBeNull();
    });

    it('the arrows stop listening once the viewer is gone', () => {
      const { actions } = mount({}, 2);
      act(() => render(null, container!));
      press('ArrowRight');
      expect(actions.onStep).not.toHaveBeenCalled();
    });
  });

  it('the back control names where it goes, for the wide head that shows the word', () => {
    mount();
    expect(q('[data-back]')!.getAttribute('aria-label')).toBe(t.backToPages);
    expect(q('[data-back]')!.textContent).toBe(t.pagesLabel);
  });

  it('corners on an unreadable page close instead', () => {
    const bad = page(1, { preview: null });
    const { actions } = mount({ view: 'corners', pages: [bad], selected: bad, failedIds: [1] });
    act(() => q('[data-back]')!.click());
    expect(actions.onDone).toHaveBeenCalledTimes(1);
    expect(actions.onApprove).not.toHaveBeenCalled();
  });

  it('corners on a page still waiting for its preview go back by using the corners', () => {
    const waiting = page(1, { preview: null });
    const { actions } = mount({ view: 'corners', pages: [waiting], selected: waiting });
    act(() => q('[data-back]')!.click());
    expect(actions.onApprove).toHaveBeenCalledTimes(1);
    expect(actions.onDone).not.toHaveBeenCalled();
  });

  it('corners on a page that was read and failed later keep their way out: moving a corner tries it again', () => {
    const failed = page(1);
    const { actions } = mount({ view: 'corners', pages: [failed], selected: failed, failedIds: [1] });
    expect(q('[role="status"]')!.textContent).toBe(t.cornersHint);
    act(() => q('[data-back]')!.click());
    expect(actions.onApprove).toHaveBeenCalledTimes(1);
  });

  it('the editor ref is on one element in result mode too, holding the current slide', () => {
    const { editor } = mount({}, 1);
    expect(editor.current!.querySelector('[data-current]')).not.toBeNull();
  });

  it('the heading ref is on the page title', () => {
    const { heading } = mount({}, 1);
    expect(heading.current).toBe(q('[data-page-heading]'));
  });

  it('the arrow keys call the step handler of the latest render', () => {
    const { actions, rerender } = mount({}, 2);
    const later = vi.fn();
    rerender({ actions: { ...actions, onStep: later } });
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(later).toHaveBeenCalledWith(1);
    expect(actions.onStep).not.toHaveBeenCalled();
  });

  describe('split question', () => {
    const asking = page(2, { question: { spine: { top: 0.5, bottom: 0.5 }, rightToLeft: false } });
    const withQuestion = [six[0], asking, ...six.slice(2)];

    it('result mode shows a note and an ask button only when the page has a question', () => {
      const { actions } = mount({ pages: withQuestion, selected: asking, selectedIndex: 1 });
      expect(container!.textContent).toContain('This may be two book pages.');
      act(() => buttonText('One page or two?')!.click());
      expect(actions.onAskSplit).toHaveBeenCalledTimes(1);
    });

    it('result mode of a page with no question has no ask', () => {
      mount({}, 1);
      expect(container!.textContent).not.toContain('This may be two book pages.');
    });

    it('split mode shows the question and Back keeps the page whole (onDone)', () => {
      const { actions } = mount({ pages: withQuestion, selected: asking, selectedIndex: 1, view: 'split' });
      expect(container!.textContent).toContain('Drag either end of the line');
      act(() => q('[data-back]')!.click());
      expect(actions.onDone).toHaveBeenCalledTimes(1);
    });
  });

  describe('what the corners view is given', () => {
    const squeezed = { x: 0.1, y: 0.1 };
    const moved = page(1, { quad: [squeezed, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] });

    it('Use these corners is onApprove, Auto-detect hands over the page, Whole photo commits the whole quad', () => {
      const { actions } = mount({ view: 'corners', pages: [moved], selected: moved });
      act(() => buttonText(t.useCorners)!.click());
      expect(actions.onApprove).toHaveBeenCalledTimes(1);
      act(() => buttonText(t.findPage)!.click());
      expect(actions.onFind).toHaveBeenCalledWith(moved);
      act(() => buttonText(t.wholePhoto)!.click());
      expect(actions.onCommit).toHaveBeenCalledWith(1, FULL_QUAD, null, false);
    });

    it('Remove this photo on an unreadable page removes that page', () => {
      const bad = page(4, { preview: null });
      const { actions } = mount({ view: 'corners', pages: [bad], selected: bad, failedIds: [4] });
      act(() => buttonText(t.removePhoto)!.click());
      expect(actions.onRemovePage).toHaveBeenCalledWith(4);
    });

    it('a page in Fine-tune edges asks for its trace; one that is not does not', () => {
      const asked: number[] = [];
      const onTrace = (id: number) => { asked.push(id); return Promise.resolve(null); };
      const fine = page(1, { fine: true });
      mount({ view: 'corners', pages: [fine], selected: fine, actions: { onTrace } });
      expect(asked).toEqual([1]);
    });

    it('shows the page photo, or its turned preview, or waits in the photo shape', () => {
      mount({ view: 'corners' });
      expect(q('[data-photo-area] img')!.getAttribute('src')).toBe('p');
      unmount();
      const turned = page(1, { turns: 1, aspect: 2 });
      mount({ view: 'corners', pages: [turned], selected: turned, turnedPreviews: { '1|1': 'turned.jpg' } });
      expect(q('[data-photo-area] img')!.getAttribute('src')).toBe('turned.jpg');
      unmount();
      mount({ view: 'corners', pages: [turned], selected: turned });
      expect(q('[data-photo-area] img')).toBeNull();
      expect(q('[data-photo-area] > div')!.style.aspectRatio).toBe('0.5 / 1');
    });

    it('says it is finding the edges while this page is being found, and disables Auto-detect', () => {
      mount({ view: 'corners', finding: 1 });
      expect(q('[role="status"]')!.textContent).toBe(t.findingEdges);
      expect(buttonText(t.findPage)!.disabled).toBe(true);
    });

    it('says a failed page could not be read, and a page the edge search missed says so', () => {
      const bad = page(1, { preview: null });
      mount({ view: 'corners', pages: [bad], selected: bad, failedIds: [1] });
      expect(q('[role="status"]')!.textContent).toBe(t.pageFailed);
      unmount();
      mount({ view: 'corners', findMissed: [1] });
      expect(q('[role="status"]')!.textContent).toBe(t.findMissed);
    });
  });

  describe('what the split view is given', () => {
    const asking = page(2, { question: { spine: { top: 0.5, bottom: 0.55 }, rightToLeft: false } });
    const withQuestion = [six[0], asking, ...six.slice(2)];
    const split = (over: Over = {}) => mount({ pages: withQuestion, selected: asking, selectedIndex: 1, view: 'split', ...over });

    it('One page and Two pages answer, Two pages with the line', () => {
      const { actions } = split();
      act(() => buttonText(t.splitOne)!.click());
      expect(actions.onOnePage).toHaveBeenCalledTimes(1);
      act(() => buttonText(t.splitTwo)!.click());
      expect(actions.onTwoPages).toHaveBeenCalledWith({ top: 0.5, bottom: 0.55 });
    });

    it('both answers wait while the split is being made', () => {
      split({ splitting: true });
      expect(buttonText(t.splitOne)!.disabled).toBe(true);
      expect(buttonText(t.splitTwo)!.disabled).toBe(true);
    });

    it('a failed split says so, otherwise the hint', () => {
      split({ splitFailed: true });
      expect(q('[role="status"]')!.textContent).toBe(t.splitFailed);
      unmount();
      split();
      expect(q('[role="status"]')!.textContent).toBe(t.splitHint);
    });
  });

  describe('what the result view is given', () => {
    it('Edges beside a missed page and in the row both adjust the corners; an edited page has no missed line', () => {
      const missed = [page(1, { found: false })];
      const { actions } = mount({ pages: missed, selected: missed[0] });
      act(() => buttonText(t.adjustCorners)!.click());
      act(() => buttonText(t.cornersAction)!.click());
      expect(actions.onAdjustCorners).toHaveBeenCalledTimes(2);
      unmount();
      const edited = [page(1, { found: false, edited: true })];
      mount({ pages: edited, selected: edited[0] });
      expect(q('[role="status"]')).toBeNull();
    });

    it('the row acts on the selected page: its look, remove and retake', () => {
      const second = page(2, { filter: 'grayscale' });
      const pages = [six[0], second, six[2]];
      const { actions } = mount({ pages, selected: second, selectedIndex: 1 });
      act(() => buttonText(t.lookAction)!.click());
      const looks = [...container!.querySelectorAll('[role="radio"]')] as HTMLElement[];
      expect(looks.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.textContent)).toEqual([t.lookGrayscale]);
      act(() => looks.find((b) => b.textContent === t.lookDocument)!.click());
      expect(actions.onChooseLook).toHaveBeenCalledWith('document');
      act(() => buttonText(t.removeShort)!.click());
      expect(actions.onRemovePage).toHaveBeenCalledWith(2);
      const input = q('input[type="file"]') as HTMLInputElement;
      const file = new File(['x'], 'again.jpg', { type: 'image/jpeg' });
      act(() => setInputFiles(input, [file]));
      expect(actions.onRetake).toHaveBeenCalledWith(file);
    });

    it('the page caption says exactly as it will download with the size when built, updating when not, making when nothing', () => {
      const caption = () => q('figcaption')!.textContent!.trim();
      mount({}, 0);
      expect(caption()).toBe(`${t.resultExact} · ${exactResultDetail(1000, 6)}`);
      unmount();
      mount({ built: { shown: undefined, ready: false, size: 0 }, results: { 1: result(0) } }, 0);
      expect(caption()).toBe(t.resultUpdating);
      unmount();
      mount({ built: { shown: undefined, ready: false, size: 0 } }, 0);
      expect(caption()).toBe(t.processing);
    });
  });
});
