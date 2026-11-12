import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let beacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
    setReportingEnabledForTests(true);
    vi.stubGlobal('location', { origin: 'https://pdkef.com', pathname: '/merge/', hostname: 'pdkef.com' });
    vi.stubGlobal('screen', { width: 390, height: 844 });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('document', { referrer: 'https://www.google.com/' });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone) Safari/604', sendBeacon: beacon });
    resetSinkForTests();
  });
  afterEach(() => {
    setReportingEnabledForTests(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const configure = () => {
    vi.stubEnv('PUBLIC_ANALYTICS_HOST', 'https://e.example.test');
    vi.stubEnv('PUBLIC_ANALYTICS_KEY', 'k');
  };
  const body = async (call: number) => JSON.parse(await (beacon.mock.calls[call][1] as Blob).text());

  it('does nothing when the config is unset', () => {
    expect(sendToSink(EVENT)).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('sends one text/plain capture to the host, with one id per page load', async () => {
    configure();
    expect(sendToSink(EVENT)).toBe(true);
    expect(sendToSink(EVENT)).toBe(true);
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(beacon.mock.calls[0][0]).toBe('https://e.example.test/i/v0/e/');
    expect((beacon.mock.calls[0][1] as Blob).type).toBe('text/plain');
    const first = await body(0);
    expect(first).toMatchObject({ event: 'tool_page_viewed', api_key: 'k', properties: { $process_person_profile: false, device: 'phone', browser: 'safari', os: 'ios', ref: 'search' } });
    expect(first.distinct_id).toBeTruthy();
    expect((await body(1)).distinct_id).toBe(first.distinct_id);
    resetSinkForTests();
    sendToSink(EVENT);
    expect((await body(2)).distinct_id).not.toBe(first.distinct_id);
  });

  it('does nothing while reporting is disabled', () => {
    configure();
    setReportingEnabledForTests(false);
    expect(sendToSink(EVENT)).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });

  it('never throws when the beacon does', () => {
    configure();
    beacon.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(sendToSink(EVENT)).toBe(false);
  });

  it('still sends when matchMedia, screen and document are missing', async () => {
    configure();
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('screen', undefined);
    vi.stubGlobal('document', undefined);
    expect(sendToSink(EVENT)).toBe(true);
    expect(await body(0)).toMatchObject({ properties: { device: 'desktop', ref: 'direct' } });
  });

  it('computes the buckets once per page load', async () => {
    configure();
    sendToSink(EVENT);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Firefox/121.0', sendBeacon: beacon });
    sendToSink(EVENT);
    expect((await body(1)).properties.browser).toBe('safari');
  });

  it('reads nothing from the browser while unconfigured', () => {
    const ua = vi.fn(() => 'x');
    vi.stubGlobal('navigator', { get userAgent() { return ua(); }, sendBeacon: beacon });
    expect(sendToSink(EVENT)).toBe(false);
    expect(ua).not.toHaveBeenCalled();
  });
});
