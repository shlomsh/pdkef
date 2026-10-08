import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RedactFinish from './RedactFinish.tsx';
import type { FinishFacts } from './finishState.ts';

const facts = (o: Partial<FinishFacts> = {}): FinishFacts => ({
  phase: 'ready', progress: 0, fileName: 'redacted_x.pdf', pageCount: 2, picturePages: 1, boxCount: 3, deletionCount: 1, ...o,
});

describe('RedactFinish', () => {
  let container = document.createElement('div');
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function mount(f: FinishFacts, over: Record<string, unknown> = {}) {
    document.body.appendChild(container);
    const onHandoff = vi.fn();
    act(() => render(
      <RedactFinish facts={f} canShare={false} shareReady={false} onDownload={() => {}} onPrepareShare={() => {}}
        onShare={() => {}} onHandoff={onHandoff} handoffBusy={false} handoffFailed={false} {...over}>
        <span data-slot>check</span>
      </RedactFinish>, container));
    return { onHandoff };
  }
  const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim());

  it('shows a sentence, not a button, when empty', () => {
    mount(facts({ phase: 'empty', boxCount: 0, deletionCount: 0 }));
    expect(container.textContent).toContain('Draw a box or delete something, then download it here.');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows counts and Download when ready, no hand-off yet', () => {
    mount(facts());
    expect(container.textContent).toContain('Saves with 3 boxes and 1 deletion');
    expect(buttons().join('|')).toContain('Download');
    expect(buttons()).not.toContain('Compress it');
  });

  it('shows progress while exporting and disables Download', () => {
    mount(facts({ phase: 'exporting', progress: 0.4 }));
    expect(container.textContent).toContain('Saving redacted_x.pdf… 40%');
    expect(container.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
  });

  it('shows the saved line, pages line, and hand-offs; children last', () => {
    const { onHandoff } = mount(facts({ phase: 'saved' }));
    expect(container.textContent).toContain('Saved redacted_x.pdf · 2 pages');
    expect(container.textContent).toContain('1 of 2 pages is saved as a picture');
    const compress = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Compress it'))!;
    const sign = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Sign it'))!;
    act(() => compress.click());
    act(() => sign.click());
    expect(onHandoff).toHaveBeenNthCalledWith(1, 'compress');
    expect(onHandoff).toHaveBeenNthCalledWith(2, 'sign');
    expect(container.firstElementChild?.lastElementChild?.hasAttribute('data-slot')).toBe(true);
  });

  it('disables hand-offs while busy and reports a failure', () => {
    mount(facts({ phase: 'saved' }), { handoffBusy: true, handoffFailed: true });
    const compress = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Compress it'))!;
    expect((compress as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('Could not hand this off. Download it instead and open it there.');
  });

  it('says so when a change cancelled the export', () => {
    mount(facts({ phase: 'cancelled' }));
    expect(container.textContent).toContain('You changed something, so that download stopped.');
  });
});
