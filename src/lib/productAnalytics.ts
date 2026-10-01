/// <reference types="@vercel/analytics" />
/**
 * Anonymous product-health telemetry boundary.
 *
 * This is deliberately smaller than an event SDK's general API. It is the only
 * place tool code can emit lifecycle events, so document-derived values cannot
 * quietly become analytics properties.
 */

import type { AnalyticsTool, ToolLifecycleEvent } from './usageEventSchema';

// The event and tool lists live in the import-free schema the endpoint shares (DEBT-28).
export {
  ANALYTICS_TOOLS,
  TOOL_LIFECYCLE_EVENTS,
  parseUsageEvent,
  type AnalyticsTool,
  type ToolLifecycleEvent,
  type UsageEvent,
} from './usageEventSchema';

/** Emits the complete, deliberately small event schema in production only. */
export function reportToolLifecycleEvent(event: ToolLifecycleEvent, tool: AnalyticsTool): void {
  if (!import.meta.env.PROD || typeof window === 'undefined') return;
  try {
    window.va?.('event', { name: event, data: { tool } });
  } catch {
    // expected: Analytics must never alter an offline or local document workflow.
  }
}
