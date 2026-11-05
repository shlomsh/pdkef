import { describe, expect, it } from 'vitest';
import { DRIVE_EVENTS, driveSaveLines, funnelLines, parseUsageField, sumUsage } from './errors-funnel.mjs';

const flat = (o) => Object.entries(o).flat();

describe('parseUsageField', () => {
  it('reads all four run shapes, the build slot never taking the source', () => {
    expect(parseUsageField('tool_result_ready|merge')).toMatchObject({ kind: 'run', tool: 'merge', build: undefined, source: undefined });
    expect(parseUsageField('tool_result_ready|merge|08e10cf')).toMatchObject({ build: '08e10cf', source: undefined });
    expect(parseUsageField('tool_result_ready|merge|08e10cf|restore')).toMatchObject({ build: '08e10cf', source: 'restore' });
    expect(parseUsageField('tool_result_ready|merge|-|restore')).toMatchObject({ build: undefined, source: 'restore' });
  });
  it('reads once: and pg: fields, and skips nav: and unknown ones', () => {
    expect(parseUsageField('once:tool_page_viewed|sign')).toMatchObject({ kind: 'once', event: 'tool_page_viewed' });
    expect(parseUsageField('pg:tool_file_accepted|sign|handoff|merge|reload|-')).toEqual({
      kind: 'pg', event: 'tool_file_accepted', tool: 'sign', source: 'handoff', from: 'merge', nav: 'reload', visit: undefined,
    });
    expect(parseUsageField('nav:tool_file_accepted|redact|reload')).toBeNull();
    expect(parseUsageField('tool_bogus|sign')).toBeNull();
  });
});

describe('sumUsage', () => {
  it('counts all six events per tool and the ready/accepted percent, sourced fields included', () => {
    const rows = sumUsage([flat({
      'tool_page_viewed|redact|08e10cf': 10, 'tool_file_accepted|redact|08e10cf|pick': 4, 'tool_file_accepted|redact': 2,
      'tool_first_edit|redact|-|pick': 3, 'tool_operation_started|redact': 3, 'tool_result_ready|redact|-|restore': 3,
      'tool_operation_failed|redact': 1, 'once:tool_file_accepted|redact': 5, 'pg:tool_file_accepted|redact|pick|-|-|-': 4,
    })]);
    expect(rows).toEqual([['redact', 10, 6, 3, 3, 3, 1, '50%']]);
  });
});

describe('funnelLines', () => {
  const day1 = flat({
    'pg:tool_page_viewed|sign|-|-|navigate|new': 6, 'pg:tool_page_viewed|sign|-|-|navigate|week': 4,
    'pg:tool_file_accepted|sign|pick|-|-|-': 3, 'pg:tool_file_accepted|sign|handoff|merge|-|-': 1, 'pg:tool_file_accepted|sign|restore|-|-|-': 2,
    'pg:tool_first_edit|sign|pick|-|-|-': 2, 'pg:tool_operation_started|sign|pick|-|-|-': 2, 'pg:tool_result_ready|sign|pick|-|-|-': 2,
    'pg:tool_result_ready|sign|restore|-|-|-': 1, 'pg:tool_operation_failed|sign|restore|-|-|-': 1,
  });
  // an older day: once: only, so everything reads as unknown with no visit
  const old = flat({ 'once:tool_page_viewed|sign': 5, 'once:tool_file_accepted|sign': 2, 'nav:tool_file_accepted|sign|reload': 2 });

  it('prints the table by lane and the visit and source lines', () => {
    const lines = funnelLines([day1, old]);
    expect(lines).toEqual([
      'tool | lane | visited | file in front | first edit | asked | got it | failed',
      'sign | all | 15 | 8 | 2 | 2 | 3 | 1',
      'sign | fresh | - | 4 | 2 | 2 | 2 | 0',
      'sign | resume | - | 2 | 0 | 0 | 1 | 1',
      'sign | unknown | - | 2 | 0 | 0 | 0 | 0',
      'sign visits: new 6, week 4',
      'sign accepted by source: pick 3, restore 2, unknown 2, handoff 1',
    ]);
  });

  it('a deploy day adds the old builds\' once: page loads to the new pg: ones, as unknown (the store writes once: no more)', () => {
    const mixed = flat({ 'pg:tool_file_accepted|merge|pick|-|-|-': 2, 'once:tool_file_accepted|merge': 5 });
    expect(funnelLines([mixed])).toContain('merge | all | 0 | 7 | 0 | 0 | 0 | 0');
    expect(funnelLines([mixed])).toContain('merge | unknown | - | 5 | 0 | 0 | 0 | 0');
  });

  it('a camera arrival reads in the fresh lane and on the accepted-by-source line', () => {
    const lines = funnelLines([flat({ 'pg:tool_file_accepted|scan-to-pdf|camera|-|-|-': 3 })]);
    expect(lines).toContain('scan-to-pdf | fresh | - | 3 | 0 | 0 | 0 | 0');
    expect(lines).toContain('scan-to-pdf accepted by source: camera 3');
  });

  it('prints nothing when there are no page-load fields', () => {
    expect(funnelLines([flat({ 'tool_file_accepted|merge': 3 })])).toEqual([]);
  });
});

describe('driveSaveLines', () => {
  const day = flat({
    'tool_drive_shown|redact': 4,
    'tool_drive_shown|redact|abc1234': 6,
    'tool_drive_tapped|redact': 5,
    'tool_drive_saved|redact|abc1234': 3,
    'tool_drive_failed|redact': 1,
    'pg:tool_drive_shown|redact|-|-|navigate|-': 7,
    'pg:tool_drive_saved|redact|-|-|navigate|-': 2,
    'tool_drive_shown|highlight-pdf': 2,
    'tool_drive_tapped|highlight-pdf': 3,
    'tool_drive_saved|highlight-pdf': 1,
  });

  it('names the four events', () => {
    expect(DRIVE_EVENTS).toEqual(['tool_drive_shown', 'tool_drive_tapped', 'tool_drive_saved', 'tool_drive_failed']);
  });

  it('sums runs per tool across builds and days, counts pg: fields as pages, most shown first', () => {
    expect(driveSaveLines([day, flat({ 'tool_drive_shown|redact': 1 })])).toEqual([
      'tool | shown | tapped | saved | failed | closed first | pages shown | pages saved',
      'redact | 11 | 5 | 3 | 1 | 1 | 7 | 2',
      'highlight-pdf | 2 | 3 | 1 | 0 | 2 | 0 | 0',
    ]);
  });

  it('never lets closed first go below zero', () => {
    expect(driveSaveLines([flat({ 'tool_drive_tapped|redact': 1, 'tool_drive_saved|redact': 2 })])[1]).toBe('redact | 0 | 1 | 2 | 0 | 0 | 0 | 0');
  });

  it('leaves the funnel and usage table unchanged by drive fields', () => {
    const base = flat({ 'tool_file_accepted|redact': 3, 'pg:tool_file_accepted|redact|pick|-|-|-': 2 });
    expect(funnelLines([[...base, ...day]])).toEqual(funnelLines([base]));
    expect(sumUsage([[...base, ...day]])).toEqual(sumUsage([base]));
  });

  it('is empty without a drive event', () => {
    expect(driveSaveLines([flat({ 'tool_file_accepted|redact': 3 })])).toEqual([]);
    expect(driveSaveLines([])).toEqual([]);
  });
});
