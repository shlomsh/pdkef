/**
 * Anonymous error reports (DEBT-17): the one schema a defect may be described
 * in, shared by the browser that sends it and the same-origin endpoint
 * (`api/report.ts`) that receives it.
 *
 * Why: nothing that happens on a person's device was observable to us at all,
 * and a detector throwing on one iPhone took a day and five wrong theories to
 * learn. A report says only which part of the app failed, what threw, and
 * where in our own built JavaScript - enough to find the line, never anything
 * about a document.
 *
 * What may travel, and nothing else:
 * - `area`, off the closed list below;
 * - `name`, the error's name, an identifier from program text
 *   (`errorIdentity.ts`);
 * - `frame`, the top stack frame inside `/_astro/`, as `chunk.hash.js:line:col`.
 *   The chunk's content hash identifies the build, so no build id is sent.
 *
 * Never a message, not even an engine's: a message is built from whatever the
 * thrower was holding, and it is the one field that has ever leaked a label,
 * a line of a form or a filename (FORM-11). The browser posts only to its own
 * origin, so `connect-src 'self'` and the privacy page's sentence about it
 * stay literally true.
 */

import { errorName, topFrame } from './errorIdentity.ts';

export const ERROR_REPORT_PATH = '/api/report';

/** Coarse feature areas. A frame names the line; this only groups them. */
export const ERROR_AREAS = [
  'pdf_render', // pdf.js page or thumbnail render threw on a document that loaded
  'pdf_tool_run', // a tool's own load, build or export step threw
  'chunk_load', // a lazy chunk of our own failed to import
  'drafts', // the on-device memory space threw where it should have worked
  'handoff', // a cross-tool hand-off write threw
  'fonts', // font coverage or embedding threw
  'redact', // Redact's object, text and saved-file readers
  'sign_export', // Sign's export
  'sign_form_detection', // Sign's on-open field detection
  'uncaught', // window 'error' / 'unhandledrejection' from our own code
] as const;

export type ErrorArea = (typeof ERROR_AREAS)[number];

export type ErrorReport = Readonly<{
  area: ErrorArea;
  name: string;
  frame: string;
}>;

/**
 * Failures of the environment or of the person's own file, never of our code:
 * a cancelled operation, full or blocked storage, a refused permission, an
 * encrypted, damaged or missing PDF. Reporting them would bury the defects
 * this exists to find.
 */
export const IGNORED_ERROR_NAMES: ReadonlySet<string> = new Set([
  'AbortError',
  'QuotaExceededError',
  'NotAllowedError',
  'SecurityError',
  'PasswordException',
  'InvalidPDFException',
  'MissingPDFException',
]);

/** The largest body the endpoint accepts. A valid report is under 200 bytes. */
export const MAX_REPORT_BYTES = 512;

const AREAS: ReadonlySet<string> = new Set(ERROR_AREAS);
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FRAME = /^[A-Za-z0-9_.-]{1,120}\.m?js:\d{1,7}:\d{1,7}$/;

/**
 * Accepts exactly the three fields, each in its own shape, and nothing else.
 * Run on both sides: the browser never sends what this rejects, and the
 * endpoint never stores it.
 */
export function parseErrorReport(value: unknown): ErrorReport | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 3) return null;
  const { area, name, frame } = value as Record<string, unknown>;
  if (typeof area !== 'string' || !AREAS.has(area)) return null;
  if (typeof name !== 'string' || !NAME.test(name)) return null;
  if (typeof frame !== 'string' || !FRAME.test(frame)) return null;
  return Object.freeze({ area: area as ErrorArea, name, frame });
}

/**
 * The report for this error, or null when it should not travel: an ignored
 * name, or no frame inside our own built output (an extension's error, or a
 * dev build).
 */
export function toErrorReport(area: ErrorArea, error: unknown): ErrorReport | null {
  if (!(error instanceof Error)) return null;
  const name = errorName(error);
  if (IGNORED_ERROR_NAMES.has(name)) return null;
  const frame = topFrame(error);
  if (!frame) return null;
  return parseErrorReport({ area, name, frame });
}

/**
 * Best-effort, fire-and-forget. Production builds only; nothing when offline;
 * each distinct report at most once per page load and at most
 * `MAX_REPORTS_PER_PAGE` in total; sent with `navigator.sendBeacon` to
 * `ERROR_REPORT_PATH`. Never throws, never awaits, never changes what the
 * caller does next.
 */
export function reportError(area: ErrorArea, error: unknown): void {
  try {
    if (!enabled) return;
    if (navigator.onLine === false || typeof navigator.sendBeacon !== 'function') return;
    if (sent.size >= MAX_REPORTS_PER_PAGE) return;
    const report = toErrorReport(area, error);
    if (!report) return;
    const key = `${report.area}|${report.name}|${report.frame}`;
    if (sent.has(key)) return;
    sent.add(key);
    navigator.sendBeacon(
      ERROR_REPORT_PATH,
      new Blob([JSON.stringify(report)], { type: 'application/json' }),
    );
  } catch {
    // Reporting must never change what the caller does next.
  }
}

export const MAX_REPORTS_PER_PAGE = 10;

// Module state, so a page load is the unit of "once" and of the cap.
const sent = new Set<string>();
let enabled = import.meta.env.PROD;

export function setReportingEnabledForTests(value: boolean): void {
  enabled = value;
}

export function resetErrorReportingForTests(): void {
  sent.clear();
}

let installed = false;

/** Reports window `error` and `unhandledrejection`; calling it twice adds nothing. */
export function installUncaughtErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => reportError('uncaught', event.error));
  window.addEventListener('unhandledrejection', (event) =>
    reportError('uncaught', event.reason),
  );
}
