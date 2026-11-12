import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReportingEnabledForTests } from './errorReport.ts';
import { readSinkConfig, resetSinkForTests, sendToSink, toCapture } from './analyticsSink.ts';

const EVENT = { name: 'tool_page_viewed', properties: { tool: 'merge', visit: 'new', since: 'first' } };

describe('readSinkConfig', () => {
  it('is null unless both values are set and the host is https', () => {
    expect(readSinkConfig({})).toBeNull();
    expect(readSinkConfig({ PUBLIC_ANALYTICS_HOST: 'https://e.example.test' })).toBeNull();
    expect(readSinkConfig({ PUBLIC_ANALYTICS_KEY: 'k' })).toBeNull();
    expect(readSinkConfig({ PUBLIC_ANALYTICS_HOST: 'http://e.example.test', PUBLIC_ANALYTICS_KEY: 'k' })).toBeNull();
    expect(readSinkConfig({ PUBLIC_ANALYTICS_HOST: 'not a url', PUBLIC_ANALYTICS_KEY: 'k' })).toBeNull();
  });

  it('keeps only the origin of the host', () => {
    expect(
      readSinkConfig({ PUBLIC_ANALYTICS_HOST: 'https://e.example.test/some/path', PUBLIC_ANALYTICS_KEY: 'k' }),
    ).toEqual({ host: 'https://e.example.test', key: 'k' });
  });
});

describe('toCapture', () => {
  it('carries the event, a page-load id and the path, nothing else', () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    expect(toCapture(EVENT, { key: 'k', id: 'abc', now, origin: 'https://pdkef.com', pathname: '/merge/' })).toEqual({
      api_key: 'k',
      event: 'tool_page_viewed',
      distinct_id: 'abc',
      timestamp: '2026-11-12T10:00:00.000Z',
      properties: {
        tool: 'merge',
        visit: 'new',
        since: 'first',
        $process_person_profile: false,
        $current_url: 'https://pdkef.com/merge/',
        $pathname: '/merge/',
      },
    });
  });
});

describe('sendToSink', () => {
  let beacon: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true, writable: true });
    setReportingEnabledForTests(true);
    vi.stubGlobal('location', { origin: 'https://pdkef.com', pathname: '/merge/' });
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
    expect(first).toMatchObject({ event: 'tool_page_viewed', api_key: 'k', properties: { $process_person_profile: false } });
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
});
