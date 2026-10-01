import { describe, expect, it } from 'vitest';
import {
  DAILY_CAP,
  capCommands,
  countCommands,
  dayKey,
  engineBucket,
  readEnv,
  reportCommands,
} from './errorReportStore.js';

const report = { area: 'drafts', name: 'TypeError', frame: 'Tool.abc123.js:10:5' } as const;

describe('engineBucket', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1', 'ios-26'],
    ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0.0.0 Mobile/15E148', 'ios-17'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.1 Safari/605.1.15', 'safari-18'],
    ['Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0', 'firefox-130'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0', 'chromium-128'],
    ['curl/8.0', 'other'],
    ['', 'other'],
  ])('%s', (ua, expected) => expect(engineBucket(ua)).toBe(expected));
});

describe('dayKey', () => {
  it('is the UTC date', () => {
    expect(dayKey(new Date('2026-10-01T23:59:59-05:00'))).toBe('2026-10-02');
  });
});

describe('commands', () => {
  it('splits the cap step from the count step and joins them', () => {
    expect(capCommands('2026-10-01')[0]).toEqual(['INCR', 'errors:total:2026-10-01']);
    expect(countCommands(report, 'ios-26', '2026-10-01')).toEqual([
      ['HINCRBY', 'errors:2026-10-01', 'drafts|TypeError|Tool.abc123.js:10:5|ios-26', 1],
      ['EXPIRE', 'errors:2026-10-01', 7776000],
    ]);
    expect(reportCommands(report, 'ios-26', '2026-10-01')).toHaveLength(4);
    expect(DAILY_CAP).toBe(5000);
  });
});

describe('readEnv', () => {
  it('accepts either variable family and nothing partial', () => {
    expect(readEnv({ KV_REST_API_URL: 'https://a/', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'https://a', token: 't' });
    expect(readEnv({ UPSTASH_REDIS_REST_URL: 'https://b', UPSTASH_REDIS_REST_TOKEN: 'u' })).toEqual({ url: 'https://b', token: 'u' });
    expect(readEnv({ KV_REST_API_URL: 'https://a' })).toBeNull();
    expect(readEnv({})).toBeNull();
  });
});
