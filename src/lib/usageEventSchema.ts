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

// No imports, and none may be added: `api/report.ts` loads this file in the
// deployed function (see errorReportSchema.ts and functionImports.test.js).

export const ANALYTICS_TOOLS = [
  'merge',
  'split',
  'edit-pdf',
  'compress',
  'compress-image',
  'pdf-to-image',
  'image-to-pdf',
  'sign',
  'redact',
  'unlock',
  'protect',
] as const;
export type AnalyticsTool = (typeof ANALYTICS_TOOLS)[number];

/** In funnel order: `errors:read` prints the columns in this order. */
export const TOOL_LIFECYCLE_EVENTS = [
  'tool_file_accepted',
  'tool_operation_started',
  'tool_result_ready',
  'tool_operation_failed',
] as const;
export type ToolLifecycleEvent = (typeof TOOL_LIFECYCLE_EVENTS)[number];

/**
 * `build` (DEBT-44): the 7-character commit the page was built from, as in an error report, so a
 * day's failures can be told apart by release. Optional: a build without the stamp, or a cached
 * older build, sends `{tool}` alone.
 */
export type UsageEvent = Readonly<{
  name: ToolLifecycleEvent;
  properties: Readonly<{ tool: AnalyticsTool; build?: string }>;
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

/**
 * Accepts exactly `{name, properties: {tool}}` or `{name, properties: {tool, build}}`, with every
 * value off its list or in its shape, and nothing else. Run on both sides, like `parseErrorReport`.
 */
export function parseUsageEvent(value: unknown): UsageEvent | null {
  if (!isPlainObject(value) || !exactKeys(value, ['name', 'properties'])) return null;
  const { name, properties } = value;
  if (!has(TOOL_LIFECYCLE_EVENTS, name)) return null;
  if (!isPlainObject(properties)) return null;
  const stamped = 'build' in properties;
  if (!exactKeys(properties, stamped ? ['tool', 'build'] : ['tool'])) return null;
  if (!has(ANALYTICS_TOOLS, properties.tool)) return null;
  if (stamped && (typeof properties.build !== 'string' || !BUILD.test(properties.build))) return null;
  return Object.freeze({
    name: name as ToolLifecycleEvent,
    properties: Object.freeze({
      tool: properties.tool as AnalyticsTool,
      ...(stamped ? { build: properties.build as string } : {}),
    }),
  });
}

/**
 * The counter field an event is stored under: `tool_result_ready|merge`, or with its build
 * `tool_result_ready|merge|08e10cf`. `errors:read` sums both shapes per tool.
 */
export function usageEventField(event: UsageEvent): string {
  const { tool, build } = event.properties;
  return build ? `${event.name}|${tool}|${build}` : `${event.name}|${tool}`;
}
