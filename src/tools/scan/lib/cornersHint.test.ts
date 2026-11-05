import { describe, expect, it } from 'vitest';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import { cornersHint } from './cornersHint.ts';

const page = (over: Partial<ScanPage> = {}) => ({ id: 1, guessed: true, preview: 'p', found: true, edited: false, ...over }) as unknown as ScanPage;

describe('cornersHint', () => {
  it('says an unreadable photo could not be read, before anything else', () => {
    expect(cornersHint(page({ preview: null }), true, 1, [1])).toBe(t.pageFailed);
  });
  it('says a page still waiting for its preview is finding edges, not failed', () => {
    expect(cornersHint(page({ preview: null }), false, null, [])).toBe(t.findingEdges);
  });
  it('says the edges are being found until the guess lands or while Find runs', () => {
    expect(cornersHint(page({ guessed: false }), false, null, [])).toBe(t.findingEdges);
    expect(cornersHint(page(), false, 1, [1])).toBe(t.findingEdges);
  });
  it('says a Find that found nothing, then a page with no corners found', () => {
    expect(cornersHint(page(), false, null, [1])).toBe(t.findMissed);
    expect(cornersHint(page({ found: false }), false, null, [])).toBe(t.notFoundCorners);
    expect(cornersHint(page({ found: false, edited: true }), false, null, [])).toBe(t.cornersHint);
  });
  it('otherwise asks for the corners', () => {
    expect(cornersHint(page(), false, null, [])).toBe(t.cornersHint);
  });
});
