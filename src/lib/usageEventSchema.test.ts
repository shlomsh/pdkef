import { describe, expect, it } from 'vitest';
import { parseErrorReport } from './errorReportSchema.ts';
import { parseMaintenanceEvent } from './maintenanceEventSchema.ts';
import {
  ANALYTICS_TOOLS,
  TOOL_LIFECYCLE_EVENTS,
  parseUsageEvent,
  usageEventField,
} from './usageEventSchema.ts';

const ev = (name: unknown, tool: unknown) => ({ name, properties: { tool } });

const legit = TOOL_LIFECYCLE_EVENTS.flatMap((n) => ANALYTICS_TOOLS.map((t) => ev(n, t)));

describe('parseUsageEvent accepts', () => {
  it('covers every list value', () => {
    expect(TOOL_LIFECYCLE_EVENTS).toHaveLength(4);
    expect(ANALYTICS_TOOLS).toHaveLength(11);
    expect(legit).toHaveLength(44);
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
    expect(new Set(fields).size).toBe(44);
    expect(usageEventField(parseUsageEvent(ev('tool_result_ready', 'merge'))!)).toBe('tool_result_ready|merge');
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
