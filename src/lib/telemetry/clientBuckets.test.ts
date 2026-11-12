import { describe, expect, it } from 'vitest';
import { browserFor, clientBuckets, deviceFor, osFor, refFor } from './clientBuckets.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

describe('deviceFor', () => {
  it('splits by pointer and width', () => {
    expect(deviceFor(390, true)).toBe('phone');
    expect(deviceFor(820, true)).toBe('tablet');
    expect(deviceFor(1440, false)).toBe('desktop');
    expect(deviceFor(500, false)).toBe('desktop');
  });
});

describe('browserFor', () => {
  it('names the family, first match wins', () => {
    expect(browserFor(IPHONE)).toBe('safari');
    expect(browserFor(ANDROID)).toBe('chrome');
    expect(browserFor(SAMSUNG)).toBe('samsung');
    expect(browserFor(EDGE)).toBe('edge');
    expect(browserFor(FIREFOX)).toBe('firefox');
    expect(browserFor('Mozilla/5.0 (iPhone) CriOS/120 Safari/604')).toBe('chrome');
    expect(browserFor('curl/8')).toBe('other');
    expect(browserFor('')).toBe('other');
  });
  it('keeps Opera out of Chrome and finds Edge on phones', () => {
    expect(browserFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0')).toBe('other');
    expect(browserFor('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0')).toBe('edge');
    expect(browserFor('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 EdgiOS/120.0 Mobile/15E148 Safari/605.1.15')).toBe('edge');
  });
});

describe('osFor', () => {
  it('names the system, first match wins', () => {
    expect(osFor(IPHONE, true)).toBe('ios');
    expect(osFor(ANDROID, true)).toBe('android');
    expect(osFor(EDGE, false)).toBe('windows');
    expect(osFor(FIREFOX, false)).toBe('linux');
    expect(osFor(IPAD, true)).toBe('ios');
    expect(osFor(IPAD, false)).toBe('mac');
    expect(osFor('curl/8', false)).toBe('other');
  });
});

describe('refFor', () => {
  const host = 'pdkef.com';
  it('buckets the referrer and never returns the address', () => {
    expect(refFor('', host)).toBe('direct');
    expect(refFor('not a url', host)).toBe('other');
    expect(refFor('https://pdkef.com/merge/', host)).toBe('internal');
    expect(refFor('https://gemini.google.com/', host)).toBe('ai');
    expect(refFor('https://chatgpt.com/c/1', host)).toBe('ai');
    expect(refFor('https://www.google.co.uk/', host)).toBe('search');
    expect(refFor('https://duckduckgo.com/?q=pdf', host)).toBe('search');
    expect(refFor('https://t.co/x', host)).toBe('social');
    expect(refFor('https://www.reddit.com/r/x', host)).toBe('social');
    expect(refFor('https://notgoogle.example/', host)).toBe('other');
    expect(refFor('https://example.org/', host)).toBe('other');
  });
  it('matches the host suffix, not any label', () => {
    for (const [r, want] of [
      ['https://x.evil.example/', 'other'],
      ['https://google.evil.example/', 'other'],
      ['https://www.google.co.uk/', 'search'],
      ['https://www.google.com.br/', 'search'],
      ['https://gemini.google.com/app', 'ai'],
      ['https://chatgpt.com/', 'ai'],
      ['https://t.co/abc', 'social'],
      ['https://x.com/', 'social'],
      ['https://old.reddit.com/', 'social'],
      ['android-app://com.google.android.googlequicksearchbox/', 'search'],
      ['android-app://com.reddit.frontpage/', 'other'],
      ['http://192.168.0.1/', 'other'],
    ] as const) expect(refFor(r, host), r).toBe(want);
  });
  it('treats www. as the same host, both ways', () => {
    expect(refFor('https://www.pdkef.com/x', 'pdkef.com')).toBe('internal');
    expect(refFor('https://pdkef.com/x', 'www.pdkef.com')).toBe('internal');
  });
});

describe('clientBuckets', () => {
  it('combines the four buckets', () => {
    expect(clientBuckets({ ua: IPHONE, width: 390, coarse: true, referrer: 'https://www.google.com/', host: 'pdkef.com' })).toEqual({
      device: 'phone',
      browser: 'safari',
      os: 'ios',
      ref: 'search',
    });
  });
});
