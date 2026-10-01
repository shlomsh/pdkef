/**
 * The browser side of anonymous error reports (DEBT-17, DEBT-27). The schema,
 * and why it holds only positions, identifiers, flags and a bucket, is
 * `errorReportSchema.ts`.
 */

import { errorName, stackFrames } from './errorIdentity.ts';
import {
  ERROR_REPORT_PATH,
  pageAge,
  parseErrorReport,
  type ErrorArea,
  type ErrorReport,
  type PageContext,
  MAX_FRAMES,
} from './errorReportSchema.ts';

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
  // pdf.js: a damaged file, a failed range request, and a render or load
  // cancelled because the person moved on.
  'FormatError',
  'UnexpectedResponseException',
  'RenderingCancelledException',
  'AbortException',
]);

/**
 * The report for this error, or null when it should not travel: an ignored
 * name, or no frame inside our own built output (an extension's error, or a
 * dev build). Pure: the page facts come in as `context`.
 */
export function toErrorReport(
  area: ErrorArea,
  error: unknown,
  step: string,
  context: PageContext,
): ErrorReport | null {
  if (!(error instanceof Error)) return null;
  const name = errorName(error);
  if (IGNORED_ERROR_NAMES.has(name)) return null;
  const stack = stackFrames(error, MAX_FRAMES);
  if (stack.length === 0) return null;
  return parseErrorReport({ area, name, stack, step, ...context });
}

/**
 * The page facts, read at report time. Never throws; any fact it cannot read
 * falls back to the plainest value (`/`, false, false).
 */
export function readPageContext(): PageContext {
  // One fact per guard: a browser missing one API keeps the other three.
  const path = safely(() => location.pathname, '/');
  return {
    // Same shape as the schema's TOOL; a path outside it must not kill the report.
    tool: /^\/(?:[a-z0-9-]{1,40}\/){0,3}$/.test(path) ? path : '/',
    installed: safely(() => matchMedia('(display-mode: standalone)').matches === true, false),
    sw: safely(() => Boolean(navigator.serviceWorker?.controller), false),
    age: safely(() => pageAge(performance.now()), 'under_10s' as const),
  };
}

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/**
 * Best-effort, fire-and-forget. Production builds only; nothing when offline;
 * each distinct report at most once per page load and at most
 * `MAX_REPORTS_PER_PAGE` in total; sent with `navigator.sendBeacon` to
 * `ERROR_REPORT_PATH`. Never throws, never awaits, never changes what the
 * caller does next. `step` names what the call site was doing; every call site
 * passes one (DEBT-27).
 */
export function reportError(area: ErrorArea, error: unknown, step: string): void {
  try {
    if (!enabled) return;
    if (navigator.onLine === false || typeof navigator.sendBeacon !== 'function') return;
    if (sent.size >= MAX_REPORTS_PER_PAGE) return;
    const report = toErrorReport(area, error, step, readPageContext());
    if (!report) return;
    // Keyed on the step, so two call sites over one shared throw site stay two.
    // An uncaught error is the exception: if its throw site was already
    // reported from a catch, the escape is the same defect, not a new one.
    const site = `${report.name}|${report.stack[0]}`;
    const key = `${site}|${report.step}`;
    if (sent.has(key) || (report.area === 'uncaught' && sentSites.has(site))) return;
    sent.add(key);
    sentSites.add(site);
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
const sentSites = new Set<string>();
// `import.meta.env` exists only under Vite; Playwright specs and scripts import
// modules that reach this one under plain Node, where reading it would throw at
// import time.
let enabled = import.meta.env?.PROD === true;

export function setReportingEnabledForTests(value: boolean): void {
  enabled = value;
}

export function resetErrorReportingForTests(): void {
  sent.clear();
  sentSites.clear();
}

let installed = false;

/** Reports window `error` and `unhandledrejection`; calling it twice adds nothing. */
export function installUncaughtErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => reportError('uncaught', event.error, 'window_error'));
  window.addEventListener('unhandledrejection', (event) =>
    reportError('uncaught', event.reason, 'unhandled_rejection'),
  );
}
