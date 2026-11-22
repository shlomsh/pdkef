import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { reportToolLifecycleEvent } from '#lib/telemetry/productAnalytics.ts';
import { cacheRecentFile, saveDraft, saveHandoff } from '#lib/drafts/draftStore.ts';
import { answerNetwork, missedRequests } from '../support/network.browser.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from './browserToolHarness.ts';

answerNetwork();

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('installBrowserToolHarness', () => {
  let harness: BrowserToolHarness;
  beforeEach(async () => { harness = await installBrowserToolHarness(); });
  afterEach(async () => { await harness.restore(); });

  it('hands every test an empty IndexedDB and web storage', async () => {
    await saveHandoff('compress', { fileName: 'a.pdf', fileBytes: bytes('%PDF-1.4 a') });
    localStorage.setItem('left-behind', '1');
    await harness.restore();
    harness = await installBrowserToolHarness();
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
    expect((await harness.storedDraft('sign'))?.fileName).toBe('doc.pdf');
    expect(harness.recents().map((entry) => entry.fileName)).toEqual(['doc.pdf']);
    expect(await cacheRecentFile('redact', { fileName: 'other.pdf', fileBytes: bytes('%PDF-1.4 other') })).toBe(true);
    expect(harness.recents().map((entry) => entry.fileName).sort()).toEqual(['doc.pdf', 'other.pdf']);
  });

  it('records an error report from the real beacon that reached the network', async () => {
    reportError('pdf_tool_run', new Error('boom'), 'a_step');
    await harness.flush();
    expect(harness.beacons()).toHaveLength(1);
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'a_step' }]);
    expect(harness.usageEvents()).toEqual([]);
  });

  it('records usage events by name, in the order they were sent, and clears them', async () => {
    reportToolLifecycleEvent('tool_operation_failed', 'split');
    reportToolLifecycleEvent('tool_result_ready', 'split');
    await harness.flush();
    expect(harness.usageEvents().map((event) => event.name)).toEqual(['tool_operation_failed', 'tool_result_ready']);
    expect(harness.usageEvents('tool_operation_failed')).toHaveLength(1);
    expect(harness.reports()).toEqual([]);
    harness.clearBeacons();
    expect(harness.beacons()).toEqual([]);
  });

  it('waits on restore for a beacon still on its way, so none lands after the test', async () => {
    reportError('pdf_tool_run', new Error('late'), 'last_step');
    await harness.restore();
    expect(harness.reports()).toMatchObject([{ step: 'last_step' }]);
    expect(missedRequests()).toEqual([]);
    harness = await installBrowserToolHarness();
  });

  it('records the blobs the page turned into object URLs, and reads one back from its URL', async () => {
    const blob = new Blob(['x'], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    expect(url).toMatch(/^blob:http/);
    expect(harness.createdBlobs()).toEqual([blob]);
    const read = await harness.blobForUrl(url);
    expect(await read?.text()).toBe('x');
    expect(read?.type).toBe('application/pdf');
    expect(await harness.blobForUrl(`${location.origin}/no-such-blob`.replace('http', 'blob:http'))).toBeUndefined();
  });
});
