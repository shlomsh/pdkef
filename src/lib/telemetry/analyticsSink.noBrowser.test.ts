import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBeaconRecorder, type BeaconRecorder } from '../../test/support/beaconRecorder.ts';
import { setReportingEnabledForTests } from './errorReport.ts';
import { resetSinkForTests, sendToSink } from './analyticsSink.ts';

const EVENT = { name: 'tool_page_viewed', properties: { tool: 'merge', visit: 'new', since: 'first' } };

describe('sendToSink', () => {
  let recorder: BeaconRecorder;
  beforeEach(() => {
    recorder = installBeaconRecorder();
    setReportingEnabledForTests(true);
    resetSinkForTests();
  });
  afterEach(() => {
    setReportingEnabledForTests(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    recorder.restore();
  });

  it('still sends when matchMedia, screen and document are missing', async () => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no location, and the page address is read for every capture
    vi.stubGlobal('location', { origin: 'https://pdkef.com', pathname: '/merge/', hostname: 'pdkef.com' });
    // Live control: Node really lacks all three
    expect(typeof matchMedia).toBe('undefined');
    expect(typeof screen).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(sendToSink(EVENT)).toBe(true);
    expect((await recorder.bodies())[0]).toMatchObject({ properties: { device: 'desktop', ref: 'direct' } });
  });
});
