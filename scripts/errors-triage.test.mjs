import { describe, expect, it } from 'vitest';
import { renderTriage, triage } from './errors-triage.mjs';

const ENTRIES = [
  { id: 'ENC-02', ticket: 'ENC-02', title: 'Redact on a protected PDF', match: { area: 'redact', step: ['export', 'list_objects'], slug: 'redact', module: 'pdf-lib' }, fixedIn: 'bb156a5b' },
  { id: 'DEBT-34', ticket: 'DEBT-34', title: 'Unlock Buffer', match: { area: 'pdf_tool_run', name: 'ReferenceError', step: 'unlock', slug: 'unlock' }, fixedIn: '01bf5820' },
  { id: 'OPEN-1', ticket: 'OPEN-1', title: 'a known open one', match: { area: 'drafts' }, open: true },
];

// A fake git: the answer to `merge-base --is-ancestor <older> <newer>` by key "older>newer": 'yes' | 'no' | 'err'.
const gitWith = (answers) => (args) => {
  const key = `${args[2]}>${args[3]}`;
  const a = answers[key] ?? 'err';
  if (a === 'yes') return '';
  throw Object.assign(new Error(a), { status: a === 'no' ? 1 : 128 });
};

const REDACT_EXPORT = 'redact|um|pdf-lib.CqiVumd9.js:45:2284|export|chromium-154';
const UNLOCK = 'pdf_tool_run|ReferenceError|pdf-lib.CqiVumd9.js:12:36319|unlock|chromium-154';
const PDFJS = 'redact|TypeError|pdf.Zn9K1YuS.js:44:99875|read_glyphs|chromium-143';
const DRAFTS = 'drafts|QuotaExceededError|useDraftPersistence.AbCdEfGh.js:1:2|save|chromium-150';

const sample = (tool, build) => JSON.stringify({ tool, step: 'x', stack: [], ...(build ? { build } : {}) });
const hist = (over = {}) => ({ windowCount: 1, firstSeen: '2026-10-02', daysSeen: 1, historyDays: 14, isNew: true, recurring: false, ...over });

function run(rows, { samples = {}, history = {}, answers = {} } = {}) {
  return triage({
    table: rows,
    samples: new Map(Object.entries(samples)),
    history: new Map(Object.entries(history)),
    entries: ENTRIES,
    run: gitWith(answers),
  });
}

describe('triage', () => {
  it('a stamped report from a build that contains the fix is a regression and needs attention', () => {
    const t = run([[REDACT_EXPORT, 2]], {
      samples: { [REDACT_EXPORT]: sample('/redact/', 'abc1234') },
      answers: { 'bb156a5b>abc1234': 'yes' },
    });
    expect(t.needs.map((i) => i.verdict.category)).toEqual(['regression']);
    expect(t.known).toEqual([]);
  });

  it('a build that predates the fix is a known old tab, not actionable', () => {
    const t = run([[REDACT_EXPORT, 2]], {
      samples: { [REDACT_EXPORT]: sample('/redact/', 'abc1234') },
      answers: { 'bb156a5b>abc1234': 'no' },
    });
    expect(t.needs).toEqual([]);
    expect(t.known.map((i) => i.verdict.category)).toEqual(['old_tab']);
  });

  it('an unstamped report of an older fix stays visible as unverifiable', () => {
    const t = run([[UNLOCK, 3]], {
      samples: { [UNLOCK]: sample('/unlock/') },
      answers: { '01bf5820>f27c2b71': 'yes' },
    });
    expect(t.needs.map((i) => i.verdict.category)).toEqual(['unverifiable']);
  });

  it('a fingerprint no entry matches is new and needs attention, stamped or not', () => {
    const t = run([[PDFJS, 1]], { samples: { [PDFJS]: sample('/redact/') } });
    expect(t.needs.map((i) => i.verdict.category)).toEqual(['new']);
  });

  it('a known open entry is listed as known, with its ticket', () => {
    const t = run([[DRAFTS, 4]], { samples: { [DRAFTS]: sample('/sign/') } });
    expect(t.needs).toEqual([]);
    expect(t.known[0].verdict).toMatchObject({ category: 'known_open', ticket: 'OPEN-1' });
  });

  it('orders what needs attention: regression, then unverifiable, then new, then by count', () => {
    const t = run(
      [[PDFJS, 9], [UNLOCK, 1], [REDACT_EXPORT, 1]],
      {
        samples: {
          [PDFJS]: sample('/redact/'),
          [UNLOCK]: sample('/unlock/'),
          [REDACT_EXPORT]: sample('/redact/', 'abc1234'),
        },
        answers: { 'bb156a5b>abc1234': 'yes', '01bf5820>f27c2b71': 'yes' },
      },
    );
    expect(t.needs.map((i) => i.verdict.category)).toEqual(['regression', 'unverifiable', 'new']);
  });

  it('survives a missing or unparseable sample', () => {
    const t = run([[PDFJS, 1]], { samples: { [PDFJS]: 'not json' } });
    expect(t.needs).toHaveLength(1);
    expect(run([[PDFJS, 1]]).needs).toHaveLength(1);
  });

  it('carries the fingerprint history onto each item', () => {
    const t = run([[PDFJS, 1]], { samples: { [PDFJS]: sample('/redact/') }, history: { [PDFJS]: hist({ daysSeen: 3, isNew: false, recurring: true, firstSeen: '2026-09-30' }) } });
    expect(t.needs[0].history).toMatchObject({ daysSeen: 3, firstSeen: '2026-09-30' });
  });
});

describe('renderTriage', () => {
  const needsNew = () => run([[PDFJS, 1]], { samples: { [PDFJS]: sample('/redact/') }, history: { [PDFJS]: hist() } });

  it('leads with Needs attention and one labelled line per item, with first-seen', () => {
    const lines = renderTriage(needsNew(), []);
    expect(lines[0]).toBe('Needs attention (1)');
    expect(lines[1]).toBe('  NEW  1x redact TypeError read_glyphs on redact (chromium-143): not in the known items; new, first seen 2026-10-02');
  });

  it('says so when nothing needs attention, and still lists the known ones', () => {
    const t = run([[DRAFTS, 4]], { samples: { [DRAFTS]: sample('/sign/') }, history: { [DRAFTS]: hist({ isNew: false, recurring: true, daysSeen: 5, firstSeen: '2026-09-28' }) } });
    const lines = renderTriage(t, []);
    expect(lines[0]).toBe('Needs attention: nothing');
    expect(lines).toContain('Known, not actionable (1)');
    expect(lines.some((l) => l.includes('OPEN-1') && l.includes('seen 5 of 14 days'))).toBe(true);
  });

  it('prints each flagged tool as a RISING line under Needs attention', () => {
    const rates = [
      { tool: 'redact', flag: true, why: 'failed 11 of 21 started (52%), 5.2x the earlier 10%' },
      { tool: 'sign', flag: false, why: 'x' },
    ];
    const lines = renderTriage(run([]), rates);
    expect(lines[0]).toBe('Needs attention (1)');
    expect(lines[1]).toBe('  RISING  redact: failed 11 of 21 started (52%), 5.2x the earlier 10%');
    expect(lines.some((l) => l.includes('sign'))).toBe(false);
  });

  it('marks the no-history case so a first run is not read as everything being new', () => {
    const lines = renderTriage(run([[PDFJS, 1]], { samples: { [PDFJS]: sample('/redact/') }, history: { [PDFJS]: hist({ noHistory: true }) } }), []);
    expect(lines.join('\n')).toContain('no earlier days to compare');
  });
});
