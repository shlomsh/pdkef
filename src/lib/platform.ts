/**
 * iOS device detection for MOBI-09's Files-app notice on the Sign tool's
 * empty state (DropzoneEmptyState.tsx). Deliberately platform-based, not
 * browser-based: every browser on iOS (Chrome, Firefox, Edge...) is a WebKit
 * wrapper under App Store rules, so the Web Share Target gap this notice
 * works around is the same regardless of which one opened the page. "iOS
 * Safari" in the ticket means "on iOS", not "specifically Safari".
 *
 * A pure function taking a plain object (not the global `navigator`) so it
 * can be unit-tested without touching jsdom's own UA string, and so the
 * caller controls exactly when it runs - see the DropzoneEmptyState.tsx
 * comment on why that must be a mount effect, never the render body.
 */
export interface NavigatorPlatformInfo {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
}

const IOS_DEVICE_PATTERN = /iPad|iPhone|iPod/;

/**
 * True for iPhone, iPod, and classic iPad user agents, plus iPadOS 13+ -
 * which reports a desktop Mac UA and `platform: "MacIntel"` (Apple's
 * deliberate desktop-site compatibility choice) but is distinguishable from
 * a real Mac by touch support no Mac has (`maxTouchPoints > 1`; a real Mac
 * reports 0, or 1 for some trackpads' single synthetic touch point).
 */
export function isIOSDevice(nav: NavigatorPlatformInfo | null | undefined): boolean {
  if (!nav) return false;
  const platform = nav.platform || '';
  const userAgent = nav.userAgent || '';
  if (IOS_DEVICE_PATTERN.test(platform) || IOS_DEVICE_PATTERN.test(userAgent)) return true;
  return platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1;
}
