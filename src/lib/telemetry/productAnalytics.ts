/**
 * Anonymous product-health telemetry boundary.
 *
 * This is deliberately smaller than an event SDK's general API. It is the only
 * place tool code can emit lifecycle events, so document-derived values cannot
 * quietly become analytics properties.
 *
 * These go to our own `/api/report` as daily counts per tool (DEBT-28), because
 * Hobby did not record them as Vercel custom events.
 */

import { readSinkConfig, sendToSink } from './analyticsSink.ts';
import { sendBeacon } from './errorReport.ts';
import { resetFileArrivalForTests, takeArrival, takeArrivalTime, type Arrival } from '../handoff/fileArrival.ts';
import { collectPageMeasures, navigationType, pageSettled, pageViewMeasures, parseBuildCommit, timeBucket } from './pagePerformance.ts';
import { parseUsageEvent, type AnalyticsTool, type UsageEvent, type UsageEventName, type Since, type ViewOnlyPage, type Visit } from './usageEventSchema';
import { prepareToolHistory } from './toolHistory.ts';
import { readAndStampVisits } from './visitRecency.ts';
import { watchWorkerDownloads } from './workerDownloads.ts';

// The event and tool lists live in the import-free schema the endpoint shares (DEBT-28).
export {
  ANALYTICS_TOOLS,
  TOOL_LIFECYCLE_EVENTS,
  parseUsageEvent,
  type AnalyticsTool,
  type ToolLifecycleEvent,
  type UsageEvent,
} from './usageEventSchema';

export const MAX_USAGE_EVENTS_PER_PAGE = 40;
let handedOff = 0;
// `event|tool` pairs already handed off this page load; the next one of a pair is not `first`.
const seen = new Set<string>();

// The arrival of the file in front of the person (DEBT-58), and whether its first edit went out.
let current: Arrival | undefined;
let accepted = false;
let editSent = false;
// MEM-45: when the operation in progress started (performance.now), for `tool_result_ready`'s ms.
let startedAt: number | undefined;
// The visit and since buckets, read and stamped once per page load.
let visit: { value: { visit: Visit; since: Since } | undefined } | null = null;
// MEM-45: the tools-opened props for this page load's tool, prepared once and stamped when the view is handed off.
let history: { tool: string; value: ReturnType<typeof prepareToolHistory> } | null = null;
// MEM-45: whether this page load already asked the offline-copy worker for its download counts.
let watching = false;

export function resetUsageEventsForTests(): void {
  handedOff = 0;
  seen.clear();
  current = undefined;
  accepted = false;
  editSent = false;
  startedAt = undefined;
  visit = null;
  history = null;
  watching = false;
  resetFileArrivalForTests();
}

function pageVisit(): { visit: Visit; since: Since } | undefined {
  visit ??= { value: readAndStampVisits() };
  return visit.value;
}

function pageHistory(tool: AnalyticsTool | ViewOnlyPage, visits: unknown): ReturnType<typeof prepareToolHistory> {
  if (!visits || tool === 'home') return undefined;
  if (history?.tool !== tool) history = { tool, value: prepareToolHistory(tool) };
  return history.value;
}

const SOURCE_EVENTS: readonly UsageEventName[] = [
  'tool_first_edit',
  'tool_operation_started',
  'tool_result_ready',
  'tool_operation_failed',
];

/** The arrival properties an event carries: its own for an accepted file, the current one's source after. */
function arrivalProps(event: UsageEventName, arrival: Arrival | undefined): Partial<Arrival> {
  if (!arrival) return {};
  if (event === 'tool_file_accepted') return arrival;
  return SOURCE_EVENTS.includes(event) ? { source: arrival.source } : {};
}

/** The browser's navigation timing entries, read once per event; none for a browser without navigation timing. */
function navigationEntries(): PerformanceEntryList {
  try {
    return performance.getEntriesByType('navigation');
  } catch {
    // expected: a browser without navigation timing sends the event without nav or build
    return [];
  }
}

// MEM-45: only a person's own pick, drop, paste or replace is timed, and only while its mark is fresh: an
// older one belongs to a file that was turned away, not to the one being accepted now.
const TIMED_SOURCES: readonly string[] = ['pick', 'drop', 'paste', 'replace'];
const MAX_MARK_AGE_MS = 60_000;

/** A file's time to be accepted (from its arrival mark) or an operation's time to be ready (from its start). */
function timingBucket(event: UsageEventName, arrival?: { source?: string; at?: number }) {
  if (event === 'tool_operation_started') startedAt = now();
  if (event === 'tool_file_accepted') {
    const end = now();
    if (!arrival?.source || !TIMED_SOURCES.includes(arrival.source) || arrival.at === undefined || end === undefined) return undefined;
    return end - arrival.at > MAX_MARK_AGE_MS ? undefined : timeBucket(end - arrival.at);
  }
  if (event !== 'tool_result_ready') return undefined;
  const bucket = sinceBucket(startedAt);
  startedAt = undefined;
  return bucket;
}

/** Hands one funnel event to `/api/report` by beacon; capped per page, never throws. */
export function reportToolLifecycleEvent(event: UsageEventName, tool: AnalyticsTool, options: { untimed?: true } = {}): void {
  if (event === 'tool_page_viewed') void reportPageView(tool, now()); // reason: reportPageView catches everything itself
  else report(event, tool, {}, options.untimed);
}

const now = (): number | undefined => (typeof performance?.now === 'function' ? performance.now() : undefined);

/** Milliseconds since `from`, as a bucket; undefined when either end is unknown. */
const sinceBucket = (from: number | undefined) => {
  const end = now();
  return from === undefined || end === undefined ? undefined : timeBucket(end - from);
};

/**
 * MEM-45: the page view goes out once the window has loaded, so its request counts cover the page's own
 * load, carrying the measures the browser can give. `ready` is the time from navigation start to this
 * call, which the tool island makes from its first mount effect; the home page has none.
 */
async function reportPageView(tool: AnalyticsTool | ViewOnlyPage, mountedAt?: number): Promise<void> {
  // The view carries the time the page asked for it, before the settle wait, so it sorts ahead of later events.
  const at = new Date();
  try {
    // A page hidden before it loaded still counts: the view goes out at once, with no measures.
    const measures = (await pageSettled()) === 'loaded' ? await collectPageMeasures() : {};
    report('tool_page_viewed', tool, pageViewMeasures(measures, tool, mountedAt), false, at);
  } catch {
    // expected: a measure that cannot be taken never stops the view from counting
  }
}

/**
 * DEBT-61: the home page's one page view, with the same visit bucket and the same last-visit day as
 * the tool pages, so a person is counted once a day on the first PDkef page they see.
 */
export function reportHomePageView(): void {
  void reportPageView('home'); // reason: reportPageView catches everything itself
}

type Measures = Partial<Pick<UsageEvent['properties'], 'net' | 'local' | 'lcp' | 'ready' | 'ms'>>;

function report(event: UsageEventName, tool: AnalyticsTool | ViewOnlyPage, measures: Measures = {}, untimed = false, at?: Date): void {
  try {
    const navEntries = navigationEntries();
    const build = parseBuildCommit(navEntries);
    const pair = `${event}|${tool}`;
    const first = !seen.has(pair);
    const nav = navigationType(navEntries, first);
    const arrival = event === 'tool_file_accepted' ? takeArrival() : current;
    const ms = untimed ? undefined : timingBucket(event, event === 'tool_file_accepted' ? { source: arrival?.source, at: takeArrivalTime() } : undefined);
    const visits = event === 'tool_page_viewed' ? pageVisit() : undefined;
    const toolHistory = event === 'tool_page_viewed' ? pageHistory(tool, visits) : undefined;
    const parsed = parseUsageEvent({
      name: event,
      properties: {
        tool,
        ...(build ? { build } : {}),
        ...(first ? { first } : {}),
        ...(nav ? { nav } : {}),
        ...arrivalProps(event, arrival),
        ...(visits ?? {}),
        ...(toolHistory?.props ?? {}),
        ...measures,
        ...(ms ? { ms } : {}),
      },
    });
    // An acceptance nobody marked after a first one (Merge's Undo bringing back the last file it
    // removed) continues the file in front of the person: it keeps that file's source and first edit.
    if (event === 'tool_file_accepted' && (arrival || !accepted)) {
      current = arrival;
      accepted = true;
      editSent = false;
    }
    if (!parsed || handedOff >= MAX_USAGE_EVENTS_PER_PAGE) return;
    // The tools-opened values go to the analytics address only, never in the /api/report beacon.
    const { tools: _t, newtool: _n, firsttool: _f, ...beaconed } = parsed.properties;
    if (sendBeacon({ ...parsed, properties: beaconed })) {
      handedOff += 1;
      seen.add(pair);
      toolHistory?.commit();
      if (toolHistory) history = null; // a second view of this page load reads the stamped list
      sendToSink(parsed, at);
      if (event === 'tool_page_viewed') watchDownloads(tool);
    }
  } catch {
    // expected: Analytics must never alter an offline or local document workflow.
  }
}

/** MEM-45: once per page load, after its view went out: the worker's download counts go to the analytics address only, never to /api/report. */
function watchDownloads(tool: AnalyticsTool | ViewOnlyPage): void {
  if (watching || !readSinkConfig()) return;
  watching = true;
  watchWorkerDownloads((props) => {
    const parsed = parseUsageEvent({ name: 'worker_downloads', properties: { tool, ...props } });
    if (parsed && handedOff < MAX_USAGE_EVENTS_PER_PAGE) {
      handedOff += 1;
      sendToSink(parsed);
    }
  });
}

/**
 * DEBT-58: call on every committed, deliberate change to
 * the loaded file (an element added, a page moved, an option changed); never from pointermove. Sends
 * `tool_first_edit` once per accepted file and is a no-op after (and before any file is accepted),
 * so call sites need no state.
 */
export function reportEdit(tool: AnalyticsTool): void {
  if (!accepted || editSent) return;
  editSent = true;
  reportToolLifecycleEvent('tool_first_edit', tool);
}

/** A finished result. Sends `tool_result_ready`; when no operation is open, sends the started-and-ready pair back to back, untimed. */
export function reportResult(tool: AnalyticsTool): void {
  // With no timed start waiting for its result, the start goes out first and the pair is untimed.
  report('tool_result_ready', tool, {}, startedAt === undefined && (report('tool_operation_started', tool, {}, true), true));
}

/** A result handed to another tool. Counts as a result when this page load has reported none for the tool yet; a no-op after. */
export function reportHandedOn(tool: AnalyticsTool): void {
  if (!seen.has(`tool_result_ready|${tool}`)) reportResult(tool);
}
