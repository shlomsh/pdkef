/**
 * The browser side of anonymous error reports (DEBT-17). The schema, and why
 * it is only area, name and frame, is `errorReportSchema.ts`.
 */

import { errorName, topFrame } from './errorIdentity.ts';
import {
  ERROR_REPORT_PATH,
  NO_STEP,
  pageAge,
  parseErrorReport,
  type ErrorArea,
  type ErrorReport,
  type PageContext,
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
 *
 * TODO(DEBT-27 brief A): stack = stackFrames(error) from errorIdentity.ts;
 * null if empty; then parseErrorReport({ area, name, stack, step, ...context }).
 */
export function toErrorReport(
  area: ErrorArea,
  error: unknown,
  step: string,
  context: PageContext,
): ErrorReport | null {
  void area; void error; void step; void context;
  return null;
}

/**
 * The page facts, read at report time. Never throws; any fact it cannot read
 * falls back to the plainest value (`/`, false, false).
 *
 * TODO(DEBT-27 brief A): implement from location.pathname (fallback '/' when
 * it does not pass the schema), matchMedia('(display-mode: standalone)'),
 * navigator.serviceWorker?.controller, and pageAge(performance.now()).
 */
export function readPageContext(): PageContext {
  return { tool: '/', installed: false, sw: false, age: 'under_10s' };
}

/**
 * Best-effort, fire-and-forget. Production builds only; nothing when offline;
 * each distinct report at most once per page load and at most
 * `MAX_REPORTS_PER_PAGE` in total; sent with `navigator.sendBeacon` to
 * `ERROR_REPORT_PATH`. Never throws, never awaits, never changes what the
 * caller does next. `step` names what the call site was doing; every call site
 * passes one (DEBT-27).
 *
 * TODO(DEBT-27 brief A): dedupe on `${name}|${stack[0]}` as before.
 */
export function reportError(area: ErrorArea, error: unknown, step: string = NO_STEP): void {
  void area; void error; void step;
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
