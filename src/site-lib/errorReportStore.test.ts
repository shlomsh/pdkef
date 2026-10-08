import { describe, expect, it } from 'vitest';
import {
  DAILY_CAP,
  USAGE_DAILY_CAP,
  capCommands,
  countCommands,
  dayKey,
  engineBucket,
  eventCommands,
  fingerprintField,
  readEnv,
  reportCommands,
  usageCapCommands,
  withDayExpiry,
  usageCommands,
} from './errorReportStore.js';

const report = {
  area: 'drafts',
  name: 'TypeError',
  stack: ['Tool.abc123.js:10:5', 'Base.def456.js:3:9'],
  step: 'export',
  tool: '/sign/',
  installed: false,
  sw: true,
  age: 'under_1m',
  actions: [],
} as const;

describe('engineBucket', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1', 'ios-26'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1', 'ios-26'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'ios-17'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1', 'ios-18+'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1', 'ios-16'],
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
    expect(capCommands('2026-10-01')).toEqual([['INCR', 'errors:total:2026-10-01']]);
    expect(countCommands(report, 'ios-26', '2026-10-01')).toEqual([
      ['HINCRBY', 'errors:2026-10-01', 'drafts|TypeError|Tool.abc123.js:10:5|export|ios-26', 1],
      ['EXPIRE', 'errors:2026-10-01', 7776000],
      [
        'HSET',
        'errors:sample:2026-10-01',
        'drafts|TypeError|Tool.abc123.js:10:5|export|ios-26',
        JSON.stringify({ stack: report.stack, step: 'export', tool: '/sign/', installed: false, sw: true, age: 'under_1m', actions: [], engine: 'ios-26' }),
      ],
      ['EXPIRE', 'errors:sample:2026-10-01', 7776000],
    ]);
    expect(reportCommands(report, 'ios-26', '2026-10-01')).toHaveLength(5);
    expect(DAILY_CAP).toBe(1000);
  });
});

describe('actions in the sample', () => {
  const actions = ['add_files', 'clear_all', 'add_files'] as const;
  const fieldOf = (cmds: readonly (readonly unknown[])[], name: string) => cmds.filter((c) => c[0] === name);

  it('stores the actions exactly, oldest first', () => {
    const [hset] = fieldOf(countCommands({ ...report, actions }, 'ios-26', '2026-10-01'), 'HSET');
    expect(JSON.parse(hset[3] as string).actions).toEqual(['add_files', 'clear_all', 'add_files']);
  });

  it('shares one count field and one sample field across different actions', () => {
    const a = countCommands({ ...report, actions: ['add_files'] }, 'ios-26', '2026-10-01');
    const b = countCommands({ ...report, actions }, 'ios-26', '2026-10-01');
    expect(fieldOf(a, 'HINCRBY')[0][2]).toBe(fieldOf(b, 'HINCRBY')[0][2]);
    expect(fieldOf(a, 'HSET')[0][2]).toBe(fieldOf(b, 'HSET')[0][2]);
    expect(fieldOf(a, 'HSET')[0][3]).not.toBe(fieldOf(b, 'HSET')[0][3]);
  });
});

describe('translated in the sample', () => {
  const sampleOf = (r: object) =>
    JSON.parse(countCommands(r as typeof report, 'ios-26', '2026-10-01').find((c) => c[0] === 'HSET')![3] as string);
  it('keeps translated: true so the daily read can show it (SIGN-40)', () => {
    expect(sampleOf({ ...report, translated: true }).translated).toBe(true);
  });
  it('leaves it out when the report has none', () => {
    expect('translated' in sampleOf(report)).toBe(false);
  });
});

describe('build in the sample', () => {
  const sampleOf = (r: object) =>
    JSON.parse(countCommands(r as typeof report, 'ios-26', '2026-10-01').find((c) => c[0] === 'HSET')![3] as string);
  it('is stored when the report has one, and omitted otherwise', () => {
    expect(sampleOf({ ...report, build: 'abc1234' }).build).toBe('abc1234');
    expect('build' in sampleOf(report)).toBe(false);
  });
  it('does not change the fingerprint field', () => {
    expect(fingerprintField({ ...report, build: 'abc1234' } as never, 'ios-26')).toBe(fingerprintField(report as never, 'ios-26'));
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

describe('eventCommands', () => {
  it('counts one field under the day, with no sample', () => {
    const event = { name: 'sign_form_detection', properties: { outcome: 'failure', error_code: 'not_started' } } as const;
    expect(eventCommands(event, 'ios-17', '2026-10-01')).toEqual([
      ['HINCRBY', 'events:2026-10-01', 'sign_form_detection|failure|not_started|ios-17', 1],
      ['EXPIRE', 'events:2026-10-01', 90 * 24 * 60 * 60],
    ]);
  });
});

describe('eventCommands page kind', () => {
  it('counts a detection success with its page kind in the field', () => {
    const event = { name: 'sign_form_detection', properties: { outcome: 'success', field_count_bucket: 'none', page_kind: 'vector' } } as const;
    expect(eventCommands(event, 'ios-17', '2026-10-01')[0]).toEqual([
      'HINCRBY',
      'events:2026-10-01',
      'sign_form_detection|success|none|vector|ios-17',
      1,
    ]);
  });
});

describe('usage commands', () => {
  it('counts a day total apart from errors, then one field under the day', () => {
    expect(USAGE_DAILY_CAP).toBe(3000);
    expect(usageCapCommands('2026-10-01')).toEqual([['INCR', 'usage:total:2026-10-01']]);
    const event = { name: 'tool_result_ready', properties: { tool: 'merge' } } as const;
    expect(usageCommands(event, '2026-10-01')).toEqual([
      ['HINCRBY', 'usage:2026-10-01', 'tool_result_ready|merge', 1],
      ['EXPIRE', 'usage:2026-10-01', 90 * 24 * 60 * 60],
    ]);
  });
});

describe('withDayExpiry', () => {
  const counting = [['HINCRBY', 'k', 'f', 1]] as const;
  it('puts the total expiry first on the first count of the day only', () => {
    expect(withDayExpiry('errors:total:d', 1, [...counting])).toEqual([['EXPIRE', 'errors:total:d', 7776000], ...counting]);
    expect(withDayExpiry('errors:total:d', 7, [...counting])).toEqual(counting);
  });
});
