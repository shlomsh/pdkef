import { isIOSDevice, type NavigatorPlatformInfo } from './platform';

/**
 * Oldest browsers pdf.js can run in. pdf.js reads the global `Iterator` at
 * load, which Chromium only gained natively in 122, Firefox in 131 and
 * Safari/iOS in 18.4. Before DEBT-42's polyfill, every tool that opened a PDF
 * threw a ReferenceError below that (Chromium 109, reported 2026-10-02); with
 * it, Chrome and Edge run from 109 (below). A floor is judged from the user agent
 * so the notice can name the version to update to; a browser we cannot place
 * is never blocked or warned.
 *
 * DEBT-42 polyfills the global `Iterator` and the other built-ins pdf.js calls
 * (pdfjsPolyfills.js). Chrome and Edge sit at 109 since DEBT-69 (2026-10-28):
 * Chromium 109.0.5414.46 ran every tool's main job end to end, with output
 * matching current Chromium, so the build's syntax runs there too despite
 * Vite's nominal Chrome 111 target. 109 is the last Chrome on Windows 7 and 8.
 * Below 109 nothing was measured, so the notice stays. Firefox and Safari keep
 * their floors until a browser below them is shown to run every tool.
 *
 * Checked 2026-10-08 against MDN browser-compat-data 8.1.5 for pdfjs-dist 6.3.289:
 * the built-ins pdf.js calls unguarded on the paths this app runs (open, render,
 * text, images) are all polyfilled now; the last five were Promise.withResolvers,
 * transferToFixedLength, URL.parse and Response/Blob bytes (Chrome 119-144,
 * Firefox 121-128, Safari 17.4-18). Read from the code, the unguarded calls left
 * are AbortSignal.any and Set.prototype.intersection, in pdf.js's viewer and editor
 * classes, which the app does not load, and the stream iteration in
 * getTextContent(), which it never calls (pdfTextItems.ts reads the stream).
 */
const MINIMUMS = { Chrome: 109, Edge: 109, Firefox: 131, Safari: 18.4, iOS: 18.4 } as const;

type SupportedBrowserName = keyof typeof MINIMUMS;

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
