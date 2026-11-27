import { options } from 'preact';
import Sortable from 'sortablejs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { openThumbnailSource } from '#lib/pdf/thumbnails.js';
import { editPages } from './lib/editPages.js';
import { encryptedFixture, pagesOf, pdf, twoPages, useEditPagesTool, waitUntil } from './components/editPagesTool.test-helper.tsx';
import { noPagesKey, healthy, ORIGINAL_WIDTHS } from '../../test/support/pdfPageTreeFixtures.ts';
import { HeldFile } from '../../test/support/heldFile.ts';

vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });
vi.mock('./lib/editPages.js', { spy: true });

const preactOptions = options as typeof options & { __e: (err: unknown, ...rest: unknown[]) => unknown };

describe('PdfEditPagesTool opening a file', () => {
  const s = useEditPagesTool();
  const gridFiles = () => vi.mocked(openThumbnailSource).mock.calls.map(([file]) => file);

  beforeEach(() => {
    vi.mocked(sendHandoff).mockClear();
    vi.mocked(probeEncryption).mockClear();
    vi.mocked(openThumbnailSource).mockClear();
    vi.mocked(editPages).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('a protected PDF', () => {
    it.each([
      ['needs-password', 'needs-password', 'This PDF has a password'],
      ['owner-only', 'owner-restricted', 'This PDF is protected'],
    ] as const)('%s shows the unlock state with its kind and no page grid, and builds nothing', async (name, unlockKind, title) => {
      await s.load(encryptedFixture(name));
      await s.drain();

      expect(s.needsUnlock()?.getAttribute('data-needs-unlock')).toBe(unlockKind);
      expect(s.text()).toContain(title);
      expect(s.text()).toContain('edit it');
      expect(s.button('Unlock it')).toBeDefined();
      expect(s.container.querySelector('ul[data-page-grid]')).toBeNull();
      expect(s.text()).not.toMatch(/Could not edit|Undo|Download/);
      expect(editPages).not.toHaveBeenCalled();
      expect(s.harness.createdBlobs()).toHaveLength(0);
    });

    it('"Unlock it" parks the file for Unlock', async () => {
      await s.load(encryptedFixture('needs-password'));
      await s.click(s.button('Unlock it'));
      await waitUntil(() => expect(sendHandoff).toHaveBeenCalledTimes(1));
      await vi.mocked(sendHandoff).mock.results[0].value;

      expect(await s.harness.takeHandoff('unlock')).toMatchObject({ from: 'edit-pdf', fileName: 'needs-password.pdf' });
    });

    it('a normal file picked after a protected one shows the grid', async () => {
      await s.load(encryptedFixture('needs-password'));
      await s.replaceWith(encryptedFixture('plain'));
      await waitUntil(() => expect(s.cells().length).toBeGreaterThan(0));

      expect(s.needsUnlock()).toBeNull();
      expect(s.container.querySelector('ul[data-page-grid]')).not.toBeNull();
    });
  });

  describe('replacing the file', () => {
    it('does not throw from Sortable.destroy on a detached grid', async () => {
      const errors: unknown[] = [];
      // Preact hands every error from a render or an effect to this hook; the spy lets the real one run.
      const caught = vi.spyOn(preactOptions, '__e');
      const realDestroy = Sortable.prototype.destroy;
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: destroy throws on a detached grid in a browser, as it did in production; jsdom's real one does not
      vi.spyOn(Sortable.prototype, 'destroy').mockImplementation(function (this: Sortable) {
        if (!this.el.isConnected) throw new TypeError("Cannot set properties of null (setting 'sortable')");
        return realDestroy.call(this);
      });
      const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
      window.addEventListener('error', onError);
      try {
        await s.load(pdf('a.pdf'));
        expect(s.cells()).toHaveLength(3);
        await s.replaceWith(pdf('b.pdf'));
      } finally {
        window.removeEventListener('error', onError);
        errors.push(...caught.mock.calls.map(([err]) => err));
        caught.mockRestore();
      }

      expect(errors).toEqual([]);
      expect(s.cells()).toHaveLength(3);
      expect(s.heading()).toContain('b_modified.pdf');
    });

    it('starts the new file fresh: its own pages, none skipped, nothing to undo', async () => {
      await s.load(pdf('a.pdf'));
      await s.click(s.skipButton(1));
      expect(s.undo().disabled).toBe(false);

      await s.replaceWith(pdf('b.pdf', twoPages()));

      expect(s.cells()).toHaveLength(2);
      expect(s.skipped()).toEqual([false, false]);
      expect(s.undo().disabled).toBe(true);
    });
  });

  describe('a repaired file or a failed load', () => {
    it('hands the original File to the grid and the export when nothing was repaired', async () => {
      const original = pdf('document.pdf', healthy(), 1234);
      await s.load(original);
      await waitUntil(() => expect(openThumbnailSource).toHaveBeenCalled());
      expect(gridFiles()[0]).toBe(original);

      await s.prepareNow();
      await s.drain();
      expect(editPages).toHaveBeenCalledTimes(1);
      expect(vi.mocked(editPages).mock.calls[0][0]).toBe(original);
      expect(s.harness.createdBlobs()).toHaveLength(1);
      expect((await pagesOf(s.harness.createdBlobs()[0])).widths).toEqual(ORIGINAL_WIDTHS);
    });

    it('exports the file picked last when an earlier, slower load finishes after it', async () => {
      const first = new HeldFile(new Uint8Array(noPagesKey()), 'document.pdf');
      const second = pdf('second.pdf', twoPages(250, 350));
      s.mount();
      await s.pick(first);
      await first.started;
      await s.replaceWith(second);
      expect(s.cells()).toHaveLength(2);

      first.release();
      await waitUntil(() => expect(probeEncryption).toHaveBeenCalledTimes(2));
      await vi.mocked(probeEncryption).mock.results[1].value;
      await s.drain();
      await waitUntil(() => expect(openThumbnailSource).toHaveBeenCalled());

      expect(s.heading()).toContain('second_modified.pdf');
      expect(s.cells()).toHaveLength(2);
      await s.prepareNow();
      await s.drain();
      expect(s.harness.createdBlobs()).toHaveLength(1);
      expect((await pagesOf(s.harness.createdBlobs()[0])).widths).toEqual([250, 350]);
      expect(gridFiles().every((file) => file === second)).toBe(true);
    });

    it('shows the load error and opens no grid for a file that is not a PDF', async () => {
      await s.load(new File(['this is not a PDF'], 'document.pdf', { type: 'application/pdf', lastModified: 1234 }));
      await s.drain();

      expect(openThumbnailSource).not.toHaveBeenCalled();
      expect(s.container.querySelector('ul[data-page-grid]')).toBeNull();
      expect(s.text()).toContain('the file may be damaged');
    });

    it('a load failure still offers Replace file, which asks first', async () => {
      await s.load(new File(['this is not a PDF'], 'document.pdf', { type: 'application/pdf', lastModified: 1234 }));
      await s.click(s.button('Replace file'));
      // The dialog opening renders once more after the click's act scope; settle it inside act so no passive effect outlives the file.
      await s.drain();

      expect(s.replaceDialog().open).toBe(true);
    });
  });
});
