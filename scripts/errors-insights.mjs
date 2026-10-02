// Pure helpers for the daily error read: turn the Upstash pipeline replies into per-day data, then
// answer "is this fingerprint new?", "how often has it recurred?" and "is a tool failing more than usual?".

// factor: how many times its earlier failure rate; minFailed: fewer failures than this never flag;
// minBaselineStarts: an earlier history with fewer starts is too thin to compare against;
// noBaselineRate: with nothing to compare against, flag only when at least this share of runs fails.
export const RISING = { factor: 2, minFailed: 3, minBaselineStarts: 5, noBaselineRate: 0.2 };

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const pairs = (reply) => {
  const r = reply && reply.result;
  const out = [];
  if (!Array.isArray(r)) return out;
  for (let i = 0; i + 1 < r.length; i += 2) out.push([String(r[i]), r[i + 1]]);
  return out;
};

const countMap = (reply) => new Map(pairs(reply).map(([k, v]) => [k, toNum(v)]));
const sampleMap = (reply) => new Map(pairs(reply).map(([k, v]) => [k, String(v)]));
const getNum = (reply) => toNum(reply && reply.result);

// Reply order: [errors, sample] per day, then events, usage, errorTotal, usageTotal, one per day each.
export function parseDayReplies(replies, keys) {
  const r = Array.isArray(replies) ? replies : [];
  const n = keys.length;
  return keys.map((day, i) => ({
    day,
    counts: countMap(r[2 * i]),
    samples: sampleMap(r[2 * i + 1]),
    usage: countMap(r[3 * n + i]),
    errorTotal: getNum(r[4 * n + i]),
    usageTotal: getNum(r[5 * n + i]),
  }));
}

// The fetch covers `total` days; the printed window is the first `n`. Returns the replies a fetch of
// just `n` days would have returned, so the existing per-window parsing keeps working unchanged:
// [errors, sample] for each of n days, then events, usage, errorTotal, usageTotal for each of n days.
export function sliceWindow(replies, total, n) {
  const r = Array.isArray(replies) ? replies : [];
  const out = [];
  // A missing reply comes back as an empty one: consumers destructure `{ result }`.
  const at = (i) => r[i] ?? { result: null };
  for (let i = 0; i < 2 * n; i++) out.push(at(i));
  for (const block of [2, 3, 4, 5]) for (let i = 0; i < n; i++) out.push(at(block * total + i));
  return out;
}

export function fingerprintHistory(perDay, windowDays) {
  const win = perDay.slice(0, windowDays);
  const history = perDay.slice(windowDays);
  const noHistory = history.length === 0;
  const out = new Map();
  for (const d of win) {
    for (const [f, c] of d.counts) {
      if (c > 0) out.set(f, (out.get(f) || 0) + c);
    }
  }
  const result = new Map();
  for (const [field, windowCount] of out) {
    let firstSeen = null;
    let daysSeen = 0;
    for (const d of perDay) {
      if ((d.counts.get(field) || 0) > 0) {
        daysSeen++;
        if (firstSeen === null || d.day < firstSeen) firstSeen = d.day;
      }
    }
    const isNew = !history.some((d) => (d.counts.get(field) || 0) > 0);
    const entry = { windowCount, firstSeen, daysSeen, historyDays: perDay.length, isNew, recurring: !isNew };
    if (noHistory) entry.noHistory = true;
    result.set(field, entry);
  }
  return result;
}

const EVENT_KEY = {
  tool_file_accepted: 'accepted',
  tool_operation_started: 'started',
  tool_result_ready: 'ready',
  tool_operation_failed: 'failed',
};

const emptyTotals = () => ({ accepted: 0, started: 0, ready: 0, failed: 0 });

function sumByTool(days) {
  const m = new Map();
  for (const d of days) {
    for (const [field, count] of d.usage) {
      const i = field.indexOf('|');
      const key = EVENT_KEY[field.slice(0, i)];
      if (i < 0 || !key) continue;
      const tool = field.slice(i + 1);
      if (!m.has(tool)) m.set(tool, emptyTotals());
      m.get(tool)[key] += count;
    }
  }
  return m;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const multiple = (x) => `${Number(x.toFixed(1))}x`;

export function toolRates(perDay, windowDays, opts = {}) {
  const factor = opts.factor ?? RISING.factor;
  const minFailed = opts.minFailed ?? RISING.minFailed;
  const minBaselineStarts = opts.minBaselineStarts ?? RISING.minBaselineStarts;
  const noBaselineRate = opts.noBaselineRate ?? RISING.noBaselineRate;
  const history = perDay.slice(windowDays);
  const win = sumByTool(perDay.slice(0, windowDays));
  const base = sumByTool(history);
  const rows = [];
  for (const [tool, w] of win) {
    if (!(w.accepted || w.started || w.ready || w.failed)) continue;
    const b = history.length ? base.get(tool) || emptyTotals() : null;
    const rate = w.started > 0 ? w.failed / w.started : null;
    const baselineRate = b && b.started >= minBaselineStarts ? b.failed / b.started : null;
    const cmpRate = w.started === 0 && w.failed >= minFailed ? Infinity : rate;
    const flag =
      w.failed >= minFailed &&
      (baselineRate === null
        ? rate === null || rate >= noBaselineRate
        : cmpRate !== null && cmpRate >= factor * baselineRate);
    const head = w.started > 0 ? `failed ${w.failed} of ${w.started} started (${pct(rate)})` : `failed ${w.failed}, no starts recorded`;
    let why;
    if (baselineRate === null) {
      const gap = !history.length
        ? 'no earlier history to compare'
        : b && b.started > 0
          ? `earlier history too thin (${b.started} start${b.started === 1 ? '' : 's'})`
          : 'no earlier starts to compare';
      why = w.started > 0 ? `failed ${w.failed}, ${gap}` : `failed ${w.failed}, no starts recorded, ${gap}`;
    } else if (baselineRate === 0) {
      why = `${head}, none failed earlier`;
    } else if (rate === null) {
      why = `${head}, earlier ${pct(baselineRate)}`;
    } else {
      why = `${head}, ${multiple(rate / baselineRate)} the earlier ${pct(baselineRate)}`;
    }
    rows.push({ tool, window: w, baseline: b, rate, baselineRate, flag, why });
  }
  rows.sort((a, b) => b.window.failed - a.window.failed || a.tool.localeCompare(b.tool));
  return rows;
}
