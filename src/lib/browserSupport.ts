import { isIOSDevice, type NavigatorPlatformInfo } from './platform';

/**
 * Oldest browsers pdf.js can run in. pdf.js reads the global `Iterator` at
 * load, which Chromium only gained in 122, Firefox in 131 and Safari/iOS in
 * 18.4. Below that every tool that opens a PDF throws a ReferenceError
 * (Chromium 109, reported 2026-10-02). A floor is judged from the user agent
 * so the notice can name the version to update to; a browser we cannot place
 * is never blocked or warned.
 */
const MINIMUMS = { Chrome: 122, Edge: 122, Firefox: 131, Safari: 18.4, iOS: 18.4 } as const;

export type SupportedBrowserName = keyof typeof MINIMUMS;

export interface UnsupportedBrowser {
  browser: SupportedBrowserName;
  minimum: number;
}

const major = (match: RegExpMatchArray | null) => (match ? Number(match[1]) : null);
const majorMinor = (match: RegExpMatchArray | null) => (match ? Number(`${match[1]}.${match[2] || 0}`) : null);

function place(nav: NavigatorPlatformInfo): { browser: SupportedBrowserName; version: number } | null {
  const ua = nav.userAgent || '';
  // Every browser on iOS is WebKit, so the OS version is the engine version.
  if (isIOSDevice(nav)) {
    const os = majorMinor(ua.match(/OS (\d+)_(\d+)/));
    const safari = majorMinor(ua.match(/Version\/(\d+)\.(\d+)/));
    const version = os ?? safari;
    return version === null ? null : { browser: 'iOS', version };
  }
  const edge = major(ua.match(/Edg\/(\d+)/));
  if (edge !== null) return { browser: 'Edge', version: edge };
  const firefox = major(ua.match(/Firefox\/(\d+)/));
  if (firefox !== null) return { browser: 'Firefox', version: firefox };
  const chrome = major(ua.match(/Chrome\/(\d+)/));
  if (chrome !== null) return { browser: 'Chrome', version: chrome };
  const safari = majorMinor(ua.match(/Version\/(\d+)\.(\d+).*Safari\//));
  if (safari !== null) return { browser: 'Safari', version: safari };
  return null;
}

/** The browser and the version it needs, or null when it is fine or unrecognised. */
export function unsupportedBrowser(nav: NavigatorPlatformInfo | null | undefined): UnsupportedBrowser | null {
  if (!nav) return null;
  const placed = place(nav);
  if (!placed) return null;
  const minimum = MINIMUMS[placed.browser];
  return placed.version < minimum ? { browser: placed.browser, minimum } : null;
}
