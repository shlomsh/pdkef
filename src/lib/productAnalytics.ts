/**
 * Anonymous product-health telemetry boundary.
 *
 * This is deliberately smaller than an event SDK's general API. It is the only
 * place tool code can emit lifecycle events, so document-derived values cannot
 * quietly become analytics properties.
 *
 * These go to our own `/api/report` as daily counts per tool (DEBT-28), because
 * Hobby did not record them as Vercel custom events.
 */

import { readBuildCommit, sendBeacon } from './errorReport.ts';
import { NAVIGATION_TYPES, parseUsageEvent, type AnalyticsTool, type NavigationType, type ToolLifecycleEvent } from './usageEventSchema';

// The event and tool lists live in the import-free schema the endpoint shares (DEBT-28).
export {
  ANALYTICS_TOOLS,
  TOOL_LIFECYCLE_EVENTS,
  parseUsageEvent,
  type AnalyticsTool,
  type ToolLifecycleEvent,
  type UsageEvent,
} from './usageEventSchema';

export const MAX_USAGE_EVENTS_PER_PAGE = 40;
let handedOff = 0;
// `event|tool` pairs already handed off this page load; the next one of a pair is not `first`.
const seen = new Set<string>();

export function resetUsageEventsForTests(): void {
  handedOff = 0;
  seen.clear();
}

/** How this page load started, off the browser's navigation timing (DEBT-57); undefined when it names none on the list. */
function readNavigationType(): NavigationType | undefined {
  try {
    const type = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
    return (NAVIGATION_TYPES as readonly string[]).includes(type as string) ? (type as NavigationType) : undefined;
  } catch {
    // expected: a browser without navigation timing sends the event without nav
    return undefined;
  }
}

/** Hands one funnel event to `/api/report` by beacon; capped per page, never throws. */
export function reportToolLifecycleEvent(event: ToolLifecycleEvent, tool: AnalyticsTool): void {
  try {
    const build = readBuildCommit();
    const pair = `${event}|${tool}`;
    const first = !seen.has(pair);
    const nav = first ? readNavigationType() : undefined;
    const parsed = parseUsageEvent({
      name: event,
      properties: { tool, ...(build ? { build } : {}), ...(first ? { first } : {}), ...(nav ? { nav } : {}) },
    });
    if (!parsed || handedOff >= MAX_USAGE_EVENTS_PER_PAGE) return;
    if (sendBeacon(parsed)) {
      handedOff += 1;
      seen.add(pair);
    }
  } catch {
    // expected: Analytics must never alter an offline or local document workflow.
  }
}

/**
 * DEBT-58 contract, implemented by the client brief: call on every committed, deliberate change to
 * the loaded file (an element added, a page moved, an option changed); never from pointermove. Sends
 * `tool_first_edit` once per accepted file and is a no-op after, so call sites need no state.
 */
export function reportEdit(tool: AnalyticsTool): void {
  void tool;
}
