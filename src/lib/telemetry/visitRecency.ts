/**
 * New or returning, and since when (DEBT-58): decided on the device for `tool_page_viewed`'s
 * `visit` and (MEM-45) `since`. The browser keeps two plain days: the day it last opened a PDkef tool
 * page or, since DEBT-61, the home page (overwritten each visit), and the day of its first view
 * (written once, seeded from the last visit for browsers seen before MEM-45). Only the buckets
 * travel, never a day or a key, so no event can be tied to another. The last-visit key keeps its old
 * name so nobody already counted reads as new again.
 */
import type { Since, Visit } from './usageEventSchema';
import { RECENT_FILES_META_KEY } from '../drafts/recentFilesKey.js';

const LAST_VISIT_KEY = 'pdkef:last-tool-visit';
const FIRST_VISIT_KEY = 'pdkef:first-visit';
const DAY_MS = 864e5;

/**
 * Local calendar day as YYYY-MM-DD: "today" means the person's today, not UTC's.
 * @testSeam
 */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Pure: the bucket for a last-visit day against today's. An unreadable or future day counts as new.
 * @testSeam
 */
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
 * Pure (MEM-45): the bucket for the first-view day against today's. An unreadable or future day
 * counts as first.
 * @testSeam
 */
export function sinceFor(firstDay: string | null, today: string): Since {
  if (!firstDay || !/^\d{4}-\d{2}-\d{2}$/.test(firstDay)) return 'first';
  const days = Math.round((Date.parse(today) - Date.parse(firstDay)) / DAY_MS);
  if (!Number.isFinite(days) || days < 0) return 'first';
  if (days === 0) return 'day';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  if (days <= 90) return 'quarter';
  return 'older';
}

/**
 * Pure (MEM-45): whether a stored first-view day can be trusted: YYYY-MM-DD, a real date, not after
 * today. Anything else is treated as absent and reseeded.
 * @testSeam
 */
export function usableDay(day: string | null, today: string): boolean {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const ms = Date.parse(day);
  return Number.isFinite(ms) && ms <= Date.parse(today);
}

/**
 * Pure (DEBT-61): the local day of the newest file in the recent-files index, or null. The visit day
 * only exists since 21 Oct 2026, so a browser that used PDkef before has none; its recent files (kept
 * 28 days) still say it was here and when.
 * @testSeam
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
 * Reads this browser's last visit day (or, without one, its newest recent file's day) and its first
 * view day, stamps today as the last visit, and returns both buckets. A browser with a last visit
 * but no first day is seeded from it (it reads younger than it is, never new); one with neither
 * writes today as its first day. Undefined without storage.
 */
export function readAndStampVisits(now: Date = new Date()): { visit: Visit; since: Since } | undefined {
  try {
    const today = localDay(now);
    const last = localStorage.getItem(LAST_VISIT_KEY) ?? lastDayFromRecents(localStorage.getItem(RECENT_FILES_META_KEY));
    const visit = visitFor(last, today);
    const stored = localStorage.getItem(FIRST_VISIT_KEY);
    let since: Since;
    if (usableDay(stored, today)) since = sinceFor(stored, today);
    else {
      const first = visit === 'new' ? today : (last as string); // a returning visit means `last` is a valid past-or-today day
      since = visit === 'new' ? 'first' : sinceFor(first, today);
      try {
        localStorage.setItem(FIRST_VISIT_KEY, first);
      } catch {
        // expected: storage full; the bucket still travels, the day is retried next view
      }
    }
    localStorage.setItem(LAST_VISIT_KEY, today);
    return { visit, since };
  } catch {
    // expected: no storage (private mode, blocked): the page view goes without `visit` and `since`
    return undefined;
  }
}
