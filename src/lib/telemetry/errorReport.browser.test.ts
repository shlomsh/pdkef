import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders, worker } from '../../test/support/network.browser.ts';
import {
  MAX_DROPS_PER_PAGE,
  MAX_REPORTS_PER_PAGE,
  parseErrorReport,
  reportError,
  resetErrorReportingForTests,
  sendBeacon,
  setReportingEnabledForTests,
} from './errorReport.ts';
import { recordAction, resetActionTrailForTests } from './actionTrail.ts';
import { resetSinkForTests } from './analyticsSink.ts';

answerNetwork();

function errorAt(frame: string, message = 'boom', name?: string): Error {
  const e = new TypeError(message);
  if (name) e.name = name;
  e.stack = `${e.name}: ${message}\n    at f (https://pdkef.com/_astro/${frame})`;
  return e;
}

const REPORT = '/api/report';
const SINK_HOST = 'https://e.example.test';
const SINK = `${SINK_HOST}/i/v0/e/`;
const CONTROL = 'control_step';
const answered = () => new HttpResponse(null, { status: 204 });
const ANSWERS = Array.from({ length: 30 }, () => answered);

type Seen = ReturnType<typeof answerInTurn>;

async function settle(seen: Seen, marker = CONTROL) {
  let n = 0;
  let text: string;
  do {
    await seen.arrived(++n);
    text = await seen[n - 1]!.clone().text();
  } while (!text.includes(marker));
  return Promise.all(seen.slice(0, n - 1).map((request) => request.clone().json()));
}

const reportControl = () => reportError('drafts', errorAt('Control.js:1:1'), CONTROL);
const dropControl = () => reportError('redact', 'control', CONTROL);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetActionTrailForTests();
});

describe('reportError', () => {
  beforeEach(() => {
    setReportingEnabledForTests(true);
    resetErrorReportingForTests();
  });

  it('sends a repeated error once, as a body that parses back', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    const e = errorAt('A.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'save_draft');
    reportControl();
    const before = await settle(seen);
    expect(before).toHaveLength(1);
    expect(new URL(seen[0]!.url).pathname).toBe(REPORT);
    expect(sentHeaders(seen[0]!)).toEqual({ 'content-type': 'application/json' });
    expect(parseErrorReport(before[0])).toMatchObject({ area: 'drafts', name: 'TypeError', stack: ['A.js:1:2'], step: 'save_draft' });
  });
  it('carries exactly the recorded actions, oldest first', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    resetActionTrailForTests();
    recordAction('add_files');
    recordAction('clear_all');
    reportError('drafts', errorAt('Act.js:1:2'), 'save_draft');
    await seen.arrived(1);
    expect((await seen[0]!.json()).actions).toEqual(['add_files', 'clear_all']);
  });
  it('keeps two call sites over one throw site apart', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    const e = errorAt('S.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'load_draft');
    reportControl();
    const before = await settle(seen);
    expect(before.map((body) => body.step)).toEqual(['save_draft', 'load_draft']);
  });
  it('sends one defect once, even when it also escapes as uncaught', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    const e = errorAt('B.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('uncaught', e, 'save_draft');
    reportControl();
    const before = await settle(seen);
    expect(before).toHaveLength(1);
  });
  it('drops pdf.js cancellation as a report, leaving only a drop record', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    reportError('pdf_render', errorAt('C.js:1:2', 'x', 'RenderingCancelledException'), 'save_draft');
    reportControl();
    const before = await settle(seen);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ kind: 'dropped', reason: 'ignored' });
  });
  it('caps the total per page', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i++) reportError('drafts', errorAt(`A.js:${i + 1}:1`), 'save_draft');
    dropControl();
    const before = await settle(seen);
    expect(before).toHaveLength(MAX_REPORTS_PER_PAGE);
  });
  it('does nothing offline or outside production', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    // forced: a browser that reports it is offline cannot be put in that state on cue
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    reportError('drafts', errorAt('A.js:1:1'), 'save_draft');
    online.mockRestore();
    setReportingEnabledForTests(false);
    reportError('drafts', errorAt('A.js:1:1'), 'save_draft');
    setReportingEnabledForTests(true);
    reportControl();
    const before = await settle(seen);
    expect(before).toEqual([]);
  });
  it('sendBeacon returns false and posts nothing when offline', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    // forced: a browser that reports it is offline cannot be put in that state on cue
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(sendBeacon({ a: 1 })).toBe(false);
    online.mockRestore();
    expect(sendBeacon({ control: CONTROL })).toBe(true);
    const before = await settle(seen);
    expect(before).toEqual([]);
  });
  it('never throws', () => {
    // forced: a sendBeacon that throws cannot be produced on cue
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => reportError('drafts', errorAt('A.js:1:1'), 'save_draft')).not.toThrow();
  });
});

describe('reportError drop records (DEBT-44)', () => {
  beforeEach(() => {
    setReportingEnabledForTests(true);
    resetErrorReportingForTests();
  });
  it('sends a drop record for a string throw', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    reportError('redact', 'boom', 'export');
    reportControl();
    expect(await settle(seen)).toEqual([{ kind: 'dropped', area: 'redact', step: 'export', reason: 'non_error', type: 'string' }]);
  });
  it('sends a drop record for an Error with no built frame', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    const e = new DOMException('x', 'NotReadableError');
    e.stack = 'NotReadableError: x\n    at f (chrome-extension://abc/i.js:1:2)';
    reportError('redact', e, 'export');
    reportControl();
    expect(await settle(seen)).toMatchObject([{ kind: 'dropped', reason: 'no_frame', type: 'DOMException', name: 'NotReadableError' }]);
  });
  it('sends each distinct drop once per page', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    reportError('redact', 'a', 'export');
    reportError('redact', 'b', 'export');
    reportError('redact', 'c', 'other_step');
    reportControl();
    expect(await settle(seen)).toHaveLength(2);
  });
  it('caps drops per page', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    for (let i = 0; i < MAX_DROPS_PER_PAGE + 5; i++) reportError('redact', 's', `step_${String.fromCharCode(97 + i)}`);
    reportControl();
    expect(await settle(seen)).toHaveLength(MAX_DROPS_PER_PAGE);
  });
  it('still sends a drop record once the page has used its report cap', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    for (let i = 0; i < MAX_REPORTS_PER_PAGE; i++) reportError('drafts', errorAt(`A.js:${i + 1}:1`), 'save_draft');
    reportError('redact', 'boom', 'export');
    const before = await settle(seen, '"kind":"dropped"');
    expect(before).toHaveLength(MAX_REPORTS_PER_PAGE);
    expect(await seen.at(-1)!.json()).toMatchObject({ kind: 'dropped', area: 'redact', reason: 'non_error' });
  });
  it('sends no drop record for an uncaught error outside our code (extension noise has no failure to explain)', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    reportError('uncaught', 'boom', 'unhandled_rejection');
    reportControl();
    expect(await settle(seen)).toEqual([]);
  });
  it('sends nothing new for a deduplicated report', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    const e = errorAt('D.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'save_draft');
    reportControl();
    expect(await settle(seen)).toHaveLength(1);
  });
});

describe('error and drop counts go to the analytics sink only after the /api/report beacon (MEM-45)', () => {
  const order: string[] = [];
  const noteOrder = ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname;
    if (path === REPORT || path === '/i/v0/e/') order.push(path);
  };
  beforeEach(() => {
    order.length = 0;
    worker.events.on('request:start', noteOrder);
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', SINK_HOST);
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
    setReportingEnabledForTests(true);
    resetErrorReportingForTests();
    resetSinkForTests();
  });
  afterEach(() => {
    worker.events.removeListener('request:start', noteOrder);
  });

  it('an error report is one beacon to /api/report and one count to the sink, with no stack', async () => {
    const reports = answerInTurn('post', REPORT, ...ANSWERS);
    const sink = answerInTurn('post', SINK, ...ANSWERS);
    reportError('drafts', errorAt('SecretFrame.Zz9.js:1:2'), 'save_draft');
    reportControl();
    expect(await settle(reports)).toHaveLength(1);
    await sink.arrived(2);
    expect(order).toEqual([REPORT, '/i/v0/e/', REPORT, '/i/v0/e/']);
    expect(sentHeaders(sink[0]!)).toEqual({ 'content-type': 'text/plain' });
    const text = await sink[0]!.text();
    expect(JSON.parse(text)).toMatchObject({ event: 'error_reported', properties: { area: 'drafts', step: 'save_draft', error: 'TypeError' } });
    expect(text).not.toContain('SecretFrame');
  });
  it('no count when the /api/report beacon returns false', () => {
    // forced: a browser refusing the beacon hand-off cannot be produced on cue
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(false);
    reportError('drafts', errorAt('A.js:1:2'), 'save_draft');
    expect(beacon.mock.calls.map(([url]) => url)).toEqual([REPORT]);
  });
  it('a drop record sends one error_dropped', async () => {
    const reports = answerInTurn('post', REPORT, ...ANSWERS);
    const sink = answerInTurn('post', SINK, ...ANSWERS);
    reportError('redact', 'boom', 'export');
    reportControl();
    expect(await settle(reports)).toHaveLength(1);
    await sink.arrived(2);
    expect(order).toEqual([REPORT, '/i/v0/e/', REPORT, '/i/v0/e/']);
    expect(await sink[0]!.json()).toMatchObject({ event: 'error_dropped', properties: { area: 'redact', step: 'export', reason: 'non_error' } });
  });
  it('no drop count when the /api/report beacon returns false', () => {
    // forced: a browser refusing the beacon hand-off cannot be produced on cue
    const beacon = vi.spyOn(navigator, 'sendBeacon').mockReturnValue(false);
    reportError('redact', 'boom', 'export');
    expect(beacon.mock.calls.filter(([url]) => String(url).startsWith(SINK_HOST))).toHaveLength(0);
  });
  it('a repeated error sends no second count: the page\'s de-duplication bounds the sink too', async () => {
    const reports = answerInTurn('post', REPORT, ...ANSWERS);
    const sink = answerInTurn('post', SINK, ...ANSWERS);
    const error = errorAt('A.js:1:2');
    reportError('drafts', error, 'save_draft');
    reportError('drafts', error, 'save_draft');
    reportControl();
    await settle(reports);
    await sink.arrived(2);
    const counts = await Promise.all(sink.map((request) => request.json()));
    expect(counts.map((count) => count.properties.step)).toEqual(['save_draft', CONTROL]);
  });
  it('with the build variables unset nothing goes to the sink', async () => {
    const reports = answerInTurn('post', REPORT, ...ANSWERS);
    const sink = answerInTurn('post', SINK);
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', '');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', '');
    reportError('drafts', errorAt('A.js:1:2'), 'save_draft');
    reportError('redact', 'boom', 'export');
    reportControl();
    expect(await settle(reports)).toHaveLength(2);
    expect(sink).toHaveLength(0);
  });
});
