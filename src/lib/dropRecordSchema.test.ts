import { describe, expect, it } from 'vitest';
import { DROP_NAMES, IGNORED_NAMES, dropRecordField, parseDropRecord, parseErrorReport } from './errorReportSchema.ts';
import { parseMaintenanceEvent } from './maintenanceEventSchema.ts';
import { parseUsageEvent } from './usageEventSchema.ts';

const base = { kind: 'dropped', area: 'redact', step: 'export', reason: 'non_error', type: 'string' };

describe('parseDropRecord (DEBT-44)', () => {
  it('accepts the five required keys, with or without name and build', () => {
    expect(parseDropRecord(base)).toEqual(base);
    const full = { ...base, reason: 'ignored', type: 'DOMException', name: 'AbortError', build: '08e10cf' };
    expect(parseDropRecord(JSON.parse(JSON.stringify(full)))).toEqual(full);
    expect(Object.isFrozen(parseDropRecord(base))).toBe(true);
  });

  it.each([
    ['another kind', { ...base, kind: 'report' }],
    ['an unknown area', { ...base, area: 'nowhere' }],
    ['a step that is not an identifier', { ...base, step: 'Export step' }],
    ['an unknown reason', { ...base, reason: 'dedup' }],
    ['an unknown type', { ...base, type: 'Weird' }],
    ['a name off the list', { ...base, name: 'fm' }],
    ['a message smuggled as a name', { ...base, name: 'secret.pdf' }],
    ['a malformed build', { ...base, build: 'HEAD' }],
    ['an extra key', { ...base, message: 'x' }],
    ['a missing key', { kind: 'dropped', area: 'redact', step: 'export', reason: 'no_frame' }],
    ['an array', [base]],
  ])('rejects %s', (_what, value) => {
    expect(parseDropRecord(value)).toBeNull();
  });

  it('is never mistaken for a report or an event, and they are never mistaken for it', () => {
    expect(parseErrorReport(base)).toBeNull();
    expect(parseMaintenanceEvent(base)).toBeNull();
    expect(parseUsageEvent(base)).toBeNull();
    expect(parseDropRecord({ name: 'tool_operation_failed', properties: { tool: 'redact' } })).toBeNull();
  });

  it('every ignored name may travel as a drop name', () => {
    for (const name of IGNORED_NAMES) expect(DROP_NAMES).toContain(name);
  });

  it('stores under one field, with - for an absent name or build', () => {
    expect(dropRecordField(parseDropRecord(base)!, 'ios-26')).toBe('redact|export|non_error|string|-|-|ios-26');
    const full = parseDropRecord({ ...base, reason: 'encrypted', type: 'custom', name: 'EncryptedPDFError', build: '08e10cf' })!;
    expect(dropRecordField(full, 'chromium-154')).toBe('redact|export|encrypted|custom|EncryptedPDFError|08e10cf|chromium-154');
  });
});
