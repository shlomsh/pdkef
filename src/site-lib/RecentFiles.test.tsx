// @ts-nocheck - test-only, mirrors FileDropzone.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import RecentFiles from './RecentFiles.tsx';

describe('RecentFiles', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
  });

  function mount(files, props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<RecentFiles files={files} {...props} />, container);
    });
  }

  it('renders nothing for an empty list', () => {
    mount([]);
    expect(container.querySelector('[data-home-recents]')).toBeNull();
  });

  it('renders the bundled sample as a button, unaffected by the draft branch', () => {
    mount([{ tool: 'sign', fileName: 'PDkef practice form.pdf', bundledSample: true }]);
    const button = container.querySelector('button[aria-label^="Open bundled sample PDF"]');
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('Sign & Fill PDF');
  });

  it('renders an ordinary cached file as a button that calls onOpenRecent', () => {
    const onOpenRecent = vi.fn();
    const file = { cacheId: 'sha256:x', tool: 'sign', fileName: 'contract.pdf', savedAt: Date.now() };
    mount([file], { onOpenRecent });
    const button = container.querySelector('button[aria-label^="Open recent PDF"]');
    expect(button).not.toBeNull();
    button.click();
    expect(onOpenRecent).toHaveBeenCalledWith(file);
  });

  // MEM-01 folded Merge's entry into the same recency index every other
  // tool's work lives in, so a saved Merge set is an ordinary row here now,
  // not a special link - see this file's own comment on the button branch,
  // and openRecent in FileDropzone.tsx for how it resumes from the click.
  it('renders a saved merge set as the ordinary button, with its page count', () => {
    const onOpenRecent = vi.fn();
    const file = {
      cacheId: 'sha256:merge-set', tool: 'merge', fileName: 'invoice + 2 more',
      pageCount: 7, savedAt: Date.now() - 60_000,
    };
    mount([file], { onOpenRecent });

    expect(container.querySelector('a')).toBeNull();
    const button = container.querySelector('button[aria-label^="Open recent PDF"]');
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('invoice + 2 more');
    expect(button.textContent).toContain('Merge PDF');
    expect(button.textContent).toContain('7 pages');
    button.click();
    expect(onOpenRecent).toHaveBeenCalledWith(file);
  });

  it('omits the page count line when a file has none', () => {
    mount([{ cacheId: 'sha256:x', tool: 'sign', fileName: 'a.pdf' }]);
    expect(container.querySelector('button').textContent).not.toMatch(/page/);
  });

  // On /he/ (dir="rtl") the browser-locale "2 days ago" is an LTR string in
  // an RTL page, and the bidi algorithm renders it as "days ago 2" unless the
  // element carries its own base direction. <bdi> is dir="auto" by default.
  it('wraps the saved-at label in a <bdi> so it keeps its own direction on an RTL page', () => {
    mount([{ cacheId: 'sha256:x', tool: 'sign', fileName: 'a.pdf', savedAt: Date.now() - 2 * 86_400_000 }]);
    const bdi = container.querySelector('button bdi');
    expect(bdi).not.toBeNull();
    expect(bdi.textContent).toBe(new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-2, 'day'));
    expect(bdi.parentElement.tagName).toBe('SPAN');
  });

  it('routes the "just now" fallback through the same <bdi> wrapper', () => {
    mount([{ cacheId: 'sha256:x', tool: 'sign', fileName: 'a.pdf', savedAt: Date.now() }],
      { messages: { heading: 'h', openSampleAriaLabel: 's {name}', openRecentAriaLabel: 'Open recent PDF, {name}', justNow: 'הרגע', pageCountOne: '1', pageCountOther: '{count}' } });
    const bdi = container.querySelector('button bdi');
    expect(bdi).not.toBeNull();
    expect(bdi.textContent).toBe('הרגע');
  });
});
