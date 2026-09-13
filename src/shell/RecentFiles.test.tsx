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

  // MERGE-13: a saved Merge draft resumes straight through a link, since the
  // tool restores its own draft on load - there is no handoff confirmation to
  // run first the way an ordinary recent *source* file needs (see
  // openRecent in FileDropzone.tsx).
  it('renders a merge draft as a plain link, with its page count and no busy/disabled state', () => {
    const onOpenRecent = vi.fn();
    mount([{
      tool: 'merge',
      fileName: 'invoice + 2 more',
      draft: true,
      href: '/merge/',
      pageCount: 7,
      savedAt: Date.now() - 60_000,
    }], { onOpenRecent, busy: true });

    // Not the ordinary cached-file button path.
    expect(container.querySelector('button')).toBeNull();
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/merge/');
    expect(link.textContent).toContain('invoice + 2 more');
    expect(link.textContent).toContain('Merge PDF');
    expect(link.textContent).toContain('7 pages');
    link.click();
    // A plain navigation link, not wired to the recent-file open handler.
    expect(onOpenRecent).not.toHaveBeenCalled();
  });

  it('omits the page count line when a draft has none yet', () => {
    mount([{ tool: 'merge', fileName: 'a.pdf', draft: true, href: '/merge/' }]);
    const link = container.querySelector('a');
    expect(link.textContent).not.toMatch(/page/);
  });

  it('falls back to /<tool>/ when a draft item carries no href', () => {
    mount([{ tool: 'merge', fileName: 'a.pdf', draft: true }]);
    expect(container.querySelector('a').getAttribute('href')).toBe('/merge/');
  });
});
