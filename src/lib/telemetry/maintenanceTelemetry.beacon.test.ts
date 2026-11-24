// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBeaconRecorder, type BeaconRecorder } from '../../test/support/beaconRecorder.ts';
import { sendBeacon, setReportingEnabledForTests } from './errorReport.ts';
import {
  beaconMaintenanceTransport,
  MAX_EVENTS_PER_PAGE,
  resetMaintenanceEventsForTests,
  signFormDetectionNotStarted,
} from './maintenanceTelemetry.ts';

const NOT_STARTED = { name: 'sign_form_detection', properties: { outcome: 'failure', error_code: 'not_started' } };

let beacons: BeaconRecorder;

beforeEach(() => {
  beacons = installBeaconRecorder();
  setReportingEnabledForTests(true);
  resetMaintenanceEventsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  beacons.restore();
});

describe('beaconMaintenanceTransport', () => {
  it('sends nothing for a forged extra property', async () => {
    const forged = {
      name: 'sign_form_detection',
      properties: { outcome: 'failure', error_code: 'not_started', filename: 'a.pdf' },
    } as unknown as ReturnType<typeof signFormDetectionNotStarted>;
    beaconMaintenanceTransport(forged);
    beaconMaintenanceTransport(signFormDetectionNotStarted());
    expect(beacons.calls).toHaveLength(1);
    expect(await beacons.bodies()).toEqual([NOT_STARTED]);
  });
  it('sends nothing past the per-page cap', async () => {
    for (let i = 0; i < MAX_EVENTS_PER_PAGE + 1; i++) beaconMaintenanceTransport(signFormDetectionNotStarted());
    sendBeacon({ control: 'control_step' });
    const sent = await beacons.bodies();
    expect(sent).toHaveLength(MAX_EVENTS_PER_PAGE + 1);
    expect(sent.at(-1)).toEqual({ control: 'control_step' });
    for (const body of sent.slice(0, -1)) expect(body).toMatchObject({ name: 'sign_form_detection' });
  });
  it('sends nothing when reporting is disabled', async () => {
    setReportingEnabledForTests(false);
    beaconMaintenanceTransport(signFormDetectionNotStarted());
    setReportingEnabledForTests(true);
    sendBeacon({ control: 'control_step' });
    expect(beacons.calls).toHaveLength(1);
    expect(await beacons.bodies()).toEqual([{ control: 'control_step' }]);
  });
  it('does not throw when sendBeacon throws', () => {
    // forced: a sendBeacon that throws cannot be produced on cue
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => beaconMaintenanceTransport(signFormDetectionNotStarted())).not.toThrow();
  });
});
