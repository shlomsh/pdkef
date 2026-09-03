/**
 * Anonymous maintenance telemetry boundary.
 *
 * This module is deliberately the only place feature code may describe a
 * maintenance event. Callers cannot add arbitrary fields: PDF bytes, names,
 * text, signatures, IDs, URLs, and exception messages do not fit this schema.
 * The configured transport is optional and best-effort, so editing and export
 * continue unchanged when a browser is offline or an analytics script fails.
 */

export const MAINTENANCE_EVENT_NAMES = ['sign_export'] as const;

export type MaintenanceEventName = (typeof MAINTENANCE_EVENT_NAMES)[number];
export type ExportDurationBucket = 'under_1s' | 'under_5s' | 'under_30s' | '30s_or_more';
export type ExportErrorCode = 'unsupported_text' | 'cancelled' | 'invalid_document' | 'processing_failed';

export type MaintenanceEventProperties =
  | Readonly<{
      outcome: 'success';
      duration_bucket: ExportDurationBucket;
    }>
  | Readonly<{
      outcome: 'failure';
      duration_bucket: ExportDurationBucket;
      error_code: ExportErrorCode;
    }>;

export interface MaintenanceEvent {
  readonly name: MaintenanceEventName;
  readonly properties: MaintenanceEventProperties;
}

/** The only transport shape approved for this client-side boundary. */
export type MaintenanceTransport = (event: MaintenanceEvent) => void;

function bucketDuration(durationMs: number): ExportDurationBucket {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '30s_or_more';
  if (durationMs < 1_000) return 'under_1s';
  if (durationMs < 5_000) return 'under_5s';
  if (durationMs < 30_000) return 'under_30s';
  return '30s_or_more';
}

/**
 * The comparison is intentionally against a small fixed list. We never retain
 * or emit `error.name`, `error.message`, a stack, or any custom error fields.
 */
export function classifyExportError(error: unknown): ExportErrorCode {
  if (error instanceof Error) {
    if (error.name === 'UnrepresentableTextError') return 'unsupported_text';
    if (error.name === 'AbortError') return 'cancelled';
    if (error.name === 'InvalidPDFException' || error.name === 'InvalidPdfError') return 'invalid_document';
  }
  return 'processing_failed';
}

export function signExportSucceeded(durationMs: number): MaintenanceEvent {
  return Object.freeze({
    name: 'sign_export',
    properties: Object.freeze({ outcome: 'success', duration_bucket: bucketDuration(durationMs) }),
  });
}

export function signExportFailed(durationMs: number, error: unknown): MaintenanceEvent {
  return Object.freeze({
    name: 'sign_export',
    properties: Object.freeze({
      outcome: 'failure',
      duration_bucket: bucketDuration(durationMs),
      error_code: classifyExportError(error),
    }),
  });
}

function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Records an already-sanitized event. It never uses fetch, queues nothing on
 * disk, and deliberately swallows transport failures. Returning false only
 * communicates that no attempt was made or the attempt failed; callers must
 * not change their product flow based on it.
 */
export function reportMaintenanceEvent(
  event: MaintenanceEvent,
  transport: MaintenanceTransport | undefined,
): boolean {
  if (!transport || browserIsOffline()) return false;
  try {
    transport(event);
    return true;
  } catch {
    return false;
  }
}

/**
 * Vercel Analytics is the existing, same-origin page-view integration. This
 * adapter is intentionally separate from event creation so a future provider
 * review cannot broaden the event schema by accident.
 */
export const vercelMaintenanceTransport: MaintenanceTransport = (event) => {
  if (typeof window === 'undefined') return;
  window.va?.('event', { name: event.name, data: event.properties });
};

/** Strip queries, fragments, origins, and malformed values before page views leave the browser. */
export function sanitizeAnalyticsPath(url: string): string {
  try {
    const parsed = new URL(url, 'https://pdkef.invalid');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '/';
    return parsed.pathname || '/';
  } catch {
    return '/';
  }
}

export interface AnalyticsBeforeSendEvent {
  type: 'pageview' | 'event';
  url: string;
}

/** Vercel's beforeSend hook: it preserves the event type but drops raw URLs. */
export function sanitizeAnalyticsEvent<T extends AnalyticsBeforeSendEvent>(event: T): T {
  return { ...event, url: sanitizeAnalyticsPath(event.url) };
}
