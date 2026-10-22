import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RedactDoneStrip from './RedactDoneStrip.tsx';
import type { FinishFacts } from './finishState.ts';

const facts = (o: Partial<FinishFacts> = {}): FinishFacts => ({
  phase: 'saved', progress: 1, fileName: 'redacted_x.pdf', pageCount: 2, picturePages: 2, boxCount: 3, deletionCount: 0,
  fileSize: 3 * 1024 * 1024, ...o,
});

describe('RedactDoneStrip', () => {
  let container = document.createElement('div');
  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    container = document.createElement('div');
  });

  function mount(f: FinishFacts, over: Record<string, unknown> = {}) {
    document.body.appendChild(container);
    const onHandoff = vi.fn();
    const onClose = vi.fn();
    act(() => render(
      <RedactDoneStrip facts={f} handoffBusy={false} handoffFailed={false} onHandoff={onHandoff} onClose={onClose} {...over}>
        <span data-rating>rate</span>
      </RedactDoneStrip>, container));
    return { onHandoff, onClose };
  }
  const byText = (t: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(t))!;

  it('is a labelled section with result, pictures line and the size on Compress', () => {
    mount(facts());
    const root = container.querySelector('[data-redact-done-strip]')!;
    expect(root.tagName).toBe('SECTION');
    expect(root.getAttribute('aria-label')).toBe('Your download');
    expect(root.textContent).toContain('Saved redacted_x.pdf · 2 pages · 3.0 MB');
    expect(root.textContent).toContain('Every page is saved as a picture, so nothing hides under a box.');
    expect(byText('Compress it').textContent).toContain('3.0 MB');
    expect(byText('Sign it').textContent).not.toContain('MB');
  });

  it('puts the rating row after the chips', () => {
    mount(facts());
    const rating = container.querySelector('[data-rating]')!;
    expect(byText('Sign it').compareDocumentPosition(rating) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hands off and closes', () => {
    const { onHandoff, onClose } = mount(facts());
    act(() => byText('Compress it').click());
    expect(onHandoff).toHaveBeenCalledWith('compress');
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;
    act(() => close.click());
    expect(onClose).toHaveBeenCalled();
  });

  it('does not announce the saved line itself, the bottom row and the tool do', () => {
    mount(facts());
    expect(container.querySelector('[data-redact-done-strip] [role="status"]')).toBeNull();
  });

  it('reports a failed hand-off', () => {
    mount(facts(), { handoffFailed: true });
    expect(container.textContent).toContain('Could not hand this off. Download it instead and open it there.');
  });
});
