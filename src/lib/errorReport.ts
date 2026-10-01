/**
 * The browser side of anonymous error reports (DEBT-17). The schema, and why
 * it is only area, name and frame, is `errorReportSchema.ts`.
 */

import { errorName, topFrame } from './errorIdentity.ts';
import { ERROR_REPORT_PATH, parseErrorReport, type ErrorArea, type ErrorReport } from './errorReportSchema.ts';

export * from './errorReportSchema.ts';

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
// `import.meta.env` exists only under Vite; Playwright specs and scripts import
// modules that reach this one under plain Node, where reading it would throw at
// import time.
let enabled = import.meta.env?.PROD === true;

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
