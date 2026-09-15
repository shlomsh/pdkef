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
});
