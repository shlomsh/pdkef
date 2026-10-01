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

import { sendBeacon } from './errorReport.ts';
import { parseUsageEvent, type AnalyticsTool, type ToolLifecycleEvent } from './usageEventSchema';

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

export function resetUsageEventsForTests(): void {
  handedOff = 0;
}

/** Hands one funnel event to `/api/report` by beacon; capped per page, never throws. */
export function reportToolLifecycleEvent(event: ToolLifecycleEvent, tool: AnalyticsTool): void {
  try {
    const parsed = parseUsageEvent({ name: event, properties: { tool } });
    if (!parsed || handedOff >= MAX_USAGE_EVENTS_PER_PAGE) return;
    if (sendBeacon(parsed)) handedOff += 1;
  } catch {
    // expected: Analytics must never alter an offline or local document workflow.
  }
}
