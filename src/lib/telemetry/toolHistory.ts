/**
 * The tools this browser has opened (MEM-45): decided on the device for `tool_page_viewed`'s `tools`,
 * `newtool` and `firsttool`. The browser keeps the ids of the tools it has opened, in order of first
 * opening, as `{"v":1,"tools":[...]}`. The list exists from LIST_START on; a browser first seen
 * before then (its first-visit day, kept by visitRecency.ts) and holding no list sends nothing, since
 * its history is unknown. Only the buckets travel, never the list or the key, so no event can be tied
 * to another.
 */
import { ANALYTICS_TOOLS, type AnalyticsTool, type ToolCount } from './usageEventSchema';
import { FIRST_VISIT_KEY } from './visitRecency.ts';

const KEY = 'pdkef:tools-opened';
/** The local day the list was first kept. */
const LIST_START = '2026-11-17';

type ToolHistoryProps = { tools: ToolCount; firsttool: AnalyticsTool; newtool?: true };

const bucket = (n: number): ToolCount => (n >= 4 ? '4+' : (String(n) as ToolCount));

/** The stored list, or undefined when absent, unreadable or empty. */
function read(stored: string | null): AnalyticsTool[] | undefined {
  try {
    const value = JSON.parse(stored ?? 'null');
    const tools = value?.v === 1 && Array.isArray(value.tools)
      ? value.tools.filter((t: unknown) => (ANALYTICS_TOOLS as readonly unknown[]).includes(t))
      : [];
    return tools.length ? tools : undefined;
  } catch {
    // expected: a damaged value is the same as none
    return undefined;
  }
}

/**
 * Pure: what to store and what the page view carries for this tool, given the stored list and this
 * browser's first-visit day. Nothing when the browser has no list and was first seen before LIST_START.
 * @testSeam
 */
export function nextToolHistory(stored: string | null, tool: AnalyticsTool, firstDay: string | null): { write?: string; props?: ToolHistoryProps } {
  let tools = read(stored);
  if (!tools) {
    if (!firstDay || !/^\d{4}-\d{2}-\d{2}$/.test(firstDay) || firstDay < LIST_START) return {};
    tools = [];
  }
  const newtool = !tools.includes(tool);
  if (newtool) tools = [...tools, tool];
  return {
    write: JSON.stringify({ v: 1, tools }),
    props: { tools: bucket(tools.length), firsttool: tools[0], ...(newtool ? { newtool: true as const } : {}) },
  };
}

/**
 * Reads this browser's list and first-visit day and returns the page view's props with a `commit` that
 * stamps the tool; the caller commits once the page view was handed off. Undefined when there is
 * nothing to send or no storage.
 */
export function prepareToolHistory(tool: AnalyticsTool): { props: ToolHistoryProps; commit(): void } | undefined {
  try {
    const { write, props } = nextToolHistory(localStorage.getItem(KEY), tool, localStorage.getItem(FIRST_VISIT_KEY));
    if (!props || !write) return undefined;
    return {
      props,
      commit() {
        try {
          localStorage.setItem(KEY, write);
        } catch {
          // expected: storage full; the next view sees the tool as new again
        }
      },
    };
  } catch {
    // expected: no storage (private mode, blocked): the page view goes without them
    return undefined;
  }
}
