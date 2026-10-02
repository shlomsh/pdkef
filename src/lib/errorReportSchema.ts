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
export type PageContext = Pick<ErrorReport, 'tool' | 'installed' | 'sw' | 'age' | 'actions' | 'build'>;

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
  const keys = Object.keys(value).sort();
  const expected = 'build' in value ? KEYS_WITH_BUILD : 'actions' in value ? KEYS_WITH_ACTIONS : KEYS;
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) return null;
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
