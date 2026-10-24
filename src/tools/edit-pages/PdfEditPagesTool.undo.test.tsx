// @ts-nocheck - test-only, mirrors PdfEditPagesTool.test.tsx's untyped style
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import Sortable from 'sortablejs';
import { reportEdit } from '../../lib/productAnalytics.ts';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { setInputFiles } from '../../test/setInputFiles.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

vi.mock('../../lib/productAnalytics.ts', async (importOriginal) => ({
  ...(await importOriginal()),
  reportEdit: vi.fn(),
}));

const { mockState } = vi.hoisted(() => ({ mockState: { numPages: 3 } }));

vi.mock('@cantoo/pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(() => Promise.resolve({
      getPageCount: () => mockState.numPages,
    })),
  },
}));

vi.mock('../../lib/thumbnails.js', () => ({
  openThumbnailSource: vi.fn(async (file) => ({
    file,
    pageCount: mockState.numPages,
    render: vi.fn(async (pageIndex) => `data:image/png;base64,fake-${pageIndex}`),
    destroy: vi.fn(async () => {}),
  })),
  renderThumbnail: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('./editPages.js', () => ({
  editPages: vi.fn(() => Promise.resolve(new Blob(['modified-pdf-bytes'], { type: 'application/pdf' }))),
}));

describe('PdfEditPagesTool undo/redo', () => {
  let container;

  beforeEach(() => {
    resetActionTrailForTests();
    reportEdit.mockClear();
  });

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
    act(() => { render(<PdfEditPagesTool />, container); });
    await act(async () => { setInputFiles(container.querySelector('input[type="file"]'), [makePdfFile('document.pdf')]); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  }

  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const order = () => cells().map((c) => c.dataset.key);
  const rotation = (index) => cells()[index].dataset.rotation ?? '0';
  const skipped = () => cells().map((c) => c.hasAttribute('data-skipped'));
  const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const undoButton = () => container.querySelector('[aria-label="Undo last change"]');
  const redoButton = () => container.querySelector('[aria-label="Redo last undone change"]');
  const bulkButton = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const rotateButton = (number) => container.querySelector(`[aria-label="Rotate page ${number}"]`);
  const skipButton = (number) => container.querySelector(`[aria-label="Skip page ${number}"], [aria-label="Include page ${number}"]`);
  const keydown = (init) => act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });

  it('DEBT-58: loading a file is not an edit; a rotate is, and an unchanged Include all is not', async () => {
    await loadPdf();
    expect(reportEdit).not.toHaveBeenCalled();

    await click(bulkButton('Include all'));
    expect(reportEdit).not.toHaveBeenCalled();

    await click(rotateButton(1));
    expect(reportEdit).toHaveBeenCalledWith('edit-pdf');
  });

  it('starts with Undo and Redo both disabled', async () => {
    await loadPdf();
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(true);
  });

  it('rotate, undo, redo: redo restores the rotation undo removed', async () => {
    await loadPdf();

    await click(rotateButton(1));
    expect(rotation(0)).toBe('90');
    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);

    await click(undoButton());
    expect(rotation(0)).toBe('0');
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);

    await click(redoButton());
    expect(rotation(0)).toBe('90');
    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);
  });

  it('records add, rotate, undo and redo in order (DEBT-31)', async () => {
    await loadPdf();
    await click(rotateButton(1));
    await click(undoButton());
    await click(redoButton());
    expect(recentActions()).toEqual(['add_files', 'rotate', 'undo', 'redo']);
  });

  it('a skip toggle round-trips through undo and redo', async () => {
    await loadPdf();

    await click(skipButton(2));
    expect(skipped()).toEqual([false, true, false]);

    await click(undoButton());
    expect(skipped()).toEqual([false, false, false]);

    await click(redoButton());
    expect(skipped()).toEqual([false, true, false]);
  });

  it('a reorder round-trips through undo and redo, restoring the full page order', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    await loadPdf();

    expect(createSpy).toHaveBeenCalledTimes(1);
    const options = createSpy.mock.calls[0][1];
    expect(order()).toEqual(['0:0', '0:1', '0:2']);

    await act(async () => { options.onEnd({ oldIndex: 0, newIndex: 2 }); });
    expect(order()).toEqual(['0:1', '0:2', '0:0']);
    expect(undoButton().disabled).toBe(false);

    await click(undoButton());
    expect(order()).toEqual(['0:0', '0:1', '0:2']);

    await click(redoButton());
    expect(order()).toEqual(['0:1', '0:2', '0:0']);
  });

  it('a new action after an undo clears the redo future', async () => {
    await loadPdf();

    await click(rotateButton(1));
    await click(undoButton());
    expect(redoButton().disabled).toBe(false);

    await click(rotateButton(2));
    expect(redoButton().disabled).toBe(true);
    expect(undoButton().disabled).toBe(false);
  });

  it('caps history depth: only the most recent 50 actions can be undone', async () => {
    await loadPdf();
    const btn = rotateButton(1);

    for (let i = 0; i < 55; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await click(btn);
    }
    // 55 quarter turns, kept in [0, 360).
    expect(rotation(0)).toBe(String((55 * 90) % 360));

    let undoCount = 0;
    for (let i = 0; i < 60; i += 1) {
      if (undoButton().disabled) break;
      // eslint-disable-next-line no-await-in-loop
      await click(undoButton());
      undoCount += 1;
    }

    expect(undoCount).toBe(50);
    // 55 turns, 50 undone: 5 turns' worth remain.
    expect(rotation(0)).toBe(String((5 * 90) % 360));
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);
  });

  // The shared hook Sign and Redact use (src/lib/history/useHistoryShortcuts.js)
  // is wired here too, so this tool gets the same two shortcuts. Shift+Cmd+Z
  // must redo rather than undo a second time.
  it('Cmd+Z undoes and Shift+Cmd+Z redoes', async () => {
    await loadPdf();

    await click(rotateButton(1));
    expect(rotation(0)).toBe('90');

    await keydown({ key: 'z', metaKey: true });
    expect(rotation(0)).toBe('0');

    await keydown({ key: 'z', metaKey: true, shiftKey: true });
    expect(rotation(0)).toBe('90');
  });

  it('leaves the shortcuts alone while focus is in an input', async () => {
    await loadPdf();

    await click(rotateButton(1));

    const checkbox = container.querySelector('input[type="checkbox"]');
    checkbox.focus();
    await keydown({ key: 'z', metaKey: true });
    expect(rotation(0)).toBe('90');
  });

  it('leaves the shortcuts alone while the output name is being renamed', async () => {
    await loadPdf();

    await click(rotateButton(1));

    const name = container.querySelector('[contenteditable]');
    name.tabIndex = -1;
    // jsdom does not implement isContentEditable
    Object.defineProperty(name, 'isContentEditable', { value: true });
    name.focus();
    await keydown({ key: 'z', metaKey: true });
    expect(rotation(0)).toBe('90');
  });

  // Regression for "two actions in one task swallow a history step": two
  // rotate clicks dispatched synchronously, in the same task, must push two
  // distinct undo steps rather than the same pre-rotation snapshot twice.
  it('two rotate clicks dispatched in one task produce two distinct undo steps', async () => {
    await loadPdf();
    const btn = rotateButton(1);

    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(rotation(0)).toBe('180');

    await click(undoButton());
    expect(rotation(0)).toBe('90');
    expect(undoButton().disabled).toBe(false);

    await click(undoButton());
    expect(rotation(0)).toBe('0');
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);
  });

  // Regression for the other half of the same defect: ordinary key
  // auto-repeat delivers two keydowns in one task, which the shortcut hook
  // does not suppress. Two undos must move two steps back, with canUndo and
  // canRedo correct afterwards - not one visible undo plus a dead redo step.
  it('two Cmd+Z keydowns dispatched in one task move two steps back', async () => {
    await loadPdf();
    const btn = rotateButton(1);

    await click(btn);
    await click(btn);
    expect(rotation(0)).toBe('180');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
    });
    expect(rotation(0)).toBe('0');
    expect(undoButton().disabled).toBe(true);
    expect(redoButton().disabled).toBe(false);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true }));
    });
    expect(rotation(0)).toBe('180');
    expect(undoButton().disabled).toBe(false);
    expect(redoButton().disabled).toBe(true);
  });

  // Regression for "bulk actions commit even when they change nothing":
  // "Include all" with nothing skipped must not push a history entry that
  // would light up Undo and then visibly do nothing when pressed.
  it('"Include all" with nothing skipped does not enable Undo', async () => {
    await loadPdf();

    await click(bulkButton('Include all'));
    expect(undoButton().disabled).toBe(true);
  });

  it('a second, redundant "Skip all" does not push a second history entry', async () => {
    await loadPdf();

    await click(bulkButton('Skip all'));
    expect(skipped()).toEqual([true, true, true]);
    expect(undoButton().disabled).toBe(false);

    // Every page is already skipped, so this second click changes nothing
    // and must not consume a second undo step.
    await click(bulkButton('Skip all'));

    await click(undoButton());
    // One undo is enough to get all the way back to nothing skipped.
    expect(skipped()).toEqual([false, false, false]);
    expect(undoButton().disabled).toBe(true);
  });
});
