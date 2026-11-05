import type { DriveRoute } from './types.ts';

const NOT_PLAIN_CHROME = ['Mobile', 'Android', 'CriOS', 'Edg', 'OPR', 'SamsungBrowser'];

/**
 * Google's Picker frame needs cookies that WebKit blocks unless a popup was opened, so popup is the
 * safe default (measured 2026-11-05). Only desktop Chrome gets the one-tap redirect.
 */
export function driveRouteFor(userAgent: string): DriveRoute {
  if (!userAgent.includes('Chrome/')) return 'popup';
  return NOT_PLAIN_CHROME.some((token) => userAgent.includes(token)) ? 'popup' : 'redirect';
}
