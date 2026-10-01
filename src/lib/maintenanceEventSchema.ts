/**
 * Sign's maintenance events on the wire (DEBT-27, folded in from DEBT-24): the
 * one schema shared by the browser that sends them and `api/report.ts`, which
 * counts them next to error reports.
 *
 * Why here and not Vercel Analytics: Hobby has no custom events, so
 * `window.va('event', ...)` was dropped on Vercel's side, and two of the four
 * ways Sign ends with no fields (`not_started`, `modules_unavailable`) throw
 * nothing, so no error report can ever show them. These counts are the only
 * place they are visible, and they now sit in the same store `errors:read`
 * reads.
 *
 * What travels is exactly the event `maintenanceTelemetry.ts` already builds,
 * `{name, properties}`, every value off a closed list below. No duration on a
 * detection, no count, no message, nothing from a document.
 */

// No imports, and none may be added: `api/report.ts` loads this file in the
// deployed function (see errorReportSchema.ts and functionImports.test.js).

export const MAINTENANCE_EVENT_NAMES = ['sign_export', 'sign_form_detection'] as const;
export type MaintenanceEventName = (typeof MAINTENANCE_EVENT_NAMES)[number];

export const EXPORT_DURATION_BUCKETS = ['under_1s', 'under_5s', 'under_30s', '30s_or_more'] as const;
export type ExportDurationBucket = (typeof EXPORT_DURATION_BUCKETS)[number];

export const EXPORT_ERROR_CODES = ['unsupported_text', 'cancelled', 'invalid_document', 'processing_failed'] as const;
export type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[number];

/**
 * How many form fields the on-open detector published, coarsely (FORM-11): the
 * question is "does detection come back empty in the wild", and a bucket
 * answers it without a number specific enough to characterise a document.
 */
export const FIELD_COUNT_BUCKETS = ['none', 'one_to_five', 'six_to_twenty', 'over_twenty'] as const;
export type FieldCountBucket = (typeof FIELD_COUNT_BUCKETS)[number];

/**
 * Why a detection run produced nothing. `modules_unavailable` is a browser
 * holding a cached shell from before a deploy; `not_started` is the run never
 * happening because its inputs were not there. Every other failure reuses the
 * export list, so there is one vocabulary to review, not two that drift.
 */
export const FORM_DETECTION_ERROR_CODES = [...EXPORT_ERROR_CODES, 'modules_unavailable', 'not_started'] as const;
export type FormDetectionErrorCode = (typeof FORM_DETECTION_ERROR_CODES)[number];

export type SignExportProperties =
  | Readonly<{ outcome: 'success'; duration_bucket: ExportDurationBucket }>
  | Readonly<{ outcome: 'failure'; duration_bucket: ExportDurationBucket; error_code: ExportErrorCode }>;

/** The detection walk's outcome. No duration: it is not a performance question. */
export type FormDetectionProperties =
  | Readonly<{ outcome: 'success'; field_count_bucket: FieldCountBucket }>
  | Readonly<{ outcome: 'failure'; error_code: FormDetectionErrorCode }>;

export type MaintenanceEventProperties = SignExportProperties | FormDetectionProperties;

/**
 * Keyed on the name, so `sign_export` cannot be handed a field count and have
 * the compiler agree.
 */
export type MaintenanceEvent =
  | Readonly<{ name: 'sign_export'; properties: SignExportProperties }>
  | Readonly<{ name: 'sign_form_detection'; properties: FormDetectionProperties }>;

const has = (list: readonly string[], value: unknown): value is string =>
  typeof value === 'string' && list.includes(value);

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  return actual.length === wanted.length && actual.every((key, i) => key === wanted[i]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExport(p: Record<string, unknown>): SignExportProperties | null {
  if (!has(EXPORT_DURATION_BUCKETS, p.duration_bucket)) return null;
  const duration_bucket = p.duration_bucket as ExportDurationBucket;
  if (p.outcome === 'success' && exactKeys(p, ['outcome', 'duration_bucket'])) {
    return Object.freeze({ outcome: 'success', duration_bucket });
  }
  if (p.outcome === 'failure' && exactKeys(p, ['outcome', 'duration_bucket', 'error_code'])) {
    if (!has(EXPORT_ERROR_CODES, p.error_code)) return null;
    return Object.freeze({ outcome: 'failure', duration_bucket, error_code: p.error_code as ExportErrorCode });
  }
  return null;
}

function parseDetection(p: Record<string, unknown>): FormDetectionProperties | null {
  if (p.outcome === 'success' && exactKeys(p, ['outcome', 'field_count_bucket'])) {
    if (!has(FIELD_COUNT_BUCKETS, p.field_count_bucket)) return null;
    return Object.freeze({ outcome: 'success', field_count_bucket: p.field_count_bucket as FieldCountBucket });
  }
  if (p.outcome === 'failure' && exactKeys(p, ['outcome', 'error_code'])) {
    if (!has(FORM_DETECTION_ERROR_CODES, p.error_code)) return null;
    return Object.freeze({ outcome: 'failure', error_code: p.error_code as FormDetectionErrorCode });
  }
  return null;
}

/**
 * Accepts exactly `{name, properties}` with the property set that name and
 * outcome allow, every value off its list, and nothing else. Run on both
 * sides, like `parseErrorReport`.
 */
export function parseMaintenanceEvent(value: unknown): MaintenanceEvent | null {
  if (!isPlainObject(value) || !exactKeys(value, ['name', 'properties'])) return null;
  const { name, properties } = value;
  if (!isPlainObject(properties)) return null;
  if (name === 'sign_export') {
    const parsed = parseExport(properties);
    return parsed && Object.freeze({ name, properties: parsed });
  }
  if (name === 'sign_form_detection') {
    const parsed = parseDetection(properties);
    return parsed && Object.freeze({ name, properties: parsed });
  }
  return null;
}

/**
 * The counter field an event is stored under, with the browser family the
 * endpoint derived: `sign_form_detection|failure|not_started|ios-17`,
 * `sign_export|success|under_5s|chromium-140`. Values in a fixed order, so one
 * outcome is always one field.
 */
export function maintenanceEventField(event: MaintenanceEvent, engine: string): string {
  const p = event.properties as Record<string, string>;
  const detail = [p.field_count_bucket, p.duration_bucket, p.error_code].filter(Boolean);
  return [event.name, p.outcome, ...detail, engine].join('|');
}
