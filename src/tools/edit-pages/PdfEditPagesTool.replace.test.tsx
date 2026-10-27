import { render, options } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { buildPdf, healthy } from '../../test/support/pdfPageTreeFixtures.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';

// A real three-page PDF, or a two-page one.
const pdf = (name: string, bytes: Uint8Array = healthy()) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
const twoPages = () => buildPdf({
  1: '<< /Type /Catalog /Pages 2 0 R >>',
  2: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 500] >>',
  4: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 500] >>',
});
// Preact routes an error thrown in an effect cleanup to its mangled `options.__e`.
const preactOptions = options as typeof options & { __e: (err: unknown, ...rest: unknown[]) => unknown };
let container: HTMLElement | null = null;
const cells = () => container!.querySelectorAll('ul[data-page-grid] > li[data-key]');
// Waits for the grid of the file called `name` to be drawn.
const settle = (name: string) => until(() => cells().length > 0 && container!.querySelector('#page-grid-heading')?.textContent?.includes(`${name}_modified.pdf`));

describe('PdfEditPagesTool replace file', () => {
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness();
    // jsdom's Blob has no arrayBuffer().
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer() {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    harness.restore();
  });

  // Production crash: sortablejs destroy() does `el[expando] = null` and throws
  // once the grid element is gone. Emulate that and replace the file.
  it('replacing the loaded file does not throw from Sortable.destroy on a detached grid', async () => {
    // Preact routes an error thrown in an effect cleanup to options.__e.
    const errors: unknown[] = [];
    const prevCatch = preactOptions.__e;
    preactOptions.__e = (err, ...rest) => {
      errors.push(err);
      return prevCatch(err, ...rest);
    };
    const realDestroy = Sortable.prototype.destroy;
    vi.spyOn(Sortable.prototype, 'destroy').mockImplementation(function (this: Sortable) {
      if (!this.el.isConnected) {
        const err = new TypeError("Cannot set properties of null (setting 'sortable')");
        throw err;
      }
      return realDestroy.call(this);
    });
    const onError = (e: ErrorEvent) => errors.push(e.error ?? e.message);
    window.addEventListener('error', onError);

    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfEditPagesTool />, container!));
    await act(async () => setInputFiles(container!.querySelector('input[type="file"]'), [pdf('a.pdf')]));
    await settle('a');
    expect(cells().length).toBe(3);

    await act(async () => setInputFiles(container!.querySelector('input[type="file"]'), [pdf('b.pdf')]));
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    const confirm = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Replace file');
    await act(async () => confirm!.click());
    await settle('b');

    window.removeEventListener('error', onError);
    preactOptions.__e = prevCatch;
    expect(errors).toEqual([]);
    expect(cells().length).toBe(3);
    expect(container.querySelector('#page-grid-heading').textContent).toContain('b_modified.pdf');
  });

  it('a new file starts fresh: its own name, its own pages, and nothing to undo', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfEditPagesTool />, container!));
    await act(async () => setInputFiles(container!.querySelector('input[type="file"]'), [pdf('a.pdf')]));
    await settle('a');
    await act(async () => container!.querySelector('[aria-label="Skip page 1"]').click());
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Undo last change"]').disabled).toBe(false);

    await act(async () => setInputFiles(container!.querySelector('input[type="file"]'), [pdf('b.pdf', twoPages())]));
    const dialog = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    await act(async () => Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Replace file')!.click());
    await settle('b');

    expect(cells().length).toBe(2);
    expect(Array.from(cells()).some((c) => c.hasAttribute('data-skipped'))).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Undo last change"]').disabled).toBe(true);
  });
});
