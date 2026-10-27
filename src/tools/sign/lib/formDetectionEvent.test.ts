import { describe, expect, it } from 'vitest';
import type { FormFieldRegions } from '../hooks/useFormFieldRegions.ts';
import { formDetectionEvent } from './formDetectionEvent.ts';

const base: FormFieldRegions = { detection: 'pending', combs: [], checkboxes: [], cells: [], pageDirections: [] };

describe('formDetectionEvent', () => {
  it('reports nothing while the walk is pending', () => {
    expect(formDetectionEvent(base)).toBeNull();
  });

  it('tells the three failure kinds apart by error code', () => {
    expect(formDetectionEvent({ ...base, detection: 'not-started' })?.properties).toMatchObject({ outcome: 'failure', error_code: 'not_started' });
    expect(formDetectionEvent({ ...base, detection: 'unavailable' })?.properties).toMatchObject({ outcome: 'failure', error_code: 'modules_unavailable' });
    expect(formDetectionEvent({ ...base, detection: 'failed', detectionError: new Error('x') })?.properties).toMatchObject({ outcome: 'failure' });
  });

  it('reports a finished walk as a bucketed count with the first page kind', () => {
    const event = formDetectionEvent({ ...base, detection: 'done', pageKind: 'text' });
    expect(event?.properties).toMatchObject({ outcome: 'success', page_kind: 'text' });
    expect(event?.properties).toHaveProperty('field_count_bucket');
  });
});
