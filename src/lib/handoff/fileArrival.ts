/**
 * How the file in front of the person got there (DEBT-58), for the funnel's `source`.
 *
 * The code that brings a file in says how, right before it hands the file on: BasePdfTool for a
 * pick, drop, paste or replace; the draft and hand-off hooks for a restore, a recent tile or a
 * hand-off. `productAnalytics.ts` takes the mark when the tool accepts the file and keeps it as the
 * source of everything that file goes on to do. The last mark wins; nothing here leaves the page.
 *
 * No imports beyond the schema's types: draft code imports this without pulling in analytics.
 */
import type { AnalyticsTool, FileSource } from '../telemetry/usageEventSchema';

export type Arrival = Readonly<{ source: FileSource; from?: AnalyticsTool }>;

let pending: Arrival | null = null;

/** The next file a tool accepts on this page arrived this way. `from` only for a hand-off. */
export function markArrival(source: FileSource, from?: AnalyticsTool): void {
  pending = source === 'handoff' && from ? { source, from } : { source };
}

/** The mark for the file being accepted now, consumed; undefined when no code path marked it. */
export function takeArrival(): Arrival | undefined {
  const arrival = pending ?? undefined;
  pending = null;
  return arrival;
}

// The home page's recent tile and the tool page it opens are two page loads in one tab, so the
// tile's intent crosses in sessionStorage, read once, then gone.
const RECENT_KEY = 'pdkef:arrival:recent';

/** Home page: the tool page about to open was asked for from a recent-file tile. */
export function noteRecentOpen(tool: string): void {
  try {
    sessionStorage.setItem(RECENT_KEY, tool);
  } catch {
    // expected: best effort; the open then reads as a restore
  }
}

/** Tool page, on restoring: true once if a recent tile asked for this tool. */
export function consumeRecentOpen(tool: string): boolean {
  try {
    const asked = sessionStorage.getItem(RECENT_KEY);
    sessionStorage.removeItem(RECENT_KEY);
    return asked === tool;
  } catch {
    // expected: no storage, no recent intent to read
    return false;
  }
}

export function resetFileArrivalForTests(): void {
  pending = null;
}
