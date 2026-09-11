/**
 * Anonymous product-health telemetry boundary.
 *
 * This is deliberately smaller than an event SDK's general API. It is the only
 * place tool code can emit lifecycle events, so document-derived values cannot
 * quietly become analytics properties.
 */

export const ANALYTICS_TOOLS = [
  'merge',
  'split',
  'edit-pdf',
  'compress',
  'compress-image',
  'pdf-to-image',
  'image-to-pdf',
  'sign',
  'redact',
  'unlock',
  'protect',
] as const;

export type AnalyticsTool = (typeof ANALYTICS_TOOLS)[number];

export const TOOL_LIFECYCLE_EVENTS = [
  'tool_file_accepted',
  'tool_operation_started',
  'tool_result_ready',
  'tool_operation_failed',
] as const;

export type ToolLifecycleEvent = (typeof TOOL_LIFECYCLE_EVENTS)[number];

/** Emits the complete, deliberately small event schema in production only. */
export function reportToolLifecycleEvent(event: ToolLifecycleEvent, tool: AnalyticsTool): void {
  if (!import.meta.env.PROD || typeof window === 'undefined') return;
  try {
    window.va?.('event', { name: event, data: { tool } });
  } catch {
    // Analytics must never alter an offline or local document workflow.
  }
}
