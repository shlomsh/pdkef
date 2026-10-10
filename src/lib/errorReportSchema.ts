/**
 * Anonymous error reports (DEBT-17, DEBT-27): the one schema a defect may be described
 * in, shared by the browser that sends it and the same-origin endpoint
 * (`api/report.ts`) that receives it.
 *
 * Why: nothing that happens on a person's device was observable to us at all,
 * and a detector throwing on one iPhone took a day and five wrong theories to
 * learn. A report says which part of the app failed, what threw, the path
 * through our own built JavaScript that led there, and a few facts about the
 * page - enough to troubleshoot, never anything about a document.
 *
 * What may travel, and nothing else. Every field is a position in our own
 * code, an identifier our code wrote, a closed list, a bucket or a flag:
 * - `area`, off the closed list below;
 * - `name`, the error's name, an identifier from program text
 *   (`errorIdentity.ts`);
 * - `stack`, the frames inside `/_astro/`, top first, at most `MAX_FRAMES`,
 *   each `chunk.hash.js:line:col`. `stack[0]` is the fingerprint counts use;
 * - `step`, a label the call site wrote (`thumbnail`, `export`), an identifier;
 * - `tool`, the page's path (`/sign/`, `/he/sign/`), never a query or fragment;
 * - `actions`, the last few things the person did in the tool (`add_files`, `clear_all`), names off
 *   the closed list below, oldest first, at most `MAX_ACTIONS`. Names only: no file name, count,
 *   position or text (DEBT-31);
 *   Optional when parsing: a tab on a cached older build (the service worker keeps old builds alive,
 *   and a rolling deploy does the same) sends the eight other fields, and dropping those reports
 *   would lose crashes exactly when they matter; a missing `actions` parses as `[]`;
 * - `build`, the first 7 lowercase hex characters of the commit the page was deployed from. It names the
 *   release the page came from, a position in our own history like a chunk name, and nothing about a
 *   document or a person. The chunk hash identifies a build only by rebuilding history; the commit
 *   names it directly. Optional, like `actions`: a cached older build, or a build with no commit,
 *   sends none, and it only ever travels beside `actions`;
 * - `translated`, true when the browser's page translation has rewritten the page (`<html>` carries
 *   `translated-ltr` or `translated-rtl`). A flag only, never the language or any text; it tells a
 *   translation-extension DOM breakage from our own defect (SIGN-40). Optional, and sent only when
 *   true, so every shape above may carry it;
 * - `installed` (display-mode standalone), `sw` (a service worker controls the
 *   page), and `age`, how long the page had been open, bucketed. No online
 *   flag: nothing is sent offline, so it would always say true.
 *
 * Never a message, not even an engine's: a message is built from whatever the
 * thrower was holding, and it is the one field that has ever leaked a label,
 * a line of a form or a filename (FORM-11). The browser posts only to its own
 * origin, so `connect-src 'self'` and the privacy page's sentence about it
 * stay literally true.
 */

// No imports, and none may be added: `api/report.ts` loads this file in the
// deployed function, where Vercel compiles each file on its own and keeps
// import paths as written. A `./x.ts` import here works in every local check
// and fails every request in production (src/site-lib/functionImports.test.js guards it).

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

export const PAGE_AGES = ['under_10s', 'under_1m', 'under_10m', 'over_10m'] as const;
export type PageAge = (typeof PAGE_AGES)[number];

export const MAX_FRAMES = 8;
export const MAX_ACTIONS = 10;

/**
 * What a person can do in a tool, closed on purpose: a name here is the only way an action reaches
 * a report. Generic across tools; a tool maps its handlers to the nearest name.
 */
export const ACTIONS = [
  'add_files', 'replace_file', 'remove_file', 'clear_all', 'open_recent',
  'undo', 'redo', 'reorder', 'sort', 'rotate', 'hide_page', 'delete_page', 'select_pages',
  'change_setting', 'arm_tool', 'place_mark', 'move_mark', 'resize_mark', 'edit_mark', 'delete_mark',
  'draw', 'detect_fields', 'fill_field', 'zoom', 'fullscreen', 'export', 'download', 'share',
] as const;
export type ActionName = (typeof ACTIONS)[number];

export type ErrorReport = Readonly<{
  build?: string;
  translated?: boolean;
  actions: readonly ActionName[];
  area: ErrorArea;
  name: string;
  stack: readonly string[];
  step: string;
  tool: string;
  installed: boolean;
  sw: boolean;
  age: PageAge;
}>;

/** The page facts a report carries, read once per report in the browser. */
export type PageContext = Pick<ErrorReport, 'tool' | 'installed' | 'sw' | 'age' | 'actions' | 'build' | 'translated'>;

/** The largest body the endpoint accepts. The largest valid report is about 1.5KB. */
export const MAX_REPORT_BYTES = 2048;

/**
 * The eight keys an older build sends; the DEBT-31 build adds `actions`, a later one adds `build`.
 * Exactly these three shapes: eight, plus `actions`, plus `actions` and `build`.
 */
const KEYS = ['age', 'area', 'installed', 'name', 'stack', 'step', 'sw', 'tool'];
const KEYS_WITH_ACTIONS = ['actions', ...KEYS].sort();
const KEYS_WITH_BUILD = ['actions', 'build', ...KEYS].sort();
const BUILD = /^[0-9a-f]{7}$/;
const AREAS: ReadonlySet<string> = new Set(ERROR_AREAS);
const AGES: ReadonlySet<string> = new Set(PAGE_AGES);
const ACTION_NAMES: ReadonlySet<string> = new Set(ACTIONS);
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FRAME = /^[A-Za-z0-9_.-]{1,120}\.m?js:\d{1,7}:\d{1,7}$/;
const STEP = /^[a-z][a-z0-9_]{0,31}$/;
/** Lowercase path segments, each closed by a slash: `/`, `/sign/`, `/he/sign/`. */
const TOOL = /^\/(?:[a-z0-9-]{1,40}\/){0,3}$/;

/**
 * Accepts exactly these fields, each in its own shape, and nothing else: eight keys (an older build,
 * no `actions`, stored as `[]`), nine (with `actions`) or ten (with `actions` and `build`). A report
 * without `build` parses with no `build` key at all.
 * Run on both sides: the browser never sends what this rejects, and the
 * endpoint never stores it.
 */
export function parseErrorReport(value: unknown): ErrorReport | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value).filter((key) => key !== 'translated').sort();
  const expected = 'build' in value ? KEYS_WITH_BUILD : 'actions' in value ? KEYS_WITH_ACTIONS : KEYS;
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) return null;
  if ('translated' in value && typeof value.translated !== 'boolean') return null;
  const { actions, build, area, name, stack, step, tool, installed, sw, age } = value as Record<string, unknown>;
  if (typeof area !== 'string' || !AREAS.has(area)) return null;
  if (typeof name !== 'string' || !NAME.test(name)) return null;
  if (!Array.isArray(stack) || stack.length < 1 || stack.length > MAX_FRAMES) return null;
  if (!stack.every((frame) => typeof frame === 'string' && FRAME.test(frame))) return null;
  if (typeof step !== 'string' || !STEP.test(step)) return null;
  if (typeof tool !== 'string' || !TOOL.test(tool)) return null;
  if (typeof installed !== 'boolean' || typeof sw !== 'boolean') return null;
  if (typeof age !== 'string' || !AGES.has(age)) return null;
  const trail = actions === undefined && !('actions' in value) ? [] : actions;
  if (!Array.isArray(trail) || trail.length > MAX_ACTIONS) return null;
  if (!trail.every((action) => typeof action === 'string' && ACTION_NAMES.has(action))) return null;
  if ('build' in value && (typeof build !== 'string' || !BUILD.test(build))) return null;
  return Object.freeze({
    ...('build' in value ? { build: build as string } : {}),
    ...('translated' in value ? { translated: value.translated as boolean } : {}),
    actions: Object.freeze([...trail] as ActionName[]),
    area: area as ErrorArea,
    name,
    stack: Object.freeze([...stack] as string[]),
    step,
    tool,
    installed,
    sw,
    age: age as PageAge,
  });
}

/** Buckets `performance.now()`. Pure, so both sides and the tests share it. */
export function pageAge(ms: number): PageAge {
  if (!(ms >= 0) || ms < 10_000) return 'under_10s';
  if (ms < 60_000) return 'under_1m';
  if (ms < 600_000) return 'under_10m';
  return 'over_10m';
}

/**
 * A drop record (DEBT-44): what the browser sends instead of a report it will not send, so a counted
 * failure always leaves a trace. A Redact export failed five times on 10 Oct 2026 with no report at
 * all, and nothing could say why. Same privacy bar as a report, smaller: no stack, no message, no
 * page facts beyond `build`; every value an identifier our code wrote or an entry on a closed list.
 * - `reason`: why no report went: not an `Error` (`non_error`), no frame inside `/_astro/`
 *   (`no_frame`), a name on `IGNORED_NAMES` (`ignored`), pdf-lib's encrypted-file error
 *   (`encrypted`), or a report `parseErrorReport` refused (`invalid`);
 * - `type`: what was thrown, coarsely: a built-in error class, `custom` for any other `Error`
 *   subclass, or the `typeof` of anything that is not an `Error`;
 * - `name`: only when the error's name is on `DROP_NAMES`, so a minified or invented name never travels;
 * - `area`, `step`, `build`: as in a report.
 * A deduplicated or capped report is not a drop: its cause already travelled.
 */
export const DROP_REASONS = ['non_error', 'no_frame', 'ignored', 'encrypted', 'invalid'] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export const DROP_TYPES = [
  'Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError',
  'AggregateError', 'DOMException', 'custom',
  'string', 'number', 'bigint', 'boolean', 'symbol', 'undefined', 'object', 'function', 'null',
] as const;
export type DropType = (typeof DROP_TYPES)[number];

/**
 * Failures of the environment or of the person's own file, never of our code: a cancelled
 * operation, full or blocked storage, a refused permission, an encrypted, damaged or missing PDF.
 * `errorReport.ts` drops a report for these names (as reason `ignored`).
 */
export const IGNORED_NAMES = [
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
] as const;

/** Names a drop record may carry: the ignored ones, pdf-lib's encrypted error and the common DOMException names. */
export const DROP_NAMES = [
  ...IGNORED_NAMES,
  'EncryptedPDFError',
  'NotReadableError', 'NotFoundError', 'NotSupportedError', 'InvalidStateError', 'InvalidAccessError',
  'DataCloneError', 'DataError', 'NetworkError', 'TimeoutError', 'OperationError', 'UnknownError',
  'EncodingError', 'TransactionInactiveError', 'ReadOnlyError', 'VersionError', 'ConstraintError',
] as const;

export type DropRecord = Readonly<{
  kind: 'dropped';
  area: ErrorArea;
  step: string;
  reason: DropReason;
  type: DropType;
  name?: string;
  build?: string;
}>;

const DROP_KEYS: ReadonlySet<string> = new Set(['kind', 'area', 'step', 'reason', 'type', 'name', 'build']);
const DROP_REASON_SET: ReadonlySet<string> = new Set(DROP_REASONS);
const DROP_TYPE_SET: ReadonlySet<string> = new Set(DROP_TYPES);
const DROP_NAME_SET: ReadonlySet<string> = new Set(DROP_NAMES);

/**
 * Accepts exactly a drop record: the five required keys, optional `name` and `build`, nothing else.
 * Run on both sides, like `parseErrorReport`.
 */
export function parseDropRecord(value: unknown): DropRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!Object.keys(value).every((key) => DROP_KEYS.has(key))) return null;
  const { kind, area, step, reason, type, name, build } = value as Record<string, unknown>;
  if (kind !== 'dropped') return null;
  if (typeof area !== 'string' || !AREAS.has(area)) return null;
  if (typeof step !== 'string' || !STEP.test(step)) return null;
  if (typeof reason !== 'string' || !DROP_REASON_SET.has(reason)) return null;
  if (typeof type !== 'string' || !DROP_TYPE_SET.has(type)) return null;
  if ('name' in value && (typeof name !== 'string' || !DROP_NAME_SET.has(name))) return null;
  if ('build' in value && (typeof build !== 'string' || !BUILD.test(build))) return null;
  return Object.freeze({
    kind: 'dropped' as const,
    area: area as ErrorArea,
    step,
    reason: reason as DropReason,
    type: type as DropType,
    ...('name' in value ? { name: name as string } : {}),
    ...('build' in value ? { build: build as string } : {}),
  });
}

/** The counter field a drop record is stored under; an absent `name` or `build` reads `-`. */
export function dropRecordField(record: DropRecord, engine: string): string {
  const { area, step, reason, type, name, build } = record;
  return `${area}|${step}|${reason}|${type}|${name ?? '-'}|${build ?? '-'}|${engine}`;
}
