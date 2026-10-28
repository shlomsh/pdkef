/**
 * Tool usage events on the wire (DEBT-28): the one schema shared by the
 * browser that sends them (`productAnalytics.ts`) and `api/report.ts`, which
 * counts them per tool per day.
 *
 * Why here and not Vercel Analytics: these went out as Vercel custom events,
 * which the Hobby plan does not record, so the per-tool funnel (a file in,
 * started, ready, failed) was never seen by anyone. They now go to our own
 * address, like error reports and Sign's maintenance events.
 *
 * What travels is `{name, properties: {tool}}`: an event off the list below
 * and the tool's name off the list below. Nothing else: no file, no count, no
 * browser, no time finer than the day the endpoint files it under.
 */

// The one import is `toolIds.js` (ARCH-38), itself import-free: `api/report.ts` loads this file in the
// deployed function (see errorReportSchema.ts and functionImports.test.js), where a `.ts` specifier fails.
import { TOOL_IDS, type ToolId } from '../app/toolIds.js';

/** Every tool that counts as itself: the registry's ids (src/lib/app/toolIds.ts). */
export const ANALYTICS_TOOLS = TOOL_IDS;
export type AnalyticsTool = ToolId;

/**
 * DEBT-61: pages that only count their own views, on `tool_page_viewed` and nothing else. Not tools:
 * ratings, hand-offs and `from` never take them.
 */
const VIEW_ONLY_PAGES = ['home'] as const;
export type ViewOnlyPage = (typeof VIEW_ONLY_PAGES)[number];

/**
 * In funnel order: `errors:read` prints the columns in this order (DEBT-58).
 * `tool_page_viewed`: the tool page loaded. `tool_first_edit`: the first deliberate change to the
 * file in front of the person since it arrived (an element added, a page moved, an option changed).
 */
export const TOOL_LIFECYCLE_EVENTS = [
  'tool_page_viewed',
  'tool_file_accepted',
  'tool_first_edit',
  'tool_operation_started',
  'tool_result_ready',
  'tool_operation_failed',
] as const;
export type ToolLifecycleEvent = (typeof TOOL_LIFECYCLE_EVENTS)[number];

/**
 * `build` (DEBT-44): the 7-character commit the page was built from, as in an error report, so a
 * day's failures can be told apart by release. Optional: a build without the stamp, or a cached
 * older build, sends `{tool}` alone.
 *
 * `first` (DEBT-48): true on the first event of its kind from this tool in a page load, so the
 * endpoint can also count page loads. Only ever the literal true; it says nothing about the person or file.
 *
 * `nav` (DEBT-57): on a `first` event only, how the page load started, as the browser's own
 * navigation timing names it. 178 page loads opened a file in Redact on 19 Oct 2026 against about 33
 * visitors, and nothing could say whether they were reloads or fresh arrivals. It links no page load
 * to another.
 */
export const NAVIGATION_TYPES = ['navigate', 'reload', 'back_forward', 'prerender'] as const;
export type NavigationType = (typeof NAVIGATION_TYPES)[number];

/**
 * `source` (DEBT-58): how the file in front of the person got there. On `tool_file_accepted` it is
 * that arrival; on every later event (first edit, started, ready, failed) it is the arrival of the
 * file those events are about, so the fresh lane and the resume lane can be read apart from daily
 * counts alone. Never on `tool_page_viewed`.
 *   pick / drop / paste - chosen here; replace - chosen over a loaded file;
 *   recent - a recent-file tile on the home page; handoff - another tool's done row;
 *   restore - the tool reopened the work it was on, with nobody asking.
 * @testSeam
 */
export const FILE_SOURCES = ['pick', 'drop', 'paste', 'replace', 'recent', 'handoff', 'restore'] as const;
export type FileSource = (typeof FILE_SOURCES)[number];

/**
 * `visit` (DEBT-58): on `tool_page_viewed` only, whether this browser has opened a PDkef tool page
 * before and how long ago, decided on the device from a day it keeps for itself and never sends.
 * `new`, or returning: `today`, `week` (1-7 days), `month` (8-30), `older`. It links nothing.
 * @testSeam
 */
export const VISITS = ['new', 'today', 'week', 'month', 'older'] as const;
export type Visit = (typeof VISITS)[number];

export type UsageEvent = Readonly<{
  name: ToolLifecycleEvent;
  properties: Readonly<{
    tool: AnalyticsTool | ViewOnlyPage;
    build?: string;
    first?: true;
    nav?: NavigationType;
    source?: FileSource;
    /** With `source: 'handoff'` on `tool_file_accepted` only: the tool that handed the file on. */
    from?: AnalyticsTool;
    visit?: Visit;
  }>;
}>;

const BUILD = /^[0-9a-f]{7}$/;

const has = (list: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && list.includes(value);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, i) => key === actual[i]);
}

const OPTIONAL_KEYS = ['build', 'first', 'nav', 'source', 'from', 'visit'] as const;

/**
 * Accepts exactly `{name, properties: {tool}}` plus any of the optional properties above, each value
 * off its list or in its shape, each only where its comment allows, and nothing else. Run on both
 * sides, like `parseErrorReport`.
 */
export function parseUsageEvent(value: unknown): UsageEvent | null {
  if (!isPlainObject(value) || !exactKeys(value, ['name', 'properties'])) return null;
  const { name, properties } = value;
  if (!has(TOOL_LIFECYCLE_EVENTS, name)) return null;
  if (!isPlainObject(properties)) return null;
  const present = OPTIONAL_KEYS.filter((key) => key in properties);
  if (!exactKeys(properties, ['tool', ...present])) return null;
  const p = properties as Record<string, unknown>;
  const on = (key: (typeof OPTIONAL_KEYS)[number]) => present.includes(key);
  if (!has(ANALYTICS_TOOLS, p.tool) && !(name === 'tool_page_viewed' && has(VIEW_ONLY_PAGES, p.tool))) return null;
  if (on('build') && (typeof p.build !== 'string' || !BUILD.test(p.build))) return null;
  if (on('first') && p.first !== true) return null;
  if (on('nav') && (!on('first') || !has(NAVIGATION_TYPES, p.nav))) return null;
  if (on('source') && (name === 'tool_page_viewed' || !has(FILE_SOURCES, p.source))) return null;
  if (on('from') && (name !== 'tool_file_accepted' || p.source !== 'handoff' || !has(ANALYTICS_TOOLS, p.from))) return null;
  if (on('visit') && (name !== 'tool_page_viewed' || !has(VISITS, p.visit))) return null;
  return Object.freeze({
    name: name as ToolLifecycleEvent,
    properties: Object.freeze({
      tool: p.tool as AnalyticsTool | ViewOnlyPage,
      ...(on('build') ? { build: p.build as string } : {}),
      ...(on('first') ? { first: true as const } : {}),
      ...(on('nav') ? { nav: p.nav as NavigationType } : {}),
      ...(on('source') ? { source: p.source as FileSource } : {}),
      ...(on('from') ? { from: p.from as AnalyticsTool } : {}),
      ...(on('visit') ? { visit: p.visit as Visit } : {}),
    }),
  });
}

/**
 * The counter field an event is stored under: `tool_result_ready|merge`, with its build
 * `tool_result_ready|merge|08e10cf`, and with a source `tool_result_ready|merge|08e10cf|restore`
 * (`-` in the build slot when there is none: `tool_result_ready|merge|-|restore`). `errors:read`
 * reads all three shapes.
 */
export function usageEventField(event: UsageEvent): string {
  const { tool, build, source } = event.properties;
  if (source) return `${event.name}|${tool}|${build ?? '-'}|${source}`;
  return build ? `${event.name}|${tool}|${build}` : `${event.name}|${tool}`;
}

/**
 * Everything about a page load's first event of its kind, in one counter so it costs one command
 * (DEBT-58, replacing DEBT-48's `once:` and DEBT-57's `nav:` fields, which older days still hold): `pg:<event>|<tool>|<source>|<from>|<nav>|<visit>`,
 * `-` for each one absent. Undefined on an event that is not `first`.
 */
export const usagePageField = (event: UsageEvent): string | undefined => {
  const { tool, first, source, from, nav, visit } = event.properties;
  if (!first) return undefined;
  return `pg:${event.name}|${tool}|${source ?? '-'}|${from ?? '-'}|${nav ?? '-'}|${visit ?? '-'}`;
};
