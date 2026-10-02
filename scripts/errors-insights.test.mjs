import { describe, expect, it } from 'vitest';
import {
  RISING,
  fingerprintHistory,
  parseDayReplies,
  sliceWindow,
  toolRates,
} from './errors-insights.mjs';

const flat = (obj) => Object.entries(obj).flatMap(([k, v]) => [k, String(v)]);
const ok = (result) => ({ result });

// Builds replies in errors-read.mjs order for the given days (newest first).
function build(days) {
  const n = days.length;
  const replies = [];
  for (const d of days) {
    replies.push(ok(flat(d.counts || {})), ok(flat(d.samples || {})));
  }
  for (let i = 0; i < n; i++) replies.push(ok(null)); // events
  for (const d of days) replies.push(ok(flat(d.usage || {})));
  for (const d of days) replies.push(ok(d.errorTotal == null ? null : String(d.errorTotal)));
  for (const d of days) replies.push(ok(d.usageTotal == null ? null : String(d.usageTotal)));
  return replies;
}

const day = (d, o = {}) => ({
  day: d,
  counts: new Map(Object.entries(o.counts || {})),
  samples: new Map(Object.entries(o.samples || {})),
  usage: new Map(Object.entries(o.usage || {})),
  errorTotal: 0,
  usageTotal: 0,
});

describe('parseDayReplies', () => {
  it('reads the layout, newest first', () => {
    const replies = build([
      { counts: { 'a|E|c.js:1:1|s|e': 3 }, samples: { 'a|E|c.js:1:1|s|e': '{"x":1}' }, usage: { 'tool_operation_failed|redact': 2 }, errorTotal: 3, usageTotal: 9 },
      { counts: { 'b|E|c.js:2:2|s|e': 1 }, errorTotal: 1, usageTotal: 4 },
    ]);
    const out = parseDayReplies(replies, ['2026-10-02', '2026-10-01']);
    expect(out.map((d) => d.day)).toEqual(['2026-10-02', '2026-10-01']);
    expect(out[0].counts.get('a|E|c.js:1:1|s|e')).toBe(3);
    expect(out[0].samples.get('a|E|c.js:1:1|s|e')).toBe('{"x":1}');
    expect(out[0].usage.get('tool_operation_failed|redact')).toBe(2);
    expect(out[0].errorTotal).toBe(3);
    expect(out[0].usageTotal).toBe(9);
    expect(out[1].counts.get('b|E|c.js:2:2|s|e')).toBe(1);
    expect(out[1].errorTotal).toBe(1);
  });

  it('tolerates null, empty, odd and short replies', () => {
    const out = parseDayReplies([null, { result: null }, undefined], ['d1', 'd2']);
    expect(out).toHaveLength(2);
    expect(out[0].counts.size).toBe(0);
    expect(out[0].errorTotal).toBe(0);
    expect(out[1].usageTotal).toBe(0);
    expect(() => parseDayReplies(undefined, ['d1'])).not.toThrow();
  });

  it('drops a dangling field of an odd-length array and zeroes a bad count', () => {
    const replies = [ok(['a', '2', 'dangling']), ok(null), ok(null), ok(['t|x', 'nope']), ok('zz'), ok('7')];
    const [d] = parseDayReplies(replies, ['d1']);
    expect([...d.counts]).toEqual([['a', 2]]);
    expect(d.usage.get('t|x')).toBe(0);
    expect(d.errorTotal).toBe(0);
    expect(d.usageTotal).toBe(7);
  });
});

describe('fingerprintHistory', () => {
  const perDay = [
    day('d4', { counts: { onlyWin: 2, both: 1 } }),
    day('d3', { counts: { both: 3 } }),
    day('d2', { counts: { both: 1, oldOnly: 5 } }),
    day('d1', { counts: { both: 1 } }),
  ];

  it('marks a window-only field new', () => {
    const h = fingerprintHistory(perDay, 2);
    expect(h.get('onlyWin')).toMatchObject({ windowCount: 2, firstSeen: 'd4', daysSeen: 1, historyDays: 4, isNew: true, recurring: false });
    expect(h.get('onlyWin').noHistory).toBeUndefined();
  });

  it('marks a field in older days recurring with firstSeen and daysSeen', () => {
    const h = fingerprintHistory(perDay, 2);
    expect(h.get('both')).toMatchObject({ windowCount: 4, firstSeen: 'd1', daysSeen: 4, historyDays: 4, isNew: false, recurring: true });
  });

  it('does not return a field only in history', () => {
    expect(fingerprintHistory(perDay, 2).has('oldOnly')).toBe(false);
  });

  it('flags noHistory when there is no history', () => {
    const h = fingerprintHistory(perDay, 4);
    expect(h.get('both')).toMatchObject({ isNew: true, recurring: false, noHistory: true });
    expect(h.get('onlyWin').noHistory).toBe(true);
  });
});

describe('toolRates', () => {
  const win = day('d2', {
    usage: {
      'tool_file_accepted|redact': 54, 'tool_operation_started|redact': 21, 'tool_result_ready|redact': 10, 'tool_operation_failed|redact': 11,
      'tool_file_accepted|unlock': 4, 'tool_operation_started|unlock': 9, 'tool_result_ready|unlock': 2, 'tool_operation_failed|unlock': 7,
      'tool_file_accepted|protect': 3, 'tool_operation_started|protect': 4, 'tool_result_ready|protect': 4,
      'tool_file_accepted|sign': 2,
    },
  });
  const hist = day('d1', {
    usage: {
      'tool_operation_started|redact': 40, 'tool_operation_failed|redact': 4,
      'tool_operation_started|unlock': 20, 'tool_operation_failed|unlock': 12,
      'tool_operation_started|protect': 10,
    },
  });
  const by = (rows, t) => rows.find((r) => r.tool === t);

  it('exports the defaults', () => {
    expect(RISING).toEqual({ factor: 2, minFailed: 3, minBaselineStarts: 5, noBaselineRate: 0.2 });
  });

  it('flags redact against its baseline and sorts by failed', () => {
    const rows = toolRates([win, hist], 1);
    expect(rows.map((r) => r.tool)).toEqual(['redact', 'unlock', 'protect', 'sign']);
    const r = by(rows, 'redact');
    expect(r.window).toEqual({ accepted: 54, started: 21, ready: 10, failed: 11 });
    expect(r.baseline).toEqual({ accepted: 0, started: 40, ready: 0, failed: 4 });
    expect(r.rate).toBeCloseTo(11 / 21);
    expect(r.baselineRate).toBeCloseTo(0.1);
    expect(r.flag).toBe(true);
    expect(r.why).toBe('failed 11 of 21 started (52%), 5.2x the earlier 10%');
  });

  it('does not flag a tool that is merely as bad as usual', () => {
    const r = by(toolRates([win, hist], 1), 'unlock'); // 7/9 vs 12/20
    expect(r.flag).toBe(false);
  });

  it('does not flag a quiet tool or failures below minFailed', () => {
    const rows = toolRates([day('d2', { usage: { 'tool_operation_started|a': 3, 'tool_operation_failed|a': 2, 'tool_file_accepted|b': 5 } }), hist], 1);
    expect(by(rows, 'a').flag).toBe(false);
    expect(by(rows, 'b').flag).toBe(false);
    expect(by(rows, 'protect')).toBeUndefined();
  });

  it('flags failures with no history, and says so', () => {
    const r = by(toolRates([win], 1), 'redact');
    expect(r.baseline).toBeNull();
    expect(r.baselineRate).toBeNull();
    expect(r.flag).toBe(true);
    expect(r.why).toBe('failed 11, no earlier history to compare');
    expect(by(toolRates([win], 1), 'protect').flag).toBe(false);
  });

  it('flags failures when the history never started the tool', () => {
    const r = by(toolRates([win, day('d1')], 1), 'redact');
    expect(r.baselineRate).toBeNull();
    expect(r.flag).toBe(true);
  });

  it('handles started 0 with failures', () => {
    const w = day('d2', { usage: { 'tool_operation_failed|x': 4 } });
    const r = toolRates([w, hist], 1)[0];
    expect(r.rate).toBeNull();
    expect(r.flag).toBe(true);
    expect(r.why).toContain('failed 4');
    expect(r.why).toContain('no starts');
  });

  it('honours opts', () => {
    const rows = toolRates([win, hist], 1, { minFailed: 20 });
    expect(by(rows, 'redact').flag).toBe(false);
  });

  it('sorts ties by tool name', () => {
    const w = day('d2', { usage: { 'tool_operation_failed|b': 1, 'tool_operation_failed|a': 1 } });
    expect(toolRates([w], 1).map((r) => r.tool)).toEqual(['a', 'b']);
  });
});

describe('sliceWindow', () => {
  // A reply is { result }; tag each so the layout can be read back: e/s per day, then events, usage, totals.
  const layout = (n) => {
    const r = [];
    for (let i = 0; i < n; i++) r.push({ result: `errors${i}` }, { result: `sample${i}` });
    for (let i = 0; i < n; i++) r.push({ result: `events${i}` });
    for (let i = 0; i < n; i++) r.push({ result: `usage${i}` });
    for (let i = 0; i < n; i++) r.push({ result: `etotal${i}` });
    for (let i = 0; i < n; i++) r.push({ result: `utotal${i}` });
    return r;
  };
  it('keeps the first n days of every block, in the layout a window of n days would have fetched', () => {
    expect(sliceWindow(layout(5), 5, 2)).toEqual(layout(2));
  });
  it('is the identity when the window is the whole fetch', () => {
    expect(sliceWindow(layout(3), 3, 3)).toEqual(layout(3));
  });
  it('tolerates short or non-array replies', () => {
    expect(sliceWindow(undefined, 3, 2)).toHaveLength(12);
    // A consumer destructures `{ result }`, so a missing reply must come back as an empty one, not undefined.
    expect(sliceWindow([], 3, 2).every((x) => x && x.result === null)).toBe(true);
  });
});

describe('toolRates, baselines that cannot be trusted', () => {
  const by = (rows, t) => rows.find((r) => r.tool === t);
  const u = (started, failed) => ({ 'tool_operation_started|t': started, 'tool_operation_failed|t': failed });

  it('a baseline of a few starts is too thin to compare: a low failure rate is not flagged', () => {
    const rows = toolRates([day('w', { usage: u(1000, 3) }), day('h', { usage: u(1, 0) })], 1);
    const r = by(rows, 't');
    expect(r.baselineRate).toBeNull();
    expect(r.flag).toBe(false);
    expect(r.why).toContain('too thin (1 start)');
  });
  it('without a usable baseline, a high failure rate still flags', () => {
    const r = by(toolRates([day('w', { usage: u(10, 5) }), day('h', { usage: u(2, 0) })], 1), 't');
    expect(r.flag).toBe(true);
  });
  it('without any history, 3 failures in 1000 is not flagged but 3 in 10 is', () => {
    expect(by(toolRates([day('w', { usage: u(1000, 3) })], 1), 't').flag).toBe(false);
    expect(by(toolRates([day('w', { usage: u(10, 3) })], 1), 't').flag).toBe(true);
  });
  it('a baseline with starts and no failures flags new failures, and says none failed earlier', () => {
    const r = by(toolRates([day('w', { usage: u(100, 3) }), day('h', { usage: u(20, 0) })], 1), 't');
    expect(r.flag).toBe(true);
    expect(r.why).toContain('none failed earlier');
  });
  it('failures with no starts in the window flag against a real baseline', () => {
    const r = by(toolRates([day('w', { usage: u(0, 4) }), day('h', { usage: u(20, 2) })], 1), 't');
    expect(r.flag).toBe(true);
    expect(r.why).toContain('no starts recorded');
  });
});
