import { describe, expect, it } from 'vitest';
import { unsupportedBrowser } from './browserSupport';

const CHROME = (v: number) =>
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
const EDGE = (v: number) => `${CHROME(v)} Edg/${v}.0.0.0`;
const FIREFOX = (v: number) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`;
const SAFARI = (v: string) =>
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Safari/605.1.15`;
const IPHONE = (os: string, wrapper = 'Version/18.0 Mobile/15E148 Safari/604.1') =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${os} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${wrapper}`;

describe('unsupportedBrowser', () => {
  it('names a Chrome below the floor, with the version to update to', () => {
    expect(unsupportedBrowser({ userAgent: CHROME(109) })).toEqual({ browser: 'Chrome', minimum: 122 });
  });

  it('accepts Chrome at the floor and above', () => {
    expect(unsupportedBrowser({ userAgent: CHROME(122) })).toBeNull();
    expect(unsupportedBrowser({ userAgent: CHROME(143) })).toBeNull();
  });

  it('reads Edge as Edge, not Chrome', () => {
    expect(unsupportedBrowser({ userAgent: EDGE(110) })).toEqual({ browser: 'Edge', minimum: 122 });
    expect(unsupportedBrowser({ userAgent: EDGE(140) })).toBeNull();
  });

  it('judges Firefox on its own number', () => {
    expect(unsupportedBrowser({ userAgent: FIREFOX(115) })).toEqual({ browser: 'Firefox', minimum: 131 });
    expect(unsupportedBrowser({ userAgent: FIREFOX(153) })).toBeNull();
  });

  it('judges desktop Safari by its Version token', () => {
    expect(unsupportedBrowser({ userAgent: SAFARI('17.6') })).toEqual({ browser: 'Safari', minimum: 18.4 });
    expect(unsupportedBrowser({ userAgent: SAFARI('18.4') })).toBeNull();
    expect(unsupportedBrowser({ userAgent: SAFARI('26.0') })).toBeNull();
  });

  it('judges every browser on iOS by the iOS version, since they are all WebKit', () => {
    expect(unsupportedBrowser({ userAgent: IPHONE('17_5') })).toEqual({ browser: 'iOS', minimum: 18.4 });
    expect(unsupportedBrowser({ userAgent: IPHONE('18_4') })).toBeNull();
    expect(
      unsupportedBrowser({ userAgent: IPHONE('17_5', 'CriOS/120.0.0.0 Mobile/15E148 Safari/604.1') }),
    ).toEqual({ browser: 'iOS', minimum: 18.4 });
    expect(
      unsupportedBrowser({ userAgent: IPHONE('26_0', 'CriOS/140.0.0.0 Mobile/15E148 Safari/604.1') }),
    ).toBeNull();
  });

  it('judges iPadOS that reports a Mac user agent by its Safari version', () => {
    expect(unsupportedBrowser({ userAgent: SAFARI('17.6'), platform: 'MacIntel', maxTouchPoints: 5 })).toEqual({
      browser: 'iOS',
      minimum: 18.4,
    });
  });

  it('stays quiet for an agent it cannot place', () => {
    expect(unsupportedBrowser({ userAgent: 'SomeCrawler/1.0' })).toBeNull();
    expect(unsupportedBrowser({ userAgent: '' })).toBeNull();
    expect(unsupportedBrowser(undefined)).toBeNull();
  });
});
