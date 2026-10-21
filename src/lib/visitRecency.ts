/**
 * New or returning, and since when (DEBT-58): decided on the device for `tool_page_viewed`'s
 * `visit`. The browser keeps the day it last opened a PDkef tool page; only the bucket travels,
 * never the day or the key, so no event can be tied to another.
 */
import type { Visit } from './usageEventSchema';

const LAST_VISIT_KEY = 'pdkef:last-tool-visit';
const DAY_MS = 864e5;

/** Local calendar day as YYYY-MM-DD: "today" means the person's today, not UTC's. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Pure: the bucket for a last-visit day against today's. An unreadable or future day counts as new. */
export function visitFor(lastDay: string | null, today: string): Visit {
  if (!lastDay || !/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return 'new';
  const days = Math.round((Date.parse(today) - Date.parse(lastDay)) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return 'new';
  if (days === 0) return 'today';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'older';
}

/** Reads this browser's last tool-page day, stamps today, and returns the bucket. Undefined without storage. */
export function readAndStampVisit(now: Date = new Date()): Visit | undefined {
  try {
    const today = localDay(now);
    const visit = visitFor(localStorage.getItem(LAST_VISIT_KEY), today);
    localStorage.setItem(LAST_VISIT_KEY, today);
    return visit;
  } catch {
    // expected: no storage (private mode, blocked): the page view goes without `visit`
    return undefined;
  }
}
