// @vitest-environment jsdom
import { render } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitUntil } from '../../../test/support/waitUntil.ts';
import { useComparePreviews } from '../hooks/useComparePreviews.ts';
import { useCompressFinish } from '../hooks/useCompressFinish.ts';
import { compressImageToTarget } from '../lib/compressImage.js';
import { englishCompressMessages as t } from '../messages';
import BatchWorkspace from './BatchWorkspace.tsx';
import IntakeNotes from './IntakeNotes.tsx';

vi.mock('../lib/compressImage.js', { spy: true });

const photo = (name: string) => new File(['x'.repeat(1000)], name, { type: 'image/jpeg' });
const compressed = () => ({ blob: new Blob(['y'.repeat(200)], { type: 'image/jpeg' }), metTarget: true, width: 800, height: 600, originalWidth: 1600, originalHeight: 1200 });

type Held = { promise: Promise<ReturnType<typeof compressed>>; release: () => void };
const holdUp = (): Held => {
  let release!: () => void;
  const promise = new Promise<ReturnType<typeof compressed>>((resolve) => { release = () => resolve(compressed()); });
  return { promise, release };
};
let held: Map<string, Held>;

type Api = ReturnType<typeof useCompressFinish>['batch'];
const idle = { status: 'idle' as const, blob: null, url: null, generation: 0, prepareNow: () => {}, passthrough: false };

function Workspace({ apiRef }: { apiRef: { current: Api | null } }) {
  const compare = useComparePreviews({ runTokenRef: useRef(0) });
  const { flow, batch, batchName } = useCompressFinish({ t, kind: 'image', prepared: idle, fileName: '', setAnnouncement: () => {}, analyticsTool: 'compress-image' });
  apiRef.current = batch;
  // As in the island: the field's own value, which the batch's target trails while a typed one settles.
  const [targetKB, setTargetKB] = useState(100);
  return (
    <BatchWorkspace
      t={t}
      batch={batch}
      compare={compare}
      flow={flow}
      notes={(className) => <IntakeNotes t={t} rejected={[]} leftOutPdfs={batch.leftOutPdfs} className={className} />}
      name={batchName}
      targetKB={targetKB}
      presets={[50, 100, 200]}
      onTargetKBChange={setTargetKB}
      arrow="→"
    />
  );
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host!));
    host.remove();
    host = null;
  }
});

let api: { current: Api | null };
beforeEach(() => {
  held = new Map();
  api = { current: null };
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the real compressor decodes the photo with createImageBitmap or a blob: Image, which jsdom lacks; some photos are held until a test lets them finish.
  vi.mocked(compressImageToTarget).mockReset().mockImplementation((file) => held.get((file as File).name)?.promise ?? Promise.resolve(compressed()));
});

const mount = (files: File[], leftOut: string[] = []) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Workspace apiRef={api} />, host!));
  act(() => api.current!.choose(files, 100, leftOut));
};
const allFinished = () => waitUntil(() => api.current!.summary.allFinished);
const opens = () => Array.from(host!.querySelectorAll<HTMLButtonElement>('[data-batch-open]'));
const click = (el: Element) => act(() => (el as HTMLElement).click());
const grid = () => host!.querySelector<HTMLElement>('[data-batch]')!;
const finished = async (files = [photo('a.jpg'), photo('b.jpg')], leftOut: string[] = []) => {
  mount(files, leftOut);
  await allFinished();
};
const retarget = (kb: number) => act(() => api.current!.setTarget(kb, { immediate: true }));

describe('BatchWorkspace', () => {
  it('names the PDFs the pick left out inside the set, beside its rows', async () => {
    await finished(undefined, ['form.pdf']);
    const note = grid().querySelector('[data-batch-left-out]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('form.pdf');
  });

  it('a finished row opens its photo in the compare preview with Full screen, and Back returns to the list', async () => {
    await finished();
    expect(host!.querySelector('[data-result]')).toBeNull();
    click(opens()[0]);
    // The set stays mounted behind the preview, so its scroll and pictures are as they were on the way back.
    expect(grid().hidden).toBe(true);
    await waitUntil(() => host!.querySelector('[data-result] [data-compare-panel] [data-compare-labels]') !== null);
    const result = host!.querySelector('[data-result]')!;
    expect(result.textContent).toContain('1600 × 1200');
    expect(Array.from(result.querySelectorAll('button')).some((b) => b.textContent!.includes('Full screen'))).toBe(true);
    click(host!.querySelector('[data-batch-back]')!);
    expect(host!.querySelector('[data-result]')).toBeNull();
    expect(grid().hidden).toBe(false);
    expect(host!.querySelectorAll('li[data-batch-photo]')).toHaveLength(2);
  });

  it("Escape in a photo's preview goes back to the set and lands on that photo", async () => {
    await finished();
    click(opens()[1]);
    expect(host!.querySelector('[data-batch-preview-bar]')).not.toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(host!.querySelector('[data-batch-preview-bar]')).toBeNull();
    expect(document.activeElement).toBe(opens()[1]);
  });

  it('the target field shows a typed size at once and widens for it, before the set takes it', async () => {
    await finished();
    const field = host!.querySelector<HTMLInputElement>('#image-target-size-input')!;
    expect(field.style.width).toBe('3.5ch');
    act(() => {
      field.value = '10240';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(api.current!.state.targetKB).toBe(100);
    expect(field.value).toBe('10240');
    expect(field.style.width).toBe('5.5ch');
  });

  it('back from a photo whose new run has not reached it yet still lands focus in the set', async () => {
    await finished();
    click(opens()[1]);
    // A new target restarts the run: a.jpg is done again, b.jpg waits behind it and cannot be opened yet.
    const b = holdUp();
    held.set('b.jpg', b);
    retarget(200);
    await waitUntil(() => api.current!.state.rows[0].status === 'done' && api.current!.state.rows[1].status === 'working');
    click(host!.querySelector('[data-batch-back]')!);
    expect(host!.querySelectorAll<HTMLButtonElement>('li[data-batch-photo] button')[1].disabled).toBe(true);
    expect(document.activeElement).toBe(host!.querySelector('[data-batch] ol'));
    b.release();
  });

  it('the open preview stays on its photo while a new target recompresses it', async () => {
    await finished();
    click(opens()[0]);
    await waitUntil(() => host!.querySelector('[data-result] [data-compare-panel] [data-compare-labels]') !== null);
    const a = holdUp();
    held.set('a.jpg', a);
    retarget(200);
    // While the photo recompresses the stage still shows it, as a single photo does mid-run.
    expect(host!.querySelector('[data-result]')).not.toBeNull();
    expect(host!.querySelector('[data-batch-preview-bar]')!.textContent).toContain('a.jpg');
    a.release();
    await allFinished();
    await waitUntil(() => host!.querySelector('[data-result] [data-compare-panel] [data-compare-labels]') !== null);
    click(host!.querySelector('[data-batch-back]')!);
    expect(opens()).toHaveLength(2);
  });
});
