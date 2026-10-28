// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { cacheRecentFile, saveDraft, saveHandoff } from '#lib/drafts/draftStore.ts';
import { installToolHarness, type ToolHarness } from './toolHarness.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('installToolHarness', () => {
  let harness: ToolHarness;
  beforeEach(() => { harness = installToolHarness({ trackIndexedDb: true }); });
  afterEach(() => { harness.restore(); });

  it('hands every test a fresh IndexedDB and empty web storage', async () => {
    await saveHandoff('compress', { fileName: 'a.pdf', fileBytes: bytes('%PDF-1.4 a') });
    localStorage.setItem('left-behind', '1');
    harness.restore();
    harness = installToolHarness();
    expect(await harness.takeHandoff('compress')).toBeNull();
    expect(localStorage.getItem('left-behind')).toBeNull();
  });

  it('reads a hand-off back through the real store, and takes it only once', async () => {
    expect(await saveHandoff('sign', { fileName: 'out.pdf', fileBytes: bytes('%PDF-1.4 out') })).toBe(true);
    expect((await harness.takeHandoff('sign'))?.fileName).toBe('out.pdf');
    expect(await harness.takeHandoff('sign')).toBeNull();
  });

  it('reads a saved draft and the recents index back', async () => {
    expect(await saveDraft('sign', { fileName: 'doc.pdf', fileBytes: bytes('%PDF-1.4 doc') })).toBe(true);
    const draft = await harness.storedDraft('sign');
    expect(draft?.fileName).toBe('doc.pdf');
    expect(harness.recents().map((entry) => entry.fileName)).toEqual(['doc.pdf']);
    expect(await cacheRecentFile('redact', { fileName: 'other.pdf', fileBytes: bytes('%PDF-1.4 other') })).toBe(true);
    expect(harness.recents().map((entry) => entry.fileName).sort()).toEqual(['doc.pdf', 'other.pdf']);
  });

  it('records an error report instead of sending it', async () => {
    reportError('pdf_tool_run', new Error('boom'), 'a_step');
    await harness.flush();
    expect(harness.beacons()).toHaveLength(1);
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'a_step' }]);
    expect(harness.usageEvents()).toEqual([]);
  });

  it('records usage events by name, and clears them', async () => {
    reportToolLifecycleEvent('tool_operation_failed', 'split');
    reportToolLifecycleEvent('tool_result_ready', 'split');
    await harness.flush();
    expect(harness.usageEvents('tool_operation_failed')).toHaveLength(1);
    expect(harness.usageEvents()).toHaveLength(2);
    expect(harness.reports()).toEqual([]);
    harness.clearBeacons();
    expect(harness.beacons()).toEqual([]);
  });

  it('records the blobs passed to URL.createObjectURL', () => {
    const blob = new Blob(['x']);
    expect(URL.createObjectURL(blob)).toMatch(/^blob:/);
    const url = URL.createObjectURL(blob);
    expect(harness.createdBlobs()).toEqual([blob, blob]);
    expect(harness.blobForUrl(url)).toBe(blob);
    expect(harness.blobForUrl('blob:unknown')).toBeUndefined();
  });

  describe('settle', () => {
    it('waits for IndexedDB work a test left running, so nothing lands after the test is torn down', async () => {
      let finished = false;
      // Not awaited: this is the draft restore a mounted island starts and a short test never waits for.
      void harness.takeHandoff('sign').then(() => { finished = true; });
      expect(finished).toBe(false);
      await harness.settle();
      expect(finished).toBe(true);
    });

    it('waits for a read that continues into a second transaction', async () => {
      await saveHandoff('sign', { fileName: 'out.pdf', fileBytes: bytes('%PDF-1.4 out') });
      let taken: string | undefined;
      // takeHandoff reads the record, then deletes it in a later transaction.
      void harness.takeHandoff('sign').then((record) => { taken = record?.fileName; });
      await harness.settle();
      expect(taken).toBe('out.pdf');
      expect(await harness.takeHandoff('sign')).toBeNull();
    });

    it('keeps waiting while a connection stays open, however slow the work on it is', async () => {
      let closed = false;
      const request = indexedDB.open('slow-work');
      request.onsuccess = () => { setTimeout(() => { request.result.close(); closed = true; }, 30); };
      await harness.settle();
      expect(closed).toBe(true);
    });

    it('returns at once when nothing is running', async () => {
      await harness.settle();
    });
  });

  it('puts the global beacon back on restore', () => {
    const recording = navigator.sendBeacon;
    harness.restore();
    expect(navigator.sendBeacon).not.toBe(recording);
  });
});
