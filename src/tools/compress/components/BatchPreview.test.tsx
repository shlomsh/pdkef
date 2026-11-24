// @vitest-environment jsdom
import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { batchReducer, emptyBatch, type BatchEvent, type BatchState } from '../state/imageBatch.ts';
import { englishCompressMessages } from '../messages';
import BatchPreview from './BatchPreview.tsx';

const photo = (name: string) => new File(['x'.repeat(1000)], name, { type: 'image/jpeg' });
const smaller = () => new Blob(['y'.repeat(200)], { type: 'image/jpeg' });
const dimensions = { width: 800, height: 600, originalWidth: 1600, originalHeight: 1200 };
const build = (...events: BatchEvent[]): BatchState => events.reduce(batchReducer, emptyBatch);
const done = (id: number): BatchEvent => ({ type: 'rowDone', id, run: 1, blob: smaller(), metTarget: true, dimensions });

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

interface Handlers { onBack: () => void; onOpen: (file: File) => void; onSaved: () => void }

function Preview({ state, index, handlers }: { state: BatchState; index: number; handlers: Handlers }) {
  const compare = useComparePreviews({ runTokenRef: useRef(0) });
  return (
    <BatchPreview
      t={englishCompressMessages}
      compare={compare}
      row={state.rows[index]}
      rows={state.rows}
      targetKB={state.targetKB}
      arrow="→"
      urlFor={(blob) => `blob:saved-${blob.size}`}
      {...handlers}
    />
  );
}

function mount(state: BatchState, index = 0) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const handlers = { onBack: vi.fn(), onOpen: vi.fn(), onSaved: vi.fn() };
  act(() => render(<Preview state={state} index={index} handlers={handlers} />, host!));
  return handlers;
}

const twoDone = () => build({ type: 'filesChosen', files: [photo('a.jpg'), photo('b.jpg')], targetKB: 100 }, done(0), done(1));
const press = (target: Element | Document, init: KeyboardEventInit = {}) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })); });
const bar = () => host!.querySelector('[data-batch-preview-bar]')!;

describe('BatchPreview', () => {
  it('a finished row opens its photo in the compare preview with Full screen, and Back goes to the list', async () => {
    const handlers = mount(twoDone());
    await waitUntil(() => host!.querySelector('[data-compare-panel] [data-compare-labels]') !== null);
    const result = host!.querySelector('[data-result]')!;
    expect(result.textContent).toContain('1600 × 1200');
    expect(Array.from(result.querySelectorAll('button')).some((b) => b.textContent!.includes('Full screen'))).toBe(true);
    act(() => bar().querySelector<HTMLButtonElement>('[data-batch-back]')!.click());
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });

  it("Escape goes back to the set, not while Full screen is open, not on a held key's repeat", () => {
    const handlers = mount(twoDone());
    press(bar(), { repeat: true });
    expect(handlers.onBack).not.toHaveBeenCalled();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);
    press(bar());
    expect(handlers.onBack).not.toHaveBeenCalled();
    dialog.remove();
    press(bar());
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });

  it('Escape while typing a target stays in the preview', () => {
    const handlers = mount(twoDone());
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    press(field);
    field.remove();
    expect(handlers.onBack).not.toHaveBeenCalled();
    expect(bar()).not.toBeNull();
  });

  it('the preview steps through the finished photos and saves the one on screen', () => {
    const state = twoDone();
    const first = mount(state);
    const position = () => bar().querySelector('[data-batch-position]')!.textContent;
    const prev = () => bar().querySelector<HTMLButtonElement>('[data-batch-prev]')!;
    const next = () => bar().querySelector<HTMLButtonElement>('[data-batch-next]')!;
    const save = () => bar().querySelector<HTMLAnchorElement>('a[data-batch-save]')!;
    expect(position()).toBe('1 of 2');
    expect(bar().textContent).toContain('a.jpg');
    // Disabled by aria-disabled, so a keyboard press on the last arrow keeps its focus.
    expect(prev().getAttribute('aria-disabled')).toBe('true');
    expect(next().getAttribute('aria-disabled')).toBeNull();
    expect(save().getAttribute('aria-label')).toBe('Save a.jpg');
    expect(save().getAttribute('download')).toBe('a-compressed.jpg');
    act(() => prev().click());
    expect(first.onOpen).not.toHaveBeenCalled();
    act(() => next().click());
    expect(first.onOpen).toHaveBeenCalledWith(state.rows[1].file);
    act(() => save().click());
    expect(first.onSaved).toHaveBeenCalledTimes(1);

    act(() => render(null, host!));
    host!.remove();
    const second = mount(state, 1);
    expect(position()).toBe('2 of 2');
    expect(bar().textContent).toContain('b.jpg');
    expect(next().getAttribute('aria-disabled')).toBe('true');
    expect(next().disabled).toBe(false);
    next().focus();
    act(() => next().click());
    expect(second.onOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next());
    expect(save().getAttribute('aria-label')).toBe('Save b.jpg');
    act(() => prev().click());
    expect(second.onOpen).toHaveBeenCalledWith(state.rows[0].file);
  });
});
