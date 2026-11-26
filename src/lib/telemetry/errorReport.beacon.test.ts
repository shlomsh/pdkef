// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBeaconRecorder, type BeaconRecorder } from '../../test/support/beaconRecorder.ts';
import {
  MAX_DROPS_PER_PAGE,
  MAX_REPORTS_PER_PAGE,
  reportError,
  resetErrorReportingForTests,
  sendBeacon,
  setReportingEnabledForTests,
} from './errorReport.ts';
import { recordAction, resetActionTrailForTests } from './actionTrail.ts';
import { resetSinkForTests } from './analyticsSink.ts';

type Body = Record<string, unknown>;

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

const reportControl = () => reportError('drafts', errorAt('Control.js:1:1'), CONTROL);

let beacons: BeaconRecorder;
const bodies = async () => (await beacons.bodies()) as Body[];

beforeEach(() => {
  beacons = installBeaconRecorder();
  setReportingEnabledForTests(true);
  resetErrorReportingForTests();
  resetSinkForTests();
  resetActionTrailForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetActionTrailForTests();
  beacons.restore();
});

describe('reportError', () => {
  it('carries exactly the recorded actions, oldest first', async () => {
    recordAction('add_files');
    recordAction('clear_all');
    reportError('drafts', errorAt('Act.js:1:2'), 'save_draft');
    expect((await bodies())[0]!.actions).toEqual(['add_files', 'clear_all']);
  });
  it('keeps two call sites over one throw site apart', async () => {
    const e = errorAt('S.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'load_draft');
    expect((await bodies()).map((body) => body.step)).toEqual(['save_draft', 'load_draft']);
  });
  it('sends one defect once, even when it also escapes as uncaught', () => {
    const e = errorAt('B.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('uncaught', e, 'save_draft');
    reportError('uncaught', e, 'unhandled_rejection');
    expect(beacons.calls).toHaveLength(1);
  });
  it('drops pdf.js cancellation as a report, leaving only a drop record', async () => {
    reportError('pdf_render', errorAt('C.js:1:2', 'x', 'RenderingCancelledException'), 'save_draft');
    expect(beacons.calls).toHaveLength(1);
    expect((await bodies())[0]).toMatchObject({ kind: 'dropped', reason: 'ignored' });
  });
  it('caps the total per page', async () => {
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i++) reportError('drafts', errorAt(`A.js:${i + 1}:1`), 'save_draft');
    reportError('redact', 'control', CONTROL);
    const sent = await bodies();
    expect(sent.slice(0, -1)).toHaveLength(MAX_REPORTS_PER_PAGE);
    expect(sent.at(-1)).toMatchObject({ kind: 'dropped', step: CONTROL });
  });
  it('does nothing offline or outside production', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a browser that reports it is offline cannot be put in that state on cue
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    reportError('drafts', errorAt('A.js:1:1'), 'save_draft');
    online.mockRestore();
    setReportingEnabledForTests(false);
    reportError('drafts', errorAt('A.js:1:1'), 'save_draft');
    setReportingEnabledForTests(true);
    reportControl();
    expect((await bodies()).map((body) => body.step)).toEqual([CONTROL]);
  });
  it('sendBeacon returns false and posts nothing when offline', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a browser that reports it is offline cannot be put in that state on cue
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(sendBeacon({ a: 1 })).toBe(false);
    online.mockRestore();
    expect(sendBeacon({ control: CONTROL })).toBe(true);
    expect(await bodies()).toEqual([{ control: CONTROL }]);
  });
  it('never throws', () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a sendBeacon that throws cannot be produced on cue
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => reportError('drafts', errorAt('A.js:1:1'), 'save_draft')).not.toThrow();
  });
  it('sends nothing new for a deduplicated report', () => {
    const e = errorAt('D.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'save_draft');
    expect(beacons.calls).toHaveLength(1);
  });
});

describe('reportError drop records (DEBT-44)', () => {
  it('sends a drop record for a string throw', async () => {
    reportError('redact', 'boom', 'export');
    expect(await bodies()).toEqual([{ kind: 'dropped', area: 'redact', step: 'export', reason: 'non_error', type: 'string' }]);
  });
  it('sends each distinct drop once per page', () => {
    reportError('redact', 'a', 'export');
    reportError('redact', 'b', 'export');
    reportError('redact', 'c', 'other_step');
    expect(beacons.calls).toHaveLength(2);
  });
  it('caps drops per page', () => {
    for (let i = 0; i < MAX_DROPS_PER_PAGE + 5; i++) reportError('redact', 's', `step_${String.fromCharCode(97 + i)}`);
    expect(beacons.calls).toHaveLength(MAX_DROPS_PER_PAGE);
  });
  it('still sends a drop record once the page has used its report cap', async () => {
    for (let i = 0; i < MAX_REPORTS_PER_PAGE; i++) reportError('drafts', errorAt(`A.js:${i + 1}:1`), 'save_draft');
    reportError('redact', 'boom', 'export');
    const sent = await bodies();
    expect(sent).toHaveLength(MAX_REPORTS_PER_PAGE + 1);
    expect(sent.at(-1)).toMatchObject({ kind: 'dropped', area: 'redact', reason: 'non_error' });
  });
  it('sends no drop record for an uncaught error outside our code (extension noise has no failure to explain)', async () => {
    reportError('uncaught', 'boom', 'unhandled_rejection');
    reportControl();
    expect((await bodies()).map((body) => body.step)).toEqual([CONTROL]);
  });
});

describe('error and drop counts go to the analytics sink only after the /api/report beacon (MEM-45)', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', SINK_HOST);
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
  });

  it('no count when the /api/report beacon returns false', () => {
    beacons.restore();
    // forced: a browser refusing the beacon hand-off cannot be produced on cue
    beacons = installBeaconRecorder({ returns: false });
    reportError('drafts', errorAt('A.js:1:2'), 'save_draft');
    expect(beacons.urls()).toEqual([REPORT]);
  });
  it('a drop record sends one error_dropped', async () => {
    reportError('redact', 'boom', 'export');
    reportControl();
    expect(beacons.urls()).toEqual([REPORT, SINK, REPORT, SINK]);
    expect((await bodies())[1]).toMatchObject({ event: 'error_dropped', properties: { area: 'redact', step: 'export', reason: 'non_error' } });
  });
  it('no drop count when the /api/report beacon returns false', () => {
    beacons.restore();
    // forced: a browser refusing the beacon hand-off cannot be produced on cue
    beacons = installBeaconRecorder({ returns: false });
    reportError('redact', 'boom', 'export');
    expect(beacons.urls().filter((url) => url.startsWith(SINK_HOST))).toHaveLength(0);
  });
  it('a repeated error sends no second count: the page\'s de-duplication bounds the sink too', async () => {
    const error = errorAt('A.js:1:2');
    reportError('drafts', error, 'save_draft');
    reportError('drafts', error, 'save_draft');
    reportControl();
    const counts = (await bodies()).filter((_, i) => beacons.calls[i]!.url === SINK);
    expect(counts.map((count) => (count.properties as Body).step)).toEqual(['save_draft', CONTROL]);
  });
  it('with the build variables unset nothing goes to the sink', () => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', '');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', '');
    reportError('drafts', errorAt('A.js:1:2'), 'save_draft');
    reportError('redact', 'boom', 'export');
    reportControl();
    expect(beacons.urls()).toEqual([REPORT, REPORT, REPORT]);
  });
});
