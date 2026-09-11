import { describe, expect, it } from 'vitest';
import { isIOSDevice } from './platform.ts';

describe('isIOSDevice', () => {
  it('is false for a missing or empty navigator', () => {
    expect(isIOSDevice(undefined)).toBe(false);
    expect(isIOSDevice(null)).toBe(false);
    expect(isIOSDevice({})).toBe(false);
  });

  it('is true for a classic iPhone user agent', () => {
    expect(isIOSDevice({
      platform: 'iPhone',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it('is true for a classic iPad user agent (pre-iPadOS-13 UA string)', () => {
    expect(isIOSDevice({
      platform: 'iPad',
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.1 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it('is true for an iPod touch user agent', () => {
    expect(isIOSDevice({
      platform: 'iPod',
      userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it('is true for iPadOS 13+, which masquerades as a Mac but reports touch points', () => {
    expect(isIOSDevice({
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      maxTouchPoints: 5,
    })).toBe(true);
  });

  it('is false for a real Mac (MacIntel with no meaningful touch support)', () => {
    expect(isIOSDevice({
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
    })).toBe(false);
  });

  it('is false for a real Mac with a trackpad reporting a single synthetic touch point', () => {
    expect(isIOSDevice({ platform: 'MacIntel', maxTouchPoints: 1 })).toBe(false);
  });

  it('is false for Android', () => {
    expect(isIOSDevice({
      platform: 'Linux armv8l',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
    })).toBe(false);
  });

  it('is false for Windows desktop', () => {
    expect(isIOSDevice({
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
    })).toBe(false);
  });
});
