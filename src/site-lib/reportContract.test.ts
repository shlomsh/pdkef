import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../api/report.ts';
import {
  reportError,
  resetErrorReportingForTests,
  setReportingEnabledForTests,
} from '../lib/errorReport.ts';
import { reportToolLifecycleEvent, resetUsageEventsForTests } from '../lib/productAnalytics.ts';

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
  vi.stubGlobal('document', {
    querySelector: () => ({ getAttribute: () => '08e10cf' }),
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
    ['a string throw', 'boom', 'redact|export|non_error|string|-|08e10cf|other'],
    ['an error with no frame of ours', new DOMException('x', 'NotReadableError'), 'redact|export|no_frame|DOMException|NotReadableError|08e10cf|other'],
    ['an ignored name', aborted, 'redact|export|ignored|DOMException|AbortError|08e10cf|other'],
    ['the encrypted-file error under a minified name', encrypted, 'redact|export|encrypted|Error|EncryptedPDFError|08e10cf|other'],
  ])('%s is counted as a drop record', async (_what, thrown, field) => {
    reportError('redact', thrown, 'export');
    const commands = await deliver();
    expect(counted(commands, 'drops:')).toEqual([field]);
    expect(counted(commands, 'rejects:')).toEqual([]);
  });

  it('a usage event is counted with its build', async () => {
    reportToolLifecycleEvent('tool_operation_failed', 'redact');
    expect(counted(await deliver(), 'usage:')).toEqual(['tool_operation_failed|redact|08e10cf']);
  });
});
