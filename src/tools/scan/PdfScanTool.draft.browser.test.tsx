import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { rotateQuad } from '#lib/pageEnhance/quad.ts';
import { turnedPins } from './lib/quad.ts';
import type { Pins } from './lib/edges/follow.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { loadDraft, readRecentFiles, saveDraft } from '#lib/drafts/draftStore.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, unmount, pick, pagesMade, pdfReady, openPage, tableTiles, byText, inViewer, checked, choose, step } = suite;
  type SavedPage = Record<string, unknown>;
  const savedDraft = async () => {
    const record = await loadDraft('scan-to-pdf');
    if (!record) throw new Error('Expected a saved draft');
    return record as typeof record & { pages: SavedPage[] };
  };

  describe('remembering the scan (SCAN-18)', () => {
    const remount = async () => {
      unmount();
      mount();
    };
    const draftLine = () => s.container.querySelector('[data-draft-status]')?.textContent;
    const saved = () => until(() => draftLine() === 'Draft saved');
    const restoreChecked = () => act(async () => {
      await loadDraft('scan-to-pdf');
      await drainPromises();
    });

    it('saves the pages and settings, and brings them back on the next visit', async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg', 0.04)]);
      await pagesMade(2);
      await openPage(2);
      await act(async () => { byText('Look')[0].click(); });
      await choose('Look', 'Original');
      await choose('Page size', 'A4');
      await saved();
      const record = await savedDraft();
      if (!record.files) throw new Error('Expected saved files');
      expect(record.files.map((f) => f.fileName)).toEqual(['a.jpg', 'b.jpg']);
      expect(record.pages.map((p) => p.filter)).toEqual(['document', 'original']);
      expect(record.pageSize).toBe('a4');

      document.documentElement.setAttribute('data-draft-hint', '1');
      await remount();
      await pagesMade(2);
      await pdfReady();
      expect(tableTiles()).toHaveLength(2);
      expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
      expect(draftLine()).toBeUndefined();
      await openPage(2);
      await act(async () => { byText('Look')[0].click(); });
      expect(checked('Look')).toBe('Original');
      expect(checked('Page size')).toBe('A4');
    });

    describe('pins', () => {
      const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
      const PINS: Pins = [[{ k: 7, at: { x: 0.5, y: 0.12 } }], [], [], []];
      const reopenWith = async (turns: number) => {
        mount();
        await pick([await photoOfPage('a.jpg')]);
        await pagesMade(1);
        await saved();
        const record = await savedDraft();
        await saveDraft('scan-to-pdf', {
          files: record.files, fileName: record.fileName, pageSize: record.pageSize, limit: record.limit, name: record.name,
          defaultFilter: record.defaultFilter, pageCount: 1, schemaVersion: record.schemaVersion,
          pages: [{ ...record.pages[0], turns, quad: QUAD, pins: PINS }],
        });
        await pdfReady();
        step('processPage').mockClear();
        await remount();
        await pagesMade(1);
        await pdfReady();
      };

      it('brings a page\'s pins back with its corners, and the warp is handed them', async () => {
        await reopenWith(0);
        const call = step('processPage').mock.calls.at(-1);
        expect(call?.[1]).toEqual(QUAD);
        expect(call?.[4]).toEqual(PINS);
      });

      it('hands the warp the pins turned with the page, in the side order of its turned corners', async () => {
        await reopenWith(1);
        const call = step('processPage').mock.calls.at(-1);
        expect(call?.[1]).toEqual(rotateQuad(QUAD, 1));
        expect(call?.[4]).toEqual(turnedPins(PINS, 1));
      });
    });

    it('keeps one Recents row for a scan that grows a page at a time', async () => {
      mount();
      await pick([await photoOfPage('a.jpg')]);
      await pagesMade(1);
      await saved();
      await pick([await photoOfPage('b.jpg', 0.04)]);
      await pagesMade(2);
      await saved();
      await pick([await photoOfPage('c.jpg', 0.02)]);
      await pagesMade(3);
      await until(() => readRecentFiles()[0]?.pageCount === 3);
      await saved();
      const rows = readRecentFiles();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ tool: 'scan-to-pdf', pageCount: 3 });
    });

    it('lets photos handed over from Image to PDF start a new scan, not join the remembered one', async () => {
      mount();
      await pick([await photoOfPage('a.jpg')]);
      await pagesMade(1);
      await saved();
      unmount();
      document.documentElement.setAttribute('data-handoff-pending', '1');
      try {
        mount();
        await until(() => s.container.querySelector('[data-empty-state]') !== null);
        await restoreChecked();
        expect(tableTiles()).toHaveLength(0);
      } finally {
        document.documentElement.removeAttribute('data-handoff-pending');
      }
    });

    it('forgets the scan once the last page is removed', async () => {
      mount();
      await pick([await photoOfPage('a.jpg')]);
      await pagesMade(1);
      await saved();
      await openPage(1);
      await act(async () => { inViewer('Remove')[0].click(); });
      await until(() => !(readRecentFiles()[0]?.hasWork ?? []).includes('scan-to-pdf'));
      await remount();
      await until(() => s.container.querySelector('[data-empty-state], [data-table-page]') !== null);
      await restoreChecked();
      expect(tableTiles()).toHaveLength(0);
      expect(s.container.querySelector('[data-empty-state]')).not.toBeNull();
    });
  });
});
