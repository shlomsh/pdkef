// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import pageGridStyles from '../../shell/PageGrid.module.css';
import { setInputFiles } from '../../test/setInputFiles.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

const { thumbState } = vi.hoisted(() => ({ thumbState: { deliverRest: null } }));

vi.mock('@cantoo/pdf-lib', () => {
  return {
    PDFDocument: {
      load: vi.fn(() => Promise.resolve({ getPageCount: () => 3 })),
    },
  };
});

// Deliver page 1's thumbnail synchronously and pages 2-3 only once the test
// explicitly calls `thumbState.deliverRest()`, so a user action can land in
// between - unlike PdfEditPagesTool.undo.test.tsx's mock, which resolves
// every thumbnail synchronously before any user action exists and so cannot
// see the "undo destroys later thumbnails" defect this file regression-tests.
vi.mock('../../lib/thumbnails.js', () => {
  return {
    renderPdfThumbnails: vi.fn((file, onPageRender) => {
      onPageRender(1, 'data:image/png;base64,thumb-1');
      return new Promise((resolve) => {
        thumbState.deliverRest = () => {
          onPageRender(2, 'data:image/png;base64,thumb-2');
          onPageRender(3, 'data:image/png;base64,thumb-3');
          resolve(3);
        };
      });
    }),
  };
});

vi.mock('./editPages.js', () => {
  return {
    editPages: vi.fn(() => Promise.resolve(new Blob(['modified-pdf-bytes'], { type: 'application/pdf' }))),
  };
});

describe('PdfEditPagesTool undo/redo vs. asynchronous thumbnails', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    thumbState.deliverRest = null;
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
    // Let the file-load microtasks settle; only page 1's thumbnail exists at
    // this point, matching the reproduction in the defect report.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function cards() {
    return container.querySelectorAll(`.${pageGridStyles['page-card']}`);
  }

  function hasThumb(pageNum) {
    const card = Array.from(cards()).find((c) => c.dataset.page === String(pageNum));
    return !!card.querySelector(`.${pageGridStyles['page-card-thumb']}`);
  }

  function toolbarButton(label) {
    const buttons = container.querySelectorAll(`.${pageGridStyles['grid-actions']} button`);
    return Array.from(buttons).find((b) => b.textContent === label);
  }

  function rotateButton(pageNum, direction) {
    return container.querySelector(`[aria-label="Rotate page ${pageNum} ${direction}"]`);
  }

  it('a thumbnail that finishes rendering after a commit survives an undo past that commit', async () => {
    await loadPdf();
    expect([hasThumb(1), hasThumb(2), hasThumb(3)]).toEqual([true, false, false]);

    // Rotate page 1 while pages 2 and 3 are still placeholders: the history
    // snapshot taken here holds thumbnails [thumb, null, null].
    await act(async () => {
      rotateButton(1, 'right').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(toolbarButton('Undo').disabled).toBe(false);

    // Pages 2 and 3 finish rendering only now, after the commit above.
    await act(async () => {
      thumbState.deliverRest();
      await Promise.resolve();
    });
    expect([hasThumb(1), hasThumb(2), hasThumb(3)]).toEqual([true, true, true]);

    // Undo the rotate. The thumbnails that arrived after the pre-rotation
    // snapshot must not be dropped along with it - they are not a user edit
    // and undo must not be able to take them away.
    await act(async () => {
      toolbarButton('Undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect([hasThumb(1), hasThumb(2), hasThumb(3)]).toEqual([true, true, true]);
  });
});
