import { afterEach, describe, expect, it, vi } from 'vitest';
import { assess } from '#lib/pageEnhance/plan.ts';
import { leaning, gray } from '#lib/pageEnhance/leaning.test-helper.ts';
import { openAssessor } from './assessor.ts';

const SHEET = gray(leaning(200, 120, 0));

afterEach(() => vi.restoreAllMocks());

describe('openAssessor', () => {
  it('hands the pixels to the worker and takes its answer', async () => {
    const terminate = vi.spyOn(Worker.prototype, 'terminate');
    const assessor = openAssessor();
    const sent = { ...SHEET, data: new Uint8ClampedArray(SHEET.data) };
    const asked = assessor.assess(sent);
    expect(sent.data.byteLength).toBe(0);
    expect(await asked).toEqual(assess(SHEET));
    assessor.close();
    expect(terminate).toHaveBeenCalled();
  });
});
