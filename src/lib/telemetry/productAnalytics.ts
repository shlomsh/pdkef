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

import { readBuildCommit, sendBeacon } from './errorReport.ts';
import { resetFileArrivalForTests, takeArrival, type Arrival } from '../handoff/fileArrival.ts';
import { NAVIGATION_TYPES, parseUsageEvent, type AnalyticsTool, type NavigationType, type ToolLifecycleEvent, type ViewOnlyPage, type Visit } from './usageEventSchema';
import { readAndStampVisit } from './visitRecency.ts';

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
// The visit bucket, read and stamped once per page load.
let visit: { value: Visit | undefined } | null = null;

export function resetUsageEventsForTests(): void {
  handedOff = 0;
  seen.clear();
  current = undefined;
  accepted = false;
  editSent = false;
  visit = null;
  resetFileArrivalForTests();
}

function pageVisit(): Visit | undefined {
  visit ??= { value: readAndStampVisit() };
  return visit.value;
}

const SOURCE_EVENTS: readonly ToolLifecycleEvent[] = [
  'tool_first_edit',
  'tool_operation_started',
  'tool_result_ready',
  'tool_operation_failed',
];

/** The arrival properties an event carries: its own for an accepted file, the current one's source after. */
function arrivalProps(event: ToolLifecycleEvent, arrival: Arrival | undefined): Partial<Arrival> {
  if (!arrival) return {};
  if (event === 'tool_file_accepted') return arrival;
  return SOURCE_EVENTS.includes(event) ? { source: arrival.source } : {};
}

/** How this page load started, off the browser's navigation timing (DEBT-57); undefined when it names none on the list. */
function readNavigationType(): NavigationType | undefined {
  try {
    const type = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
    return (NAVIGATION_TYPES as readonly string[]).includes(type as string) ? (type as NavigationType) : undefined;
  } catch {
    // expected: a browser without navigation timing sends the event without nav
    return undefined;
  }
}

/** Hands one funnel event to `/api/report` by beacon; capped per page, never throws. */
export function reportToolLifecycleEvent(event: ToolLifecycleEvent, tool: AnalyticsTool): void {
  report(event, tool);
}

/**
 * DEBT-61: the home page's one page view, with the same visit bucket and the same last-visit day as
 * the tool pages, so a person is counted once a day on the first PDkef page they see.
 */
export function reportHomePageView(): void {
  report('tool_page_viewed', 'home');
}

function report(event: ToolLifecycleEvent, tool: AnalyticsTool | ViewOnlyPage): void {
  try {
    const build = readBuildCommit();
    const pair = `${event}|${tool}`;
    const first = !seen.has(pair);
    const nav = first ? readNavigationType() : undefined;
    const arrival = event === 'tool_file_accepted' ? takeArrival() : current;
    const visitProp = event === 'tool_page_viewed' ? pageVisit() : undefined;
    const parsed = parseUsageEvent({
      name: event,
      properties: {
        tool,
        ...(build ? { build } : {}),
        ...(first ? { first } : {}),
        ...(nav ? { nav } : {}),
        ...arrivalProps(event, arrival),
        ...(visitProp ? { visit: visitProp } : {}),
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
    if (sendBeacon(parsed)) {
      handedOff += 1;
      seen.add(pair);
    }
  } catch {
    // expected: Analytics must never alter an offline or local document workflow.
  }
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
