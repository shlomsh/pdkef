// Regression test for: SortableJS never attached because the <ul> it
// targets only renders once files are present, but the original effect
// had a `[]` dependency array and ran once on mount, before that <ul>
// existed. See CLAUDE.md history / "the dnd ordering of the files does
// not work" fix.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfMergeTool from './PdfMergeTool.jsx';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

describe('PdfMergeTool drag-to-reorder', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  it('attaches a Sortable instance to the file list once files are added', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfMergeTool />, container);
    });

    // No file list yet: Sortable.create must not have been called.
    expect(createSpy).not.toHaveBeenCalled();
    expect(container.querySelector('ul.file-list')).toBeNull();

    const input = container.querySelector('input[type="file"]');
    const files = [makePdfFile('a.pdf'), makePdfFile('b.pdf')];

    await act(async () => {
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // let async thumbnail/metadata promises settle
      await Promise.resolve();
    });

    const list = container.querySelector('ul.file-list');
    expect(list).not.toBeNull();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(list, expect.any(Object));
  });
});
