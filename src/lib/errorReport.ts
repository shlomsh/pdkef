/**
 * The browser side of anonymous error reports (DEBT-17, DEBT-27). The schema,
 * and why it holds only positions, identifiers, flags and a bucket, is
 * `errorReportSchema.ts`.
 */

import { errorName, stackFrames } from './errorIdentity.ts';
import {
  DROP_NAMES,
  ERROR_REPORT_PATH,
  IGNORED_NAMES,
  dropRecordField,
  pageAge,
  parseDropRecord,
  parseErrorReport,
  type ErrorArea,
  type DropRecord,
  type DropType,
  type ErrorReport,
  type PageContext,
  MAX_FRAMES,
} from './errorReportSchema.ts';

export * from './errorReportSchema.ts';
import { recentActions } from './actionTrail.ts';

export const IGNORED_ERROR_NAMES: ReadonlySet<string> = new Set<string>(IGNORED_NAMES);

/**
 * pdf-lib's encrypted-file error. Matched by message as well as name because
 * the production bundle minifies the class name (it arrived as `fm`).
 */
function isPdfLibEncryptedError(error: Error): boolean {
  return error.name === 'EncryptedPDFError' || error.message.includes('`PDFDocument.load` is encrypted');
}

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
  if (IGNORED_ERROR_NAMES.has(name) || isPdfLibEncryptedError(error)) return null;
  const stack = stackFrames(error, MAX_FRAMES);
  if (stack.length === 0) return null;
  return parseErrorReport({ area, name, stack, step, ...context });
}

const DROP_NAME_SET: ReadonlySet<string> = new Set(DROP_NAMES);

/** What was thrown, coarsely: the built-in class (most specific first), `custom` for any other subclass. */
function dropType(error: unknown): DropType {
  if (!(error instanceof Error)) return error === null ? 'null' : (typeof error as DropType);
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return 'DOMException';
  const builtIns: [string, ErrorConstructor][] = [
    ['TypeError', TypeError], ['RangeError', RangeError], ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError], ['URIError', URIError], ['EvalError', EvalError],
  ];
  for (const [type, ctor] of builtIns) if (error instanceof ctor) return type as DropType;
  if (typeof AggregateError !== 'undefined' && error instanceof AggregateError) return 'AggregateError';
  return error.constructor === Error ? 'Error' : 'custom';
}

/**
 * The drop record for an error `toErrorReport` returned null for (DEBT-44), so a counted failure
 * always leaves a trace. Mirrors `toErrorReport`'s order to name the reason. Pure; null when the
 * schema refuses it, so the browser never sends what the endpoint would refuse.
 */
export function toDropRecord(area: ErrorArea, error: unknown, step: string, build?: string): DropRecord | null {
  let reason: DropRecord['reason'] = 'invalid';
  let name: string | undefined;
  if (!(error instanceof Error)) reason = 'non_error';
  else {
    name = errorName(error);
    if (IGNORED_ERROR_NAMES.has(name)) reason = 'ignored';
    else if (isPdfLibEncryptedError(error)) {
      reason = 'encrypted';
      name = 'EncryptedPDFError'; // the real name is minified
    } else if (stackFrames(error, MAX_FRAMES).length === 0) reason = 'no_frame';
  }
  return parseDropRecord({
    kind: 'dropped',
    area,
    step,
    reason,
    type: dropType(error),
    ...(name !== undefined && DROP_NAME_SET.has(name) ? { name } : {}),
    ...(build ? { build } : {}),
  });
}

/**
 * The page facts, read at report time. Never throws; any fact it cannot read
 * falls back to the plainest value (`/`, false, false, no actions).
 */
export function readPageContext(): PageContext {
  // One fact per guard: a browser missing one API keeps the other three.
  const path = safely(() => location.pathname, '/');
  const build = readBuildCommit();
  return {
    // Same shape as the schema's TOOL; a path outside it must not kill the report.
    tool: /^\/(?:[a-z0-9-]{1,40}\/){0,3}$/.test(path) ? path : '/',
    installed: safely(() => matchMedia('(display-mode: standalone)').matches === true, false),
    sw: safely(() => Boolean(navigator.serviceWorker?.controller), false),
    age: safely(() => pageAge(performance.now()), 'under_10s' as const),
    actions: safely(() => recentActions(), []),
    ...(build ? { build } : {}),
    ...(readTranslated() ? { translated: true } : {}),
  };
}

/** Chrome's built-in page translation sets `translated-ltr` / `translated-rtl` on `<html>`. */
function readTranslated(): boolean {
  return safely(() => /\btranslated-(ltr|rtl)\b/.test(document.documentElement.className), false);
}

const BUILD_COMMIT = /^[0-9a-f]{7}$/;

/**
 * The 7-character commit the page was built from, off `<meta name="pdkef-build">` (written by the
 * production build only), or undefined when the tag is missing or malformed. Never throws.
 */
export function readBuildCommit(doc?: Pick<Document, 'querySelector'>): string | undefined {
  return safely(() => {
    const content = (doc ?? document).querySelector('meta[name="pdkef-build"]')?.getAttribute('content');
    return typeof content === 'string' && BUILD_COMMIT.test(content) ? content : undefined;
  }, undefined);
}

function safely<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    // expected: reporting code must never throw, an unreadable value falls back
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
    if (!canSend()) return;
    if (sent.size >= MAX_REPORTS_PER_PAGE) return;
    const report = toErrorReport(area, error, step, readPageContext());
    if (!report) {
      sendDrop(toDropRecord(area, error, step, readBuildCommit()));
      return;
    }
    // Keyed on the step, so two call sites over one shared throw site stay two.
    // An uncaught error is the exception: if its throw site was already
    // reported from a catch, the escape is the same defect, not a new one.
    const site = `${report.name}|${report.stack[0]}`;
    const key = `${site}|${report.step}`;
    if (sent.has(key) || (report.area === 'uncaught' && sentSites.has(site))) return;
    sent.add(key);
    sentSites.add(site);
    sendBeacon(report);
  } catch {
    // expected: Reporting must never change what the caller does next.
  }
}

/** A drop record, at most once per distinct record and `MAX_DROPS_PER_PAGE` per page; its own budget. */
function sendDrop(record: DropRecord | null): void {
  if (!record || drops.size >= MAX_DROPS_PER_PAGE) return;
  const key = dropRecordField(record, '');
  if (drops.has(key)) return;
  drops.add(key);
  sendBeacon(record);
}

function canSend(): boolean {
  return enabled && navigator.onLine !== false && typeof navigator.sendBeacon === 'function';
}

/**
 * Hands one JSON payload to `ERROR_REPORT_PATH` with `navigator.sendBeacon`:
 * production builds only, nothing when offline. Never throws. Returns whether
 * the browser accepted it; callers must not change their flow on the answer.
 * Shared by error reports and maintenance events (DEBT-27).
 */
export function sendBeacon(payload: object): boolean {
  try {
    if (!canSend()) return false;
    return navigator.sendBeacon(
      ERROR_REPORT_PATH,
      new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    );
  } catch {
    // expected: reporting code must never throw, a failed beacon is simply not sent
    return false;
  }
}

export const MAX_REPORTS_PER_PAGE = 10;
export const MAX_DROPS_PER_PAGE = 10;

// Module state, so a page load is the unit of "once" and of the cap.
const sent = new Set<string>();
const sentSites = new Set<string>();
const drops = new Set<string>();
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
  drops.clear();
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
