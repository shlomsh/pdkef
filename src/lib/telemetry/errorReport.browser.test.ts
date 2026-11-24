import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders, worker } from '../../test/support/network.browser.ts';
import { parseErrorReport, reportError, resetErrorReportingForTests, setReportingEnabledForTests } from './errorReport.ts';
import { resetActionTrailForTests } from './actionTrail.ts';
import { resetSinkForTests } from './analyticsSink.ts';
import { beaconMaintenanceTransport, resetMaintenanceEventsForTests, signFormDetectionNotStarted } from './maintenanceTelemetry.ts';

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
  it('posts exactly the maintenance event to /api/report', async () => {
    resetMaintenanceEventsForTests();
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    beaconMaintenanceTransport(signFormDetectionNotStarted());
    await seen.arrived(1);
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0]!.url).pathname).toBe(REPORT);
    expect(sentHeaders(seen[0]!)).toEqual({ 'content-type': 'application/json' });
    expect(await seen[0]!.json()).toEqual({
      name: 'sign_form_detection',
      properties: { outcome: 'failure', error_code: 'not_started' },
    });
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
});
