import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PagePreviewDialog from './PagePreviewDialog.tsx';

vi.mock('../lib/thumbnails.js', () => ({ renderPdfThumbnails: vi.fn(async () => 0) }));

const messages = { close: 'Close', previous: 'Previous page', next: 'Next page', loading: 'Rendering the page…' };
const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
const target = { file, pageIndex: 1, rotation: 0, title: 'Page 2 of 5', atStart: false, atEnd: false };

describe('shared PagePreviewDialog', () => {
  let container: HTMLElement | null = null;
  afterEach(() => { act(() => render(null, container!)); container!.remove(); });

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
