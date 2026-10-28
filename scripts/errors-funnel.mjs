// Pure reading of the usage:<day> hashes (DEBT-58): the per-tool run table and the page-load funnel.
// Wire shapes live in src/lib/telemetry/usageEventSchema.ts (a script cannot import TS; errors-funnel.test.mjs pins them):
//   run     `<event>|<tool>`, `<event>|<tool>|<build>`, `<event>|<tool>|<build or ->|<source>`
//   once:   the same behind `once:`, counted on a page load's first event of its kind
//   pg:     `pg:<event>|<tool>|<source>|<from>|<nav>|<visit>`, `-` for absent, first events only
//   nav:    DEBT-57's older page-load field, not read here
// Nothing here does I/O; errors-read.mjs prints what these return.

export const EVENTS = [
  'tool_page_viewed',
  'tool_file_accepted',
  'tool_first_edit',
  'tool_operation_started',
  'tool_result_ready',
  'tool_operation_failed',
];
export const FRESH_SOURCES = ['pick', 'drop', 'paste', 'replace', 'recent', 'handoff'];
export const VISITS = ['new', 'today', 'week', 'month', 'older'];
const LANES = ['fresh', 'resume', 'unknown'];

const dash = (v) => (v === undefined || v === '-' || v === '' ? undefined : v);

/** One stored field to its parts, or null for a field this reader does not count (nav:, anything unknown). */
export function parseUsageField(field) {
  const f = String(field);
  if (f.startsWith('pg:')) {
    const [event, tool, source, from, nav, visit] = f.slice(3).split('|');
    if (!EVENTS.includes(event) || !tool) return null;
    return { kind: 'pg', event, tool, source: dash(source), from: dash(from), nav: dash(nav), visit: dash(visit) };
  }
  const once = f.startsWith('once:');
  const parts = (once ? f.slice(5) : f).split('|');
  const [event, tool, build, source] = parts;
  if (!EVENTS.includes(event) || !tool) return null;
  // Three parts: the third is a build. Four: build (or `-`), then the source, which is never a build.
  return { kind: once ? 'once' : 'run', event, tool, build: dash(build), source: dash(source) };
}

function eachField(result, visit) {
  for (let n = 0; n + 1 < (result?.length ?? 0); n += 2) {
    const parsed = parseUsageField(result[n]);
    const count = Number(result[n + 1]) || 0;
    if (parsed && count > 0) visit(parsed, count);
  }
}

/**
 * Sums the days into one row per tool, most accepted first. Row: tool, then run counts for the six events in
 * funnel order, then ready/accepted as a whole percent ('-' without accepted).
 */
export function sumUsage(results) {
  const byTool = new Map();
  for (const result of results) {
    eachField(result, (p, count) => {
      if (p.kind !== 'run') return;
      const row = byTool.get(p.tool) ?? EVENTS.map(() => 0);
      row[EVENTS.indexOf(p.event)] += count;
      byTool.set(p.tool, row);
    });
  }
  const A = EVENTS.indexOf('tool_file_accepted');
  const R = EVENTS.indexOf('tool_result_ready');
  return [...byTool]
    .filter(([, c]) => c.some(Boolean))
    .sort((a, b) => b[1][A] - a[1][A] || a[0].localeCompare(b[0]))
    .map(([tool, c]) => [tool, ...c, c[A] ? `${Math.round((c[R] / c[A]) * 100)}%` : '-']);
}

const laneOf = (source) => (!source ? 'unknown' : source === 'restore' ? 'resume' : 'fresh');

/**
 * Page loads per tool, from the `pg:` fields, plus the `once:` fields of days stored before DEBT-58, which
 * read as the unknown lane with no visit. The two never count the same page load: the store wrote one or
 * the other. Returns Map tool -> { lanes: {fresh|resume|unknown: counts by
 * event}, viewed, visits: {visit: n}, sources: {source: accepted n} }.
 */
export function funnelByTool(results) {
  const tools = new Map();
  const get = (tool) => {
    if (!tools.has(tool)) tools.set(tool, { lanes: Object.fromEntries(LANES.map((l) => [l, Object.fromEntries(EVENTS.map((e) => [e, 0]))])), viewed: 0, visits: {}, sources: {} });
    return tools.get(tool);
  };
  const add = (map, key, n) => { map[key] = (map[key] ?? 0) + n; };
  for (const result of results) {
    const once = new Map();
    eachField(result, (p, count) => {
      const key = `${p.event}|${p.tool}`;
      if (p.kind === 'once') once.set(key, (once.get(key) ?? 0) + count);
      if (p.kind !== 'pg') return;
      const t = get(p.tool);
      if (p.event === 'tool_page_viewed') {
        t.viewed += count;
        if (p.visit) add(t.visits, p.visit, count);
      } else {
        t.lanes[laneOf(p.source)][p.event] += count;
        if (p.event === 'tool_file_accepted') add(t.sources, p.source ?? 'unknown', count);
      }
    });
    // The store writes `once:` no more (DEBT-58), so whatever a day holds came from before the deploy: add it.
    for (const [key, extra] of once) {
      if (!(extra > 0)) continue;
      const [event, tool] = key.split('|');
      const t = get(tool);
      if (event === 'tool_page_viewed') t.viewed += extra;
      else {
        t.lanes.unknown[event] += extra;
        if (event === 'tool_file_accepted') add(t.sources, 'unknown', extra);
      }
    }
  }
  return tools;
}

const rank = (map, order) => Object.entries(map).sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
const list = (map, order) => rank(map, order).map(([k, n]) => `${k} ${n}`).join(', ');

/** The funnel as printable lines: one table, then per tool a visit line and an accepted-by-source line. */
export function funnelLines(results) {
  const tools = [...funnelByTool(results)].sort((a, b) => b[1].viewed - a[1].viewed || a[0].localeCompare(b[0]));
  const out = [];
  const lead = EVENTS.slice(1);
  for (const [tool, t] of tools) {
    const all = lead.map((e) => LANES.reduce((sum, l) => sum + t.lanes[l][e], 0));
    out.push(`${tool} | all | ${t.viewed} | ${all.join(' | ')}`);
    for (const lane of LANES) {
      const counts = lead.map((e) => t.lanes[lane][e]);
      if (counts.some(Boolean)) out.push(`${tool} | ${lane} | - | ${counts.join(' | ')}`);
    }
  }
  if (!out.length) return [];
  const lines = ['tool | lane | visited | file in front | first edit | asked | got it | failed', ...out];
  for (const [tool, t] of tools) {
    if (Object.keys(t.visits).length) lines.push(`${tool} visits: ${list(t.visits, VISITS)}`);
    if (Object.keys(t.sources).length) lines.push(`${tool} accepted by source: ${list(t.sources, FRESH_SOURCES)}`);
  }
  return lines;
}
