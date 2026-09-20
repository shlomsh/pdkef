/**
 * Anonymous maintenance telemetry boundary.
 *
 * This module is deliberately the only place feature code may describe a
 * maintenance event. Callers cannot add arbitrary fields: PDF bytes, names,
 * text, signatures, IDs, URLs, and exception messages do not fit this schema.
 * The configured transport is optional and best-effort, so editing and export
 * continue unchanged when a browser is offline or an analytics script fails.
 */

export const MAINTENANCE_EVENT_NAMES = ['sign_export', 'sign_form_detection'] as const;

export type MaintenanceEventName = (typeof MAINTENANCE_EVENT_NAMES)[number];
export type ExportDurationBucket = 'under_1s' | 'under_5s' | 'under_30s' | '30s_or_more';
export type ExportErrorCode = 'unsupported_text' | 'cancelled' | 'invalid_document' | 'processing_failed';
/**
 * How many form fields the on-open detector published, coarsely (FORM-11).
 * A bucket rather than the count for the same reason durations are bucketed:
 * the question is "does detection come back empty in the wild", and a bucket
 * answers it without carrying a number specific enough to characterise one
 * person's document.
 */
export type FieldCountBucket = 'none' | 'one_to_five' | 'six_to_twenty' | 'over_twenty';

export type SignExportProperties =
  | Readonly<{
      outcome: 'success';
      duration_bucket: ExportDurationBucket;
    }>
  | Readonly<{
      outcome: 'failure';
      duration_bucket: ExportDurationBucket;
      error_code: ExportErrorCode;
    }>;

/**
 * Why a detection run produced nothing, when it produced nothing.
 * Two codes are its own and not the export list's, because neither is a
 * failure of reading the document: `modules_unavailable` is a browser holding
 * a cached shell from before a deploy, and `not_started` is the run never
 * happening at all because its inputs were not there - the one path to "no
 * fields" that throws nothing anywhere. Every other failure reuses the export
 * vocabulary, so the boundary has one list of codes to review, not two that
 * drift.
 */
export type FormDetectionErrorCode = ExportErrorCode | 'modules_unavailable' | 'not_started';

/**
 * The detection walk's outcome. No duration: it is not a performance question.
 */
export type FormDetectionProperties =
  | Readonly<{
      outcome: 'success';
      field_count_bucket: FieldCountBucket;
    }>
  | Readonly<{
      outcome: 'failure';
      error_code: FormDetectionErrorCode;
    }>;

export type MaintenanceEventProperties = SignExportProperties | FormDetectionProperties;

/**
 * A union keyed on the name, not one `{name, properties}` shape: with two
 * events sharing one properties type, a caller could hand `sign_export` a
 * field count and the compiler would agree. Each event's schema is now only
 * reachable through its own name.
 */
export type MaintenanceEvent =
  | Readonly<{ name: 'sign_export'; properties: SignExportProperties }>
  | Readonly<{ name: 'sign_form_detection'; properties: FormDetectionProperties }>;

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

function bucketFieldCount(fieldCount: number): FieldCountBucket {
  if (!Number.isFinite(fieldCount) || fieldCount <= 0) return 'none';
  if (fieldCount <= 5) return 'one_to_five';
  if (fieldCount <= 20) return 'six_to_twenty';
  return 'over_twenty';
}

/**
 * One event per document opened in Sign, when the field walk finishes.
 *
 * It exists because "detection threw" and "this PDF has nothing detectable"
 * were indistinguishable from outside for as long as the feature has shipped,
 * and a total failure once survived a green build unnoticed (see
 * `useFormFieldRegions.wiring.test.js`). The count is bucketed and nothing
 * else about the document travels: no label, no filename, no page count, no
 * bytes.
 */
export function signFormDetectionCompleted(fieldCount: number): MaintenanceEvent {
  return Object.freeze({
    name: 'sign_form_detection',
    properties: Object.freeze({ outcome: 'success', field_count_bucket: bucketFieldCount(fieldCount) }),
  });
}

export function signFormDetectionFailed(error: unknown): MaintenanceEvent {
  return Object.freeze({
    name: 'sign_form_detection',
    properties: Object.freeze({ outcome: 'failure', error_code: classifyExportError(error) }),
  });
}

/**
 * The detector's own chunks never loaded. Reported apart from every other
 * failure because it is not a failure of the detection at all: it is a
 * browser still being served a shell from before a deploy, which turns a
 * working detector into a permanent, invisible "no fields in this PDF". A
 * rate here is the only way that shows up as anything.
 */
/**
 * The run never happened: the bytes, the page count or the pdf.js document
 * were not all there when the effect ran, and it returned early. Worth its
 * own code because it is the only outcome with no exception behind it, so a
 * rate here is the only way it is visible in aggregate at all.
 */
export function signFormDetectionNotStarted(): MaintenanceEvent {
  return Object.freeze({
    name: 'sign_form_detection',
    properties: Object.freeze({ outcome: 'failure', error_code: 'not_started' }),
  });
}

export function signFormDetectionUnavailable(): MaintenanceEvent {
  return Object.freeze({
    name: 'sign_form_detection',
    properties: Object.freeze({ outcome: 'failure', error_code: 'modules_unavailable' }),
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

/**
 * Vercel's beforeSend hook requires an absolute http(s) URL. Preserve its
 * origin and pathname, but remove query strings and fragments, which can hold
 * private document details.
 */
export function sanitizeAnalyticsEvent<T extends AnalyticsBeforeSendEvent>(event: T): T {
  try {
    const parsed = new URL(event.url, 'https://pdkef.com');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { ...event, url: new URL(parsed.pathname || '/', parsed.origin).href };
    }
  } catch {
    // Use the safe fallback below.
  }
  return { ...event, url: 'https://pdkef.com/' };
}
