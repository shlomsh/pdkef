// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://pdkef.com/merge/", "referrer": "https://www.google.com/", "userAgent": "Mozilla/5.0 (iPhone) Safari/604" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBeaconRecorder, type BeaconRecorder } from '../../test/support/beaconRecorder.ts';
import { setReportingEnabledForTests } from './errorReport.ts';
import { readSinkConfig, resetSinkForTests, sendToSink, toCapture } from './analyticsSink.ts';

const CLIENT = { device: 'phone', browser: 'safari', os: 'ios', ref: 'search' } as const;
const EVENT = { name: 'tool_page_viewed', properties: { tool: 'merge', visit: 'new', since: 'first' } };

describe('readSinkConfig', () => {
  it('is null unless both values are set and the host is https', () => {
    expect(readSinkConfig(undefined, undefined)).toBeNull();
    expect(readSinkConfig('https://e.example.test', undefined)).toBeNull();
    expect(readSinkConfig(undefined, 'k')).toBeNull();
    expect(readSinkConfig('http://e.example.test', 'k')).toBeNull();
    expect(readSinkConfig('not a url', 'k')).toBeNull();
  });

  it('keeps only the origin of the host', () => {
    expect(readSinkConfig('https://e.example.test/some/path', 'k')).toEqual({ host: 'https://e.example.test', key: 'k' });
  });
});

describe('toCapture', () => {
  it('carries the event, a page-load id and the path, nothing else', () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    expect(toCapture(EVENT, { key: 'k', id: 'abc', now, origin: 'https://pdkef.com', pathname: '/merge/', client: CLIENT })).toEqual({
      api_key: 'k',
      event: 'tool_page_viewed',
      distinct_id: 'abc',
      timestamp: '2026-11-12T10:00:00.000Z',
      properties: {
        tool: 'merge',
        visit: 'new',
        since: 'first',
        ...CLIENT,
        $process_person_profile: false,
        $current_url: 'https://pdkef.com/merge/',
        $pathname: '/merge/',
      },
    });
  });
});

describe('toCapture client buckets', () => {
  it('lets the context win over event properties', () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    const ctx = { key: 'k', id: 'abc', now, origin: 'https://pdkef.com', pathname: '/merge/', client: CLIENT };
    const capture = toCapture({ name: 'x', properties: { device: 'desktop', ref: 'direct', tool: 'merge' } }, ctx) as {
      properties: Record<string, unknown>;
    };
    expect(capture.properties).toMatchObject({ ...CLIENT, tool: 'merge' });
  });
});

describe('sendToSink', () => {
  let recorder: BeaconRecorder;
  beforeEach(() => {
    recorder = installBeaconRecorder();
    setReportingEnabledForTests(true);
    resetSinkForTests();
  });
  afterEach(() => {
    setReportingEnabledForTests(false);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    recorder.restore();
  });
  const configure = () => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
  };
  const body = async (call: number) => (await recorder.bodies())[call] as any;

  it('does nothing when the config is unset', () => {
    expect(sendToSink(EVENT)).toBe(false);
    expect(recorder.calls).toHaveLength(0);
  });

  it('sends one text/plain capture to the host, with one id per page load', async () => {
    configure();
    expect(sendToSink(EVENT)).toBe(true);
    expect(sendToSink(EVENT)).toBe(true);
    expect(recorder.calls).toHaveLength(2);
    expect(recorder.calls[0].url).toBe('https://e.example.test/i/v0/e/');
    expect(recorder.calls[0].blob.type).toBe('text/plain');
    const first = await body(0);
    expect(first).toMatchObject({ event: 'tool_page_viewed', api_key: 'k', properties: { $process_person_profile: false, device: 'phone', browser: 'safari', os: 'ios', ref: 'search' } });
    expect(first.distinct_id).toBeTruthy();
    expect((await body(1)).distinct_id).toBe(first.distinct_id);
    resetSinkForTests();
    sendToSink(EVENT);
    expect((await body(2)).distinct_id).not.toBe(first.distinct_id);
  });

  it('stamps the capture with the given time, else the send time', async () => {
    configure();
    sendToSink(EVENT, new Date('2026-01-02T03:04:05.000Z'));
    sendToSink(EVENT);
    expect((await body(0)).timestamp).toBe('2026-01-02T03:04:05.000Z');
    expect((await body(1)).timestamp).not.toBe('2026-01-02T03:04:05.000Z');
  });

  it('does nothing while reporting is disabled', () => {
    configure();
    setReportingEnabledForTests(false);
    expect(sendToSink(EVENT)).toBe(false);
    expect(recorder.calls).toHaveLength(0);
  });

  it('never throws when the beacon does', () => {
    configure();
    // Forced: a sendBeacon that throws cannot be produced on cue
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(sendToSink(EVENT)).toBe(false);
  });

  it('computes the buckets once per page load', async () => {
    configure();
    sendToSink(EVENT);
    // Forced: a Firefox user agent, which the page's own cannot be changed to mid-load
    vi.spyOn(Navigator.prototype, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Firefox/121.0');
    sendToSink(EVENT);
    expect((await body(1)).properties.browser).toBe('safari');
  });

  it('reads nothing from the browser while unconfigured', () => {
    const ua = vi.spyOn(Navigator.prototype, 'userAgent', 'get');
    expect(sendToSink(EVENT)).toBe(false);
    expect(ua).not.toHaveBeenCalled();
    configure();
    expect(sendToSink(EVENT)).toBe(true);
    expect(ua).toHaveBeenCalled();
  });
});
