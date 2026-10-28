import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/report.ts';
import {
  reportError,
  resetErrorReportingForTests,
  setReportingEnabledForTests,
} from '#lib/telemetry/errorReport.ts';
import { beaconMaintenanceTransport, reportMaintenanceEvent } from '#lib/telemetry/maintenanceTelemetry.ts';
import { reportToolLifecycleEvent, resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';

// DEBT-44: the browser's real output, through the real endpoint. Each side has its own tests against
// the shared schemas; this one proves that what the browser sends is what the endpoint stores, so a
// change on one side cannot silently turn the other's traffic into nothing.

// No @types/node in this repo; vitest runs this file under Node.
declare const process: { env: Record<string, string | undefined> };

const beacons: Blob[] = [];

const deliver = async (): Promise<unknown[][]> => {
  const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(JSON.stringify([{ result: 2 }, { result: 1 }]), { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
  for (const blob of beacons.splice(0)) {
    await POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: await blob.text() }));
  }
  return fetchSpy.mock.calls.flatMap(([, init]) => JSON.parse(init.body as string) as unknown[][]);
};

const counted = (commands: unknown[][], prefix: string) =>
  commands.filter(([name, key]) => name === 'HINCRBY' && String(key).startsWith(prefix)).map(([, , field]) => field);

beforeEach(() => {
  process.env.KV_REST_API_URL = 'https://store.invalid';
  process.env.KV_REST_API_TOKEN = 'test-token';
  vi.stubGlobal('navigator', {
    onLine: true,
    sendBeacon: (_url: string, blob: Blob) => (beacons.push(blob), true),
  });
  vi.stubGlobal('performance', { getEntriesByType: () => [{ serverTiming: [{ name: 'build', description: '08e10cf' }] }] });
  vi.stubGlobal('document', {
    documentElement: { className: '' },
  });
  setReportingEnabledForTests(true);
  resetErrorReportingForTests();
  resetUsageEventsForTests();
});

afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  vi.unstubAllGlobals();
  setReportingEnabledForTests(false);
  beacons.length = 0;
});

describe('what the browser sends is what the endpoint stores (DEBT-44)', () => {
  it('a report from our own code is counted under errors:<day>', async () => {
    const error = new TypeError('x');
    error.stack = 'TypeError: x\n    at f (https://pdkef.com/_astro/PdfRedactTool.Ab12Cd.js:1:2)';
    reportError('redact', error, 'export');
    const fields = counted(await deliver(), 'errors:');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatch(/^redact\|TypeError\|PdfRedactTool\.Ab12Cd\.js:1:2\|export\|/);
  });

  const encrypted = new Error('Input document to `PDFDocument.load` is encrypted');
  encrypted.name = 'fm';
  const aborted = new DOMException('x', 'AbortError');
  // The beacon carries no user agent here, so the engine bucket is `other`.
  it.each([
    ['a string throw', 'boom', 'redact|export|non_error|string|-|08e10cf|other|-'],
    ['an error with no frame of ours', new DOMException('x', 'NotReadableError'), 'redact|export|no_frame|DOMException|NotReadableError|08e10cf|other|file_read'],
    ['a chunk that did not load (DEBT-57)', new TypeError('Importing a module script failed.'), 'redact|export|no_frame|TypeError|-|08e10cf|other|module_load'],
    ['an ignored name', aborted, 'redact|export|ignored|DOMException|AbortError|08e10cf|other|other'],
    ['the encrypted-file error under a minified name', encrypted, 'redact|export|encrypted|Error|EncryptedPDFError|08e10cf|other|other'],
  ])('%s is counted as a drop record', async (_what, thrown, field) => {
    reportError('redact', thrown, 'export');
    const commands = await deliver();
    expect(counted(commands, 'drops:')).toEqual([field]);
    expect(counted(commands, 'rejects:')).toEqual([]);
  });

  it('an sw_install failure sent through the beacon is counted under events:<day> (MEM-24)', async () => {
    reportMaintenanceEvent(
      { name: 'sw_install', properties: { outcome: 'failure', reason: 'root_mismatch', missed: '0' } },
      beaconMaintenanceTransport,
    );
    const commands = await deliver();
    expect(counted(commands, 'events:')).toEqual(['sw_install|failure|root_mismatch|0|other']);
    expect(counted(commands, 'rejects:')).toEqual([]);
  });

  it('a usage event is counted with its build', async () => {
    reportToolLifecycleEvent('tool_operation_failed', 'redact');
    expect(counted(await deliver(), 'usage:')).toEqual([
      'tool_operation_failed|redact|08e10cf',
      'pg:tool_operation_failed|redact|-|-|-|-',
    ]);
  });

  it('a first event with a source and a page view with a visit are counted with their pg field (DEBT-58)', async () => {
    const post = (properties: object, name: string) =>
      POST(new Request('https://pdkef.com/api/report', { method: 'POST', body: JSON.stringify({ name, properties }) }));
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify([{ result: 2 }, { result: 1 }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await post({ tool: 'sign', build: '08e10cf', first: true, source: 'handoff', from: 'merge' }, 'tool_file_accepted');
    await post({ tool: 'sign', first: true, visit: 'week' }, 'tool_page_viewed');
    const commands = fetchSpy.mock.calls.flatMap(([, init]) => JSON.parse(init.body as string) as unknown[][]);
    expect(counted(commands, 'usage:')).toEqual([
      'tool_file_accepted|sign|08e10cf|handoff',
      'pg:tool_file_accepted|sign|handoff|merge|-|-',
      'tool_page_viewed|sign',
      'pg:tool_page_viewed|sign|-|-|-|week',
    ]);
  });
});
