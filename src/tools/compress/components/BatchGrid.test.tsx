// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchReducer, emptyBatch, summarizeBatch, type BatchEvent, type BatchState } from '../state/imageBatch.ts';
import { englishCompressMessages } from '../messages';
import BatchGrid from './BatchGrid.tsx';

const photo = (name: string, size = 1000) => new File(['x'.repeat(size)], name, { type: 'image/jpeg' });
const smaller = (size = 200) => new Blob(['y'.repeat(size)], { type: 'image/jpeg' });
const build = (...events: BatchEvent[]): BatchState => events.reduce(batchReducer, emptyBatch);
const done = (id: number, blob: Blob, metTarget = true): BatchEvent => ({ type: 'rowDone', id, run: 1, blob, metTarget });
const failed = (id: number): BatchEvent => ({ type: 'rowFailed', id, run: 1 });

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

function mount(state: BatchState, props: Partial<Parameters<typeof BatchGrid>[0]> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const onOpen = vi.fn();
  act(() => render(
    <BatchGrid t={englishCompressMessages} rows={state.rows} summary={summarizeBatch(state)} targetKB={state.targetKB} arrow="→" thumbnails={new Map()} notes={null} onOpen={onOpen} {...props} />,
    host!,
  ));
  return { host, onOpen };
}

const tiles = () => Array.from(host!.querySelectorAll('li[data-batch-photo]'));
const captions = () => tiles().map((li) => li.querySelector('[data-batch-caption]')!.textContent);

describe('BatchGrid', () => {
  it('a failed or unchanged photo says its state once to a screen reader', () => {
    const a = photo('a.png');
    const b = photo('b.jpg', 287);
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, failed(0), done(1, b)));
    expect(captions()).toEqual(["Couldn't read this one", '287 Bytes · unchanged']);
    // Their captions already say so: no second, screen-reader-only sentence repeats it.
    expect(tiles().map((li) => li.querySelector('.sr-only'))).toEqual([null, null]);
  });

  it('names missed, kept and failed rows and still finishes', () => {
    const [a, b, c] = [photo('a.jpg'), photo('b.jpg', 287), photo('c.png')];
    mount(build({ type: 'filesChosen', files: [a, b, c], targetKB: 100 }, done(0, smaller(), false), done(1, b), failed(2)));
    expect(tiles().map((li) => li.getAttribute('data-outcome'))).toEqual(['missed', 'kept', 'failed']);
    expect(host!.querySelector('[data-batch]')!.getAttribute('aria-busy')).toBeNull();
  });

  it('the status line counts a photo that could not be read apart from the ones that missed', () => {
    const [a, b] = [photo('a.jpg'), photo('b.png')];
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, done(0, smaller()), failed(1)));
    expect(host!.querySelector('[data-batch-summary]')!.textContent).toBe("1 of 2 photos are now 100 KB or less. One couldn't be read.");
  });

  it('an unchanged photo is named by its name alone, not offered as a comparison', () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg', 287)];
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, done(0, smaller()), done(1, b)));
    expect(Array.from(host!.querySelectorAll('[data-batch-open]')).map((el) => el.getAttribute('aria-label'))).toEqual(['Compare a.jpg', 'b.jpg']);
  });

  it("announces the finished set once, and names each photo's button by its photo", () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')];
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, done(0, smaller()), done(1, smaller())));
    const live = host!.querySelector('[data-batch-live]')!;
    expect(live.textContent).toBe(host!.querySelector('[data-batch-summary]')!.textContent);
    expect(live.textContent).toBe('All 2 photos are now 100 KB or less.');
    expect(Array.from(host!.querySelectorAll('[data-batch-open]')).map((el) => el.getAttribute('aria-label'))).toEqual(['Compare a.jpg', 'Compare b.jpg']);
    expect(host!.querySelector('[data-batch] ol')!.getAttribute('role')).toBe('list');
  });

  it('says nothing to a screen reader until the whole set has finished', () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')];
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, done(0, smaller())));
    expect(host!.querySelector('[data-batch-live]')!.textContent).toBe('');
  });

  it("Escape in a photo's preview goes back to the set and lands on that photo (the tile takes focus)", () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')];
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, done(0, smaller()), done(1, smaller())), { focusOn: b });
    expect(document.activeElement).toBe(tiles()[1].querySelector('[data-batch-open]'));
  });

  it('back from a photo whose new run has not reached it yet still lands focus in the set', () => {
    const [a, b] = [photo('a.jpg'), photo('b.jpg')];
    // The new run has reached a.jpg and not b.jpg: b's tile has no result, so its button is disabled.
    mount(build({ type: 'filesChosen', files: [a, b], targetKB: 100 }, done(0, smaller())), { focusOn: b });
    expect(tiles()[1].querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    expect(document.activeElement).toBe(host!.querySelector('[data-batch] ol'));
  });
});
