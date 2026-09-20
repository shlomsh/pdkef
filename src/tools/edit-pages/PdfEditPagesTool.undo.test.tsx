// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import pageGridStyles from '../../shell/PageGrid.module.css';
import { setInputFiles } from '../../test/setInputFiles.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 3 } }));

vi.mock('@cantoo/pdf-lib', () => {
  return {
    PDFDocument: {
      load: vi.fn(() => Promise.resolve({
        getPageCount: () => mockState.numPages,
      })),
    },
  };
});

vi.mock('../../lib/thumbnails.js', () => {
  return {
    renderPdfThumbnails: vi.fn((file, onPageRender) => {
      for (let i = 1; i <= mockState.numPages; i++) {
        onPageRender(i, `data:image/png;base64,fake-thumbnail-${i}`);
      }
      return Promise.resolve(mockState.numPages);
    }),
  };
});

vi.mock('./editPages.js', () => {
  return {
    editPages: vi.fn(() => Promise.resolve(new Blob(['modified-pdf-bytes'], { type: 'application/pdf' }))),
  };
});

describe('PdfEditPagesTool undo/redo', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    mockState.numPages = 3;
    vi.restoreAllMocks();
  });

  async function loadPdf() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfEditPagesTool />, container);
    });
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [makePdfFile('document.pdf')]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  function cards() {
    return container.querySelectorAll(`.${pageGridStyles['page-card']}`);
  }

  function toolbarButton(label) {
    const buttons = container.querySelectorAll(`.${pageGridStyles['grid-actions']} button`);
    return Array.from(buttons).find((b) => b.textContent === label);
  }

  function rotateButton(pageNum, direction) {
    return container.querySelector(`[aria-label="Rotate page ${pageNum} ${direction}"]`);
  }

  function thumbTransform(pageNum) {
    const card = Array.from(cards()).find((c) => c.dataset.page === String(pageNum));
    const img = card.querySelector(`.${pageGridStyles['page-card-thumb']}`);
    return img ? img.style.transform : null;
  }

  it('starts with Undo and Redo both disabled', async () => {
    await loadPdf();
    expect(toolbarButton('Undo').disabled).toBe(true);
    expect(toolbarButton('Redo').disabled).toBe(true);
  });

  it('rotate, undo, redo: redo restores the rotation undo removed', async () => {
    await loadPdf();

    await act(async () => {
      rotateButton(1, 'right').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(90deg)');
    expect(toolbarButton('Undo').disabled).toBe(false);
    expect(toolbarButton('Redo').disabled).toBe(true);

    await act(async () => {
      toolbarButton('Undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(0deg)');
    expect(toolbarButton('Undo').disabled).toBe(true);
    expect(toolbarButton('Redo').disabled).toBe(false);

    await act(async () => {
      toolbarButton('Redo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(90deg)');
    expect(toolbarButton('Undo').disabled).toBe(false);
    expect(toolbarButton('Redo').disabled).toBe(true);
  });

  it('a removal toggle round-trips through undo and redo', async () => {
    await loadPdf();

    await act(async () => {
      cards()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cards()[1].className).toContain(pageGridStyles['is-removed']);

    await act(async () => {
      toolbarButton('Undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cards()[1].className).not.toContain(pageGridStyles['is-removed']);

    await act(async () => {
      toolbarButton('Redo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(cards()[1].className).toContain(pageGridStyles['is-removed']);
  });

  it('a reorder round-trips through undo and redo, restoring the full page-number order', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    await loadPdf();

    expect(createSpy).toHaveBeenCalledTimes(1);
    const options = createSpy.mock.calls[0][1];

    const orderOf = () => Array.from(cards()).map((c) => c.dataset.page);
    expect(orderOf()).toEqual(['1', '2', '3']);

    await act(async () => {
      options.onEnd({ oldIndex: 0, newIndex: 2 });
    });
    expect(orderOf()).toEqual(['2', '3', '1']);
    expect(toolbarButton('Undo').disabled).toBe(false);

    await act(async () => {
      toolbarButton('Undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(orderOf()).toEqual(['1', '2', '3']);

    await act(async () => {
      toolbarButton('Redo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(orderOf()).toEqual(['2', '3', '1']);
  });

  it('a new action after an undo clears the redo future', async () => {
    await loadPdf();

    await act(async () => {
      rotateButton(1, 'right').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      toolbarButton('Undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toolbarButton('Redo').disabled).toBe(false);

    await act(async () => {
      rotateButton(2, 'left').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toolbarButton('Redo').disabled).toBe(true);
    expect(toolbarButton('Undo').disabled).toBe(false);
  });

  it('caps history depth: only the most recent 50 actions can be undone', async () => {
    await loadPdf();
    const btn = rotateButton(1, 'right');

    for (let i = 0; i < 55; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    expect(thumbTransform(1)).toContain(`rotate(${55 * 90}deg)`);

    let undoCount = 0;
    for (let i = 0; i < 60; i += 1) {
      const undoBtn = toolbarButton('Undo');
      if (undoBtn.disabled) break;
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        undoBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      undoCount += 1;
    }

    expect(undoCount).toBe(50);
    // 55 rotations of +90deg, 50 undone: 5 rotations' worth remain (450deg).
    expect(thumbTransform(1)).toContain(`rotate(${5 * 90}deg)`);
    expect(toolbarButton('Undo').disabled).toBe(true);
    expect(toolbarButton('Redo').disabled).toBe(false);
  });

  // The shared hook Sign and Redact use (src/lib/history/useHistoryShortcuts.js)
  // is wired here too, so this tool gets the same two shortcuts. Shift+Cmd+Z
  // must redo rather than undo a second time.
  it('Cmd+Z undoes and Shift+Cmd+Z redoes', async () => {
    await loadPdf();

    await act(async () => {
      rotateButton(1, 'right').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(90deg)');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(0deg)');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(90deg)');
  });

  it('leaves the shortcuts alone while focus is in an input', async () => {
    await loadPdf();

    await act(async () => {
      rotateButton(1, 'right').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const checkbox = container.querySelector('input[type="checkbox"]');
    checkbox.focus();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });
    expect(thumbTransform(1)).toContain('rotate(90deg)');
  });
});
