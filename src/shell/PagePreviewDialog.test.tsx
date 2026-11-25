import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PDFDocument } from '@cantoo/pdf-lib';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderPdfThumbnails } from '#lib/pdf/thumbnails.js';
import PagePreviewDialog from './PagePreviewDialog.tsx';
import '../test/support/realPdfjs.ts';

// The real renderer paints the page of a real PDF; the spy only lets the test wait for each render to finish.
vi.mock('#lib/pdf/thumbnails.js', { spy: true });

const messages = { close: 'Close', previous: 'Previous page', next: 'Next page', loading: 'Rendering the page…' };
let target: { file: File; pageIndex: number; rotation: number; title: string; atStart: boolean; atEnd: boolean };
beforeAll(async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 5; i += 1) doc.addPage([200, 200]);
  const file = new File([await doc.save()], 'a.pdf', { type: 'application/pdf' });
  target = { file, pageIndex: 1, rotation: 0, title: 'Page 2 of 5', atStart: false, atEnd: false };
});

describe('shared PagePreviewDialog', () => {
  let container: HTMLElement | null = null;
  afterEach(async () => {
    act(() => render(null, container!));
    container!.remove();
    // Let the real renders finish (or abort) before the next test.
    await act(async () => { await Promise.allSettled(vi.mocked(renderPdfThumbnails).mock.results.map((r) => r.value)); });
    vi.mocked(renderPdfThumbnails).mockClear();
  });

  function mount(props: Record<string, unknown> = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PagePreviewDialog target={target} onClose={() => {}} onStep={() => {}} messages={messages} {...props} />, container!));
    return container.querySelector('dialog');
  }

  it('renders the title, the badge and the toggle from props', () => {
    const onToggle = vi.fn();
    const dialog = mount({ target: { ...target, badge: 'Left out' }, toggle: { label: 'Bring back', pressed: true, always: true, onToggle } });
    expect(dialog.textContent).toContain('Page 2 of 5');
    expect(dialog.textContent).toContain('Left out');
    const toggleBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Bring back');
    act(() => toggleBtn!.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('disables Previous at the start and steps by one with Next', () => {
    const onStep = vi.fn();
    const dialog = mount({ target: { ...target, atStart: true }, onStep });
    expect(dialog.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]').disabled).toBe(true);
    act(() => dialog.querySelector('button[aria-label="Next page"]').click());
    expect(onStep).toHaveBeenCalledWith(1);
  });
});
