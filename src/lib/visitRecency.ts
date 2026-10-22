/**
 * New or returning, and since when (DEBT-58): decided on the device for `tool_page_viewed`'s
 * `visit`. The browser keeps the day it last opened a PDkef tool page or, since DEBT-61, the home
 * page; only the bucket travels, never the day or the key, so no event can be tied to another. The
 * key keeps its old name so nobody already counted reads as new again.
 */
import type { Visit } from './usageEventSchema';
import { RECENT_FILES_META_KEY } from './drafts/recentFilesKey.js';

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

/**
 * Pure (DEBT-61): the local day of the newest file in the recent-files index, or null. The visit day
 * only exists since 21 Oct 2026, so a browser that used PDkef before has none; its recent files (kept
 * 28 days) still say it was here and when.
 */
export function lastDayFromRecents(raw: string | null): string | null {
  if (!raw) return null;
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    // expected: a damaged index says nothing about the last visit
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const times = entries.map((e) => (e && typeof e === 'object' ? (e as { savedAt?: unknown }).savedAt : undefined))
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  return times.length ? localDay(new Date(Math.max(...times))) : null;
}

/**
 * Reads this browser's last visit day (or, without one, its newest recent file's day), stamps today,
 * and returns the bucket. Undefined without storage.
 */
export function readAndStampVisit(now: Date = new Date()): Visit | undefined {
  try {
    const today = localDay(now);
    const last = localStorage.getItem(LAST_VISIT_KEY) ?? lastDayFromRecents(localStorage.getItem(RECENT_FILES_META_KEY));
    const visit = visitFor(last, today);
    localStorage.setItem(LAST_VISIT_KEY, today);
    return visit;
  } catch {
    // expected: no storage (private mode, blocked): the page view goes without `visit`
    return undefined;
  }
}
