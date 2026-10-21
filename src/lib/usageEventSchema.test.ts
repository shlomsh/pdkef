import { describe, expect, it } from 'vitest';
import { parseErrorReport } from './errorReportSchema.ts';
import { parseMaintenanceEvent } from './maintenanceEventSchema.ts';
import {
  ANALYTICS_TOOLS,
  TOOL_LIFECYCLE_EVENTS,
  parseUsageEvent,
  NAVIGATION_TYPES,
  usageEventField,
  usageOnceField,
  usagePageField,
  FILE_SOURCES,
  VISITS,
} from './usageEventSchema.ts';

const ev = (name: unknown, tool: unknown) => ({ name, properties: { tool } });

const legit = TOOL_LIFECYCLE_EVENTS.flatMap((n) => ANALYTICS_TOOLS.map((t) => ev(n, t)));

describe('parseUsageEvent accepts', () => {
  it('covers every list value', () => {
    expect(TOOL_LIFECYCLE_EVENTS).toHaveLength(6);
    expect(ANALYTICS_TOOLS).toHaveLength(11);
    expect(legit).toHaveLength(66);
  });
  it.each(legit.map((e) => [JSON.stringify(e), e] as const))('round-trips %s', (_label, event) => {
    expect(parseUsageEvent(event)).toEqual(event);
    expect(parseUsageEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });
  it('returns a frozen copy, never the input', () => {
    const input = ev('tool_result_ready', 'merge');
    const out = parseUsageEvent(input)!;
    expect(out).not.toBe(input);
    expect(out.properties).not.toBe(input.properties);
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out.properties)).toBe(true);
  });
  it('gives every event a distinct counter field', () => {
    const fields = legit.map((e) => usageEventField(parseUsageEvent(e)!));
    expect(new Set(fields).size).toBe(66);
    expect(usageEventField(parseUsageEvent(ev('tool_result_ready', 'merge'))!)).toBe('tool_result_ready|merge');
  });
});

describe('the first flag', () => {
  const first = { name: 'tool_operation_failed', properties: { tool: 'redact', first: true } };
  it('is accepted alone or with a build, and kept', () => {
    expect(parseUsageEvent(first)).toEqual(first);
    const stamped = { name: 'tool_operation_failed', properties: { tool: 'redact', build: '08e10cf', first: true } };
    expect(parseUsageEvent(stamped)).toEqual(stamped);
  });
  it.each([false, 'true', 1, null])('rejects first: %s', (value) => {
    expect(parseUsageEvent({ ...first, properties: { tool: 'redact', first: value } })).toBeNull();
  });
  it('has a once field that shares the event field spelling', () => {
    expect(usageOnceField(parseUsageEvent(first)!)).toBe('once:tool_operation_failed|redact');
  });
});

describe('how the page load started (DEBT-57)', () => {
  const firstWith = (nav: unknown) => ({ name: 'tool_file_accepted', properties: { tool: 'redact', first: true, nav } });
  it.each(NAVIGATION_TYPES.map((nav) => [nav]))('accepts nav %s on a first event, and files it in the page field', (nav) => {
    const parsed = parseUsageEvent(firstWith(nav));
    expect(parsed).toEqual(firstWith(nav));
    expect(usagePageField(parsed!)).toBe(`pg:tool_file_accepted|redact|-|-|${nav}|-`);
  });
  it('lists the four navigation types the browser names', () => {
    expect([...NAVIGATION_TYPES]).toEqual(['navigate', 'reload', 'back_forward', 'prerender']);
  });
  it('accepts nav beside a build', () => {
    const stamped = { name: 'tool_file_accepted', properties: { tool: 'redact', build: '08e10cf', first: true, nav: 'reload' } };
    expect(parseUsageEvent(stamped)).toEqual(stamped);
  });
  it.each([['an unknown value', 'typed'], ['a number', 1], ['null', null]])('rejects nav as %s', (_what, nav) => {
    expect(parseUsageEvent(firstWith(nav))).toBeNull();
  });
  it('rejects nav on an event that is not the first of its kind', () => {
    expect(parseUsageEvent({ name: 'tool_file_accepted', properties: { tool: 'redact', nav: 'reload' } })).toBeNull();
  });
  it('has dashes in the page field without nav', () => {
    expect(usagePageField(parseUsageEvent({ name: 'tool_file_accepted', properties: { tool: 'redact', first: true } })!)).toBe('pg:tool_file_accepted|redact|-|-|-|-');
  });
});

describe('parseUsageEvent rejects', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'tool_result_ready'],
    ['number', 1],
    ['boolean', true],
    ['array', [ev('tool_result_ready', 'merge')]],
    ['empty array', []],
    ['empty object', {}],
    ['missing properties', { name: 'tool_result_ready' }],
    ['missing name', { properties: { tool: 'merge' } }],
    ['extra top-level key', { ...ev('tool_result_ready', 'merge'), extra: 1 }],
    ['unknown name', ev('tool_started', 'merge')],
    ['maintenance name', ev('sign_export', 'merge')],
    ['empty name', ev('', 'merge')],
    ['properties null', { name: 'tool_result_ready', properties: null }],
    ['properties string', { name: 'tool_result_ready', properties: 'merge' }],
    ['properties array', { name: 'tool_result_ready', properties: ['merge'] }],
    ['empty properties', { name: 'tool_result_ready', properties: {} }],
    ['extra property file', { name: 'tool_result_ready', properties: { tool: 'merge', file: 'a.pdf' } }],
    ['extra property count', { name: 'tool_result_ready', properties: { tool: 'merge', count: 2 } }],
    ['extra property name', { name: 'tool_result_ready', properties: { tool: 'merge', name: 'x' } }],
    ['wrong property key', { name: 'tool_result_ready', properties: { file: 'merge' } }],
    ['unknown tool', ev('tool_result_ready', 'ocr')],
    ['near miss Merge', ev('tool_result_ready', 'Merge')],
    ['near miss trailing space', ev('tool_result_ready', 'merge ')],
    ['near miss edit_pdf', ev('tool_result_ready', 'edit_pdf')],
    ['empty tool', ev('tool_result_ready', '')],
    ['number name', ev(1, 'merge')],
    ['array name', ev(['tool_result_ready'], 'merge')],
    ['object name', ev({}, 'merge')],
    ['number tool', ev('tool_result_ready', 1)],
    ['null tool', ev('tool_result_ready', null)],
    ['array tool', ev('tool_result_ready', ['merge'])],
    ['object tool', ev('tool_result_ready', { toString: 'merge' })],
  ])('%s', (_label, value) => {
    expect(parseUsageEvent(value)).toBeNull();
  });

  it('rejects __proto__ and constructor keys from JSON.parse', () => {
    expect(
      parseUsageEvent(JSON.parse('{"name":"tool_result_ready","properties":{"tool":"merge"},"__proto__":{"x":1}}')),
    ).toBeNull();
    expect(
      parseUsageEvent(JSON.parse('{"name":"tool_result_ready","properties":{"tool":"merge","__proto__":{}}}')),
    ).toBeNull();
    expect(
      parseUsageEvent(JSON.parse('{"name":"tool_result_ready","properties":{"tool":"merge"},"constructor":{}}')),
    ).toBeNull();
    expect(
      parseUsageEvent(JSON.parse('{"name":"tool_result_ready","properties":{"tool":"merge","constructor":"x"}}')),
    ).toBeNull();
    expect(parseUsageEvent(JSON.parse('{"name":"tool_result_ready","properties":{"__proto__":"merge"}}'))).toBeNull();
  });
});

describe('the three wire schemas never file one kind as another', () => {
  const maintenance = { name: 'sign_export', properties: { outcome: 'success', duration_bucket: 'under_1s' } };
  it('a maintenance event is not a usage event', () => {
    expect(parseMaintenanceEvent(maintenance)).not.toBeNull();
    expect(parseUsageEvent(maintenance)).toBeNull();
  });
  it('a usage event is neither a maintenance event nor an error report', () => {
    for (const e of legit) {
      expect(parseMaintenanceEvent(e)).toBeNull();
      expect(parseErrorReport(e)).toBeNull();
    }
  });
});

describe('parseUsageEvent with a build stamp (DEBT-44)', () => {
  const stamped = { name: 'tool_operation_failed', properties: { tool: 'redact', build: '08e10cf' } };
  it('accepts a stamped event and files it under its build', () => {
    expect(parseUsageEvent(stamped)).toEqual(stamped);
    expect(usageEventField(parseUsageEvent(stamped)!)).toBe('tool_operation_failed|redact|08e10cf');
  });
  it('still accepts and files an unstamped event as before', () => {
    expect(usageEventField(parseUsageEvent(ev('tool_operation_failed', 'redact'))!)).toBe('tool_operation_failed|redact');
  });
  it.each([['HEAD'], ['08E10CF'], ['08e10cfa'], [7]])('rejects build %s', (build) => {
    expect(parseUsageEvent({ name: 'tool_operation_failed', properties: { tool: 'redact', build } })).toBeNull();
  });
  it('rejects any other extra property', () => {
    expect(parseUsageEvent({ name: 'tool_operation_failed', properties: { tool: 'redact', build: '08e10cf', file: 'a' } })).toBeNull();
  });
});

describe('source, from and visit (DEBT-58)', () => {
  const props = (name: string, p: Record<string, unknown>) => ({ name, properties: { tool: 'sign', ...p } });
  it.each(FILE_SOURCES.map((s) => [s]))('accepts source %s on a file event, and files it', (source) => {
    const e = props('tool_file_accepted', { source });
    expect(parseUsageEvent(e)).toEqual(e);
    expect(usageEventField(parseUsageEvent(e)!)).toBe(`tool_file_accepted|sign|-|${source}`);
  });
  it.each(['tool_first_edit', 'tool_operation_started', 'tool_result_ready', 'tool_operation_failed'])('accepts source on %s', (name) => {
    const e = props(name, { source: 'restore' });
    expect(parseUsageEvent(e)).toEqual(e);
  });
  it('never accepts source on tool_page_viewed', () => {
    expect(parseUsageEvent(props('tool_page_viewed', { source: 'pick' }))).toBeNull();
  });
  it.each([['unknown', 'upload'], ['number', 1], ['null', null]])('rejects source as %s', (_w, source) => {
    expect(parseUsageEvent(props('tool_file_accepted', { source }))).toBeNull();
  });
  it('accepts from only on tool_file_accepted with source handoff', () => {
    const ok = props('tool_file_accepted', { source: 'handoff', from: 'merge' });
    expect(parseUsageEvent(ok)).toEqual(ok);
    expect(parseUsageEvent(props('tool_result_ready', { source: 'handoff', from: 'merge' }))).toBeNull();
    expect(parseUsageEvent(props('tool_file_accepted', { source: 'pick', from: 'merge' }))).toBeNull();
    expect(parseUsageEvent(props('tool_file_accepted', { from: 'merge' }))).toBeNull();
    expect(parseUsageEvent(props('tool_file_accepted', { source: 'handoff', from: 'ocr' }))).toBeNull();
  });
  it.each(VISITS.map((v) => [v]))('accepts visit %s on tool_page_viewed only', (visit) => {
    const e = props('tool_page_viewed', { visit });
    expect(parseUsageEvent(e)).toEqual(e);
    expect(parseUsageEvent(props('tool_file_accepted', { visit }))).toBeNull();
  });
  it.each([['unknown', 'yesterday'], ['number', 1]])('rejects visit as %s', (_w, visit) => {
    expect(parseUsageEvent(props('tool_page_viewed', { visit }))).toBeNull();
  });
  it('accepts nav only beside first', () => {
    expect(parseUsageEvent(props('tool_page_viewed', { nav: 'reload' }))).toBeNull();
    const e = props('tool_page_viewed', { first: true, nav: 'reload' });
    expect(parseUsageEvent(e)).toEqual(e);
  });
});

describe('usageEventField shapes', () => {
  const f = (p: Record<string, unknown>) => usageEventField(parseUsageEvent({ name: 'tool_result_ready', properties: { tool: 'merge', ...p } })!);
  it('has four shapes', () => {
    expect(f({})).toBe('tool_result_ready|merge');
    expect(f({ build: '08e10cf' })).toBe('tool_result_ready|merge|08e10cf');
    expect(f({ build: '08e10cf', source: 'restore' })).toBe('tool_result_ready|merge|08e10cf|restore');
    expect(f({ source: 'restore' })).toBe('tool_result_ready|merge|-|restore');
  });
});

describe('usagePageField', () => {
  it('fills every slot, with dashes for the absent', () => {
    const e = parseUsageEvent({
      name: 'tool_file_accepted',
      properties: { tool: 'sign', first: true, nav: 'reload', source: 'handoff', from: 'merge' },
    })!;
    expect(usagePageField(e)).toBe('pg:tool_file_accepted|sign|handoff|merge|reload|-');
    const v = parseUsageEvent({ name: 'tool_page_viewed', properties: { tool: 'sign', first: true, visit: 'week' } })!;
    expect(usagePageField(v)).toBe('pg:tool_page_viewed|sign|-|-|-|week');
  });
  it('is undefined when the event is not first', () => {
    expect(usagePageField(parseUsageEvent({ name: 'tool_page_viewed', properties: { tool: 'sign', visit: 'new' } })!)).toBeUndefined();
  });
});
