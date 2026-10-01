import { describe, expect, it } from 'vitest';
import {
  EXPORT_DURATION_BUCKETS,
  EXPORT_ERROR_CODES,
  FIELD_COUNT_BUCKETS,
  FORM_DETECTION_ERROR_CODES,
  maintenanceEventField,
  parseMaintenanceEvent,
} from './maintenanceEventSchema.ts';

const exportSuccess = (duration_bucket: string) => ({
  name: 'sign_export',
  properties: { outcome: 'success', duration_bucket },
});
const exportFailure = (duration_bucket: string, error_code: string) => ({
  name: 'sign_export',
  properties: { outcome: 'failure', duration_bucket, error_code },
});
const detectionSuccess = (field_count_bucket: string) => ({
  name: 'sign_form_detection',
  properties: { outcome: 'success', field_count_bucket },
});
const detectionFailure = (error_code: string) => ({
  name: 'sign_form_detection',
  properties: { outcome: 'failure', error_code },
});

const legit: unknown[] = [
  ...EXPORT_DURATION_BUCKETS.map(exportSuccess),
  ...EXPORT_DURATION_BUCKETS.flatMap((d) => EXPORT_ERROR_CODES.map((c) => exportFailure(d, c))),
  ...FIELD_COUNT_BUCKETS.map(detectionSuccess),
  ...FORM_DETECTION_ERROR_CODES.map(detectionFailure),
];

describe('parseMaintenanceEvent accepts', () => {
  it('covers every list value', () => {
    expect(FORM_DETECTION_ERROR_CODES).toHaveLength(6);
    expect(legit).toHaveLength(4 + 16 + 4 + 6);
  });
  it.each(legit.map((e) => [JSON.stringify(e), e] as const))('round-trips %s', (_label, event) => {
    expect(parseMaintenanceEvent(event)).toEqual(event);
    expect(parseMaintenanceEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
  });
  it('returns a frozen copy, never the input', () => {
    const input = exportFailure('under_1s', 'cancelled');
    const out = parseMaintenanceEvent(input)!;
    expect(out).not.toBe(input);
    expect(out.properties).not.toBe(input.properties);
    expect(Object.isFrozen(out)).toBe(true);
    expect(Object.isFrozen(out.properties)).toBe(true);
    const d = parseMaintenanceEvent(detectionSuccess('none'))!;
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.isFrozen(d.properties)).toBe(true);
  });
});

describe('parseMaintenanceEvent rejects', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'sign_export'],
    ['a number', 1],
    ['a boolean', true],
    ['an array', []],
    ['an array of the event', [exportSuccess('under_1s')]],
  ])('non-object: %s', (_l, v) => {
    expect(parseMaintenanceEvent(v)).toBeNull();
  });

  it('missing or extra top-level keys', () => {
    const ok = exportSuccess('under_1s');
    expect(parseMaintenanceEvent({})).toBeNull();
    expect(parseMaintenanceEvent({ name: ok.name })).toBeNull();
    expect(parseMaintenanceEvent({ properties: ok.properties })).toBeNull();
    expect(parseMaintenanceEvent({ ...ok, extra: 1 })).toBeNull();
    expect(parseMaintenanceEvent({ ...ok, message: 'hi' })).toBeNull();
  });

  it('an unknown or near-miss name', () => {
    const props = { outcome: 'success', duration_bucket: 'under_1s' };
    for (const name of ['sign_import', 'Sign_Export', 'sign_export ', '', 'constructor', null, 1, ['sign_export']]) {
      expect(parseMaintenanceEvent({ name, properties: props })).toBeNull();
    }
  });

  it('properties that are not an object', () => {
    for (const properties of [null, undefined, 'x', 1, [], [{ outcome: 'success', duration_bucket: 'under_1s' }]]) {
      expect(parseMaintenanceEvent({ name: 'sign_export', properties })).toBeNull();
      expect(parseMaintenanceEvent({ name: 'sign_form_detection', properties })).toBeNull();
    }
  });

  it('an extra property on every legitimate shape', () => {
    for (const extra of ['message', 'label', 'field_count', 'duration_ms', 'stack']) {
      for (const e of legit as { name: string; properties: object }[]) {
        expect(parseMaintenanceEvent({ name: e.name, properties: { ...e.properties, [extra]: 'x' } })).toBeNull();
      }
    }
  });

  it('a missing property on every legitimate shape', () => {
    for (const e of legit as { name: string; properties: Record<string, string> }[]) {
      for (const key of Object.keys(e.properties)) {
        const { [key]: _dropped, ...rest } = e.properties;
        expect(parseMaintenanceEvent({ name: e.name, properties: rest })).toBeNull();
      }
    }
  });

  it('crossed shapes', () => {
    expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: 'success', duration_bucket: 'under_1s', error_code: 'cancelled' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_form_detection', properties: { outcome: 'failure', error_code: 'cancelled', field_count_bucket: 'none' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_form_detection', properties: { outcome: 'success', field_count_bucket: 'none', error_code: 'cancelled' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: 'failure', error_code: 'cancelled' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: 'success', field_count_bucket: 'none' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: 'success', duration_bucket: 'under_1s', field_count_bucket: 'none' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_form_detection', properties: { outcome: 'success', duration_bucket: 'under_1s' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_form_detection', properties: { outcome: 'failure', duration_bucket: 'under_1s', error_code: 'cancelled' } })).toBeNull();
  });

  it('detection-only codes on sign_export', () => {
    for (const code of ['modules_unavailable', 'not_started']) {
      expect(parseMaintenanceEvent(exportFailure('under_1s', code))).toBeNull();
      expect(parseMaintenanceEvent(detectionFailure(code))).not.toBeNull();
    }
  });

  it('values of the wrong type', () => {
    for (const bad of [1, 0, true, null, undefined, ['under_1s'], { a: 1 }]) {
      expect(parseMaintenanceEvent(exportSuccess(bad as never))).toBeNull();
      expect(parseMaintenanceEvent(exportFailure('under_1s', bad as never))).toBeNull();
      expect(parseMaintenanceEvent(detectionSuccess(bad as never))).toBeNull();
      expect(parseMaintenanceEvent(detectionFailure(bad as never))).toBeNull();
      expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: bad, duration_bucket: 'under_1s' } })).toBeNull();
    }
  });

  it('near-miss values', () => {
    expect(parseMaintenanceEvent(detectionSuccess('None'))).toBeNull();
    expect(parseMaintenanceEvent(detectionSuccess('none '))).toBeNull();
    expect(parseMaintenanceEvent(detectionFailure('not_started '))).toBeNull();
    expect(parseMaintenanceEvent(detectionFailure('Not_Started'))).toBeNull();
    expect(parseMaintenanceEvent(exportSuccess('under_1S'))).toBeNull();
    expect(parseMaintenanceEvent(exportSuccess(''))).toBeNull();
    expect(parseMaintenanceEvent(exportFailure('under_1s', 'Cancelled'))).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: 'Success', duration_bucket: 'under_1s' } })).toBeNull();
    expect(parseMaintenanceEvent({ name: 'sign_export', properties: { outcome: 'partial', duration_bucket: 'under_1s' } })).toBeNull();
  });

  it('prototype keys smuggled through JSON.parse', () => {
    const ok = '{"outcome":"success","duration_bucket":"under_1s"}';
    expect(parseMaintenanceEvent(JSON.parse(`{"name":"sign_export","properties":${ok},"__proto__":{"x":1}}`))).toBeNull();
    expect(parseMaintenanceEvent(JSON.parse(`{"name":"sign_export","properties":${ok},"constructor":{}}`))).toBeNull();
    expect(parseMaintenanceEvent(JSON.parse(`{"__proto__":"sign_export","properties":${ok}}`))).toBeNull();
    expect(parseMaintenanceEvent(JSON.parse(`{"constructor":"sign_export","properties":${ok}}`))).toBeNull();
    expect(
      parseMaintenanceEvent(JSON.parse('{"name":"sign_export","properties":{"outcome":"success","duration_bucket":"under_1s","__proto__":{"a":1}}}')),
    ).toBeNull();
    expect(
      parseMaintenanceEvent(JSON.parse('{"name":"sign_export","properties":{"outcome":"success","constructor":"under_1s"}}')),
    ).toBeNull();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('maintenanceEventField', () => {
  it('export failure', () => {
    const e = parseMaintenanceEvent(exportFailure('under_5s', 'processing_failed'))!;
    expect(maintenanceEventField(e, 'chromium-140')).toBe('sign_export|failure|under_5s|processing_failed|chromium-140');
  });
  it('detection success', () => {
    const e = parseMaintenanceEvent(detectionSuccess('none'))!;
    expect(maintenanceEventField(e, 'ios-17')).toBe('sign_form_detection|success|none|ios-17');
  });
  it('is distinct for every legitimate event', () => {
    const fields = legit.map((e) => maintenanceEventField(parseMaintenanceEvent(e)!, 'x'));
    expect(new Set(fields).size).toBe(legit.length);
  });
});

