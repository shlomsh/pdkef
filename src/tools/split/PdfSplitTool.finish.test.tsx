import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { HeldFile } from '../../test/support/heldFile.ts';
import { buildSplit } from './lib/splitOutput.ts';
import { fivePages, fixtureFile, pagesOf, waitUntil, useSplitTool } from './components/splitTool.test-helper.tsx';

vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('./lib/splitOutput.ts', { spy: true });

const SLOW_QUIET = { baseMs: 60000, stepMs: 0, maxMs: 60000, burstWindowMs: 1 };
const FIVE_NAMES = ['open-page-1.pdf', 'open-page-2.pdf', 'open-page-3.pdf', 'open-page-4.pdf', 'open-page-5.pdf'];

describe('PdfSplitTool finish', () => {
  const s = useSplitTool();

  let installedShare: ReturnType<typeof mockNativeFileShare> | undefined;
  afterEach(() => {
    installedShare?.restore();
    installedShare = undefined;
    vi.mocked(probeEncryption).mockReset();
    vi.restoreAllMocks();
  });

  const nameOf = (payload: unknown) =>
    typeof payload === 'object' && payload !== null && 'name' in payload && typeof payload.name === 'string' ? payload.name : undefined;
  const beaconNames = () => s.harness.beacons().map((beacon) => nameOf(beacon.payload));
  const sharedFiles = () => {
    const [shared] = installedShare?.share.mock.calls[0] as unknown as [ShareData];
    return shared.files ?? [];
  };

  it('One PDF per page builds and saves one named, one-page file for each kept page only', async () => {
    await s.open();
    await s.type('2, 4');
    await s.click(s.radio('One PDF per page'));
    await s.readyWith('Download 2 PDFs');
    expect(s.headingText()).toContain('2 PDFs');
    expect(s.downloadText()).toContain('Download 2 PDFs');

    await s.click(s.downloadElement());
    await s.delivered(2);
    expect(s.saved.map((part) => part.name)).toEqual(['open-page-2.pdf', 'open-page-4.pdf']);
    expect(await Promise.all(s.saved.map(async (part) => (await pagesOf(part.blob as Blob)).count))).toEqual([1, 1]);
  });

  it('Download in One PDF per page saves every part, once each', async () => {
    await s.open();
    await s.click(s.radio('One PDF per page'));
    await s.readyWith('Download 5 PDFs');
    await s.click(s.downloadElement());
    await s.delivered(5);
    expect(s.saved.map((part) => part.name)).toEqual(FIVE_NAMES);
    expect(s.downloadElement().dataset.state).toBe('saved');
  });

  it('shares every part as native files in One PDF per page, and offers Share only', async () => {
    installedShare = mockNativeFileShare();
    await s.open();
    await s.click(s.radio('One PDF per page'));
    await waitUntil(() => expect(s.findButton('Share')).toBeDefined());
    expect(s.findButton('Compress')).toBeUndefined();
    expect(s.findButton('Sign')).toBeUndefined();
    await s.click(s.button('Share'));
    await waitUntil(() => expect(installedShare?.share).toHaveBeenCalledTimes(1));
    expect(sharedFiles().map((file) => file.name)).toEqual(FIVE_NAMES);
  });

  it('Share appears once the output is ready, not before and not only after a first save, and shares it', async () => {
    installedShare = mockNativeFileShare();
    const file = new HeldFile(new Uint8Array(await fivePages()), 'open.pdf', { held: false });
    s.mount({ quietPolicy: SLOW_QUIET });
    await s.pick(file);
    await waitUntil(() => {
      expect(s.cells()).not.toHaveLength(0);
      expect(s.downloadElement().dataset.state).toBe('ready');
    });
    file.hold();
    await act(async () => { s.downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    await file.started;
    expect(buildSplit).toHaveBeenCalledTimes(1);
    expect(s.findButton('Share')).toBeUndefined();
    expect(s.button('Compress')).toHaveProperty('disabled', true);
    expect(s.button('Sign')).toHaveProperty('disabled', true);

    file.release();
    await waitUntil(() => {
      expect(s.downloadElement().dataset.state).toBe('ready');
      expect(s.downloadElement().hasAttribute('href')).toBe(true);
      expect(s.findButton('Share')).toBeDefined();
    });
    expect(installedShare.share).not.toHaveBeenCalled();
    await s.click(s.button('Share'));
    await waitUntil(() => expect(installedShare?.share).toHaveBeenCalledTimes(1));
  });

  describe('the hand-offs in One PDF', () => {
    it.each([['Compress', '/compress/', 'compress'], ['Sign', '/sign/', 'sign']] as const)('%s takes the extracted file', async (label, href, tool) => {
      const navigate = vi.fn();
      await s.open({ navigate });
      await s.click(s.skipButton(1));
      await s.readyWith('4 pages');
      await waitUntil(() => expect(s.button(label)).toHaveProperty('disabled', false));
      expect(s.findButton('Share')).toBeUndefined();
      await s.click(s.button(label));
      await waitUntil(() => expect(navigate).toHaveBeenCalledWith(href));
      const otherTool = tool === 'compress' ? 'sign' : 'compress';
      expect(await s.harness.takeHandoff(otherTool)).toBeNull();
      const handoff = await s.harness.takeHandoff(tool);
      expect(handoff?.fileName).toBe('extracted_open.pdf');
      expect((await pagesOf(new Blob([handoff?.fileBytes ?? new ArrayBuffer(0)]))).count).toBe(4);
      expect(navigate).toHaveBeenCalledWith(href);
    });
  });

  it('a build that fails says so on the Download element and counts as a failed operation', async () => {
    // Forced: the probe answers open for this owner-only file, so the split itself meets its protection (no real file reads
    // as unencrypted to pdf.js yet encrypted to pdf-lib; a broken header or a dangling /Encrypt did not give one).
    vi.mocked(probeEncryption).mockResolvedValueOnce('open');
    s.mount();
    await s.pick(fixtureFile('owner-restricted', 'locked.pdf'));
    await waitUntil(() => expect(s.downloadElement().dataset.state).toBe('error'));
    await s.harness.flush();
    expect(s.container.querySelector('[role="alert"] a[href="/unlock/"]')).not.toBeNull();
    expect(s.harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'prepare_split', type: 'Error' }]);
    expect(await s.events('tool_operation_failed')).toBe(1);
  });

  describe('usage events (DEBT-46)', () => {
    it('reports no start for the background prepare after a change', async () => {
      await s.open();
      await s.click(s.skipButton(1));
      await s.readyWith('4 pages');
      await s.click(s.radio('One PDF per page'));
      await s.readyWith('1 page each');
      expect(await s.events('tool_operation_started')).toBe(0);
      expect(await s.events('tool_result_ready')).toBe(0);
    });

    it('reports an edit when the person changes a page or the mode, not on arrival (DEBT-58)', async () => {
      const firstEdits = () => s.harness.usageEvents('tool_first_edit').map((event) => event.properties.tool);
      const freshOpen = async () => {
        s.unmount();
        s.harness.resetUsage();
        s.harness.clearBeacons();
        await s.open();
        await s.harness.flush();
      };
      await s.open();
      await s.harness.flush();
      expect(firstEdits()).toEqual([]);
      await s.click(s.skipButton(1));
      expect(firstEdits()).toEqual(['split']);
      await freshOpen();
      expect(firstEdits()).toEqual([]);
      await s.type('1-2');
      expect(firstEdits()).toEqual(['split']);
      await freshOpen();
      expect(firstEdits()).toEqual([]);
      await s.click(s.radio('One PDF per page'));
      expect(firstEdits()).toEqual(['split']);
    });

    it('reports started then ready for a Download tap, again after a change', async () => {
      await s.open();
      await s.click(s.downloadElement());
      await waitUntil(() => expect(s.harness.usageEvents('tool_result_ready')).toHaveLength(1));
      expect(await s.events('tool_operation_started')).toBe(1);
      expect(await s.events('tool_result_ready')).toBe(1);
      await s.click(s.skipButton(1));
      await s.readyWith('4 pages');
      expect(await s.events('tool_operation_started')).toBe(1);
      await s.click(s.downloadElement());
      await waitUntil(() => expect(s.harness.usageEvents('tool_result_ready')).toHaveLength(2));
      expect(await s.events('tool_operation_started')).toBe(2);
      expect(await s.events('tool_result_ready')).toBe(2);
    });

    it('reports started at a tap while preparing and ready once the queued download is delivered', async () => {
      await s.open({ quietPolicy: SLOW_QUIET });
      expect(s.downloadElement().dataset.state).toBe('ready');
      act(() => { s.downloadElement().click(); });
      expect(s.downloadElement().dataset.state).toBe('preparing');
      const atTap = s.harness.beacons().length;
      await s.harness.flush();
      const atTapNames = beaconNames().slice(0, atTap);
      expect(atTapNames.filter((name) => name === 'tool_operation_started')).toHaveLength(1);
      expect(atTapNames.filter((name) => name === 'tool_result_ready')).toHaveLength(0);
      await s.delivered(1);
      expect(await s.events('tool_result_ready')).toBe(1);
    });
  });
});
