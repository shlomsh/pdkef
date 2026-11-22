import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpResponse } from 'msw';
import { answerInTurn, answerNetwork, sentHeaders } from '../../test/support/network.browser.ts';
import { sendBeacon, setReportingEnabledForTests } from './errorReport.ts';
import {
  beaconMaintenanceTransport,
  MAX_EVENTS_PER_PAGE,
  resetMaintenanceEventsForTests,
  signFormDetectionNotStarted,
} from './maintenanceTelemetry.ts';

answerNetwork();

const REPORT = '/api/report';
const answered = () => new HttpResponse(null, { status: 204 });
const ANSWERS = Array.from({ length: 30 }, () => answered);

describe('beaconMaintenanceTransport', () => {
  beforeEach(() => {
    setReportingEnabledForTests(true);
    resetMaintenanceEventsForTests();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts exactly the event to /api/report', async () => {
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
  it('sends nothing for a forged extra property', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    const forged = {
      name: 'sign_form_detection',
      properties: { outcome: 'failure', error_code: 'not_started', filename: 'a.pdf' },
    } as unknown as ReturnType<typeof signFormDetectionNotStarted>;
    beaconMaintenanceTransport(forged);
    beaconMaintenanceTransport(signFormDetectionNotStarted());
    await seen.arrived(1);
    expect(seen).toHaveLength(1);
    expect(await seen[0]!.json()).toEqual({
      name: 'sign_form_detection',
      properties: { outcome: 'failure', error_code: 'not_started' },
    });
  });
  it('sends nothing past the per-page cap', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    for (let i = 0; i < MAX_EVENTS_PER_PAGE + 1; i++) beaconMaintenanceTransport(signFormDetectionNotStarted());
    sendBeacon({ control: 'control_step' });
    await seen.arrived(MAX_EVENTS_PER_PAGE + 1);
    expect(seen).toHaveLength(MAX_EVENTS_PER_PAGE + 1);
    expect(await seen.at(-1)!.json()).toEqual({ control: 'control_step' });
    for (const request of seen.slice(0, -1)) {
      expect(await request.json()).toMatchObject({ name: 'sign_form_detection' });
    }
  });
  it('sends nothing when reporting is disabled', async () => {
    const seen = answerInTurn('post', REPORT, ...ANSWERS);
    setReportingEnabledForTests(false);
    beaconMaintenanceTransport(signFormDetectionNotStarted());
    setReportingEnabledForTests(true);
    sendBeacon({ control: 'control_step' });
    await seen.arrived(1);
    expect(seen).toHaveLength(1);
    expect(await seen[0]!.json()).toEqual({ control: 'control_step' });
  });
  it('does not throw when sendBeacon throws', () => {
    // forced: a sendBeacon that throws cannot be produced on cue
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => beaconMaintenanceTransport(signFormDetectionNotStarted())).not.toThrow();
  });
});
