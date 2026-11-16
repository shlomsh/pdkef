import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/analyticsSink.ts', () => ({ sendToSink: vi.fn(() => true) }));
vi.mock('#lib/telemetry/errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
vi.mock('#lib/telemetry/visitRecency.ts', () => ({ readAndStampVisits: vi.fn(() => ({ visit: 'week', since: 'month' })) }));

import { sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { sendBeacon } from '#lib/telemetry/errorReport.ts';
import { readAndStampVisits } from '#lib/telemetry/visitRecency.ts';
import { reportPageView } from './pageView.ts';

describe('reportPageView (MEM-45)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.mocked(readAndStampVisits).mockImplementation(() => ({ visit: 'week', since: 'month' })));

  it('sends one page_viewed with the visit and since buckets to the analytics address', () => {
    reportPageView();
    expect(sendToSink).toHaveBeenCalledExactlyOnceWith({ name: 'page_viewed', properties: { visit: 'week', since: 'month' } });
  });

  it('never sends to the old report endpoint', () => {
    reportPageView();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('sends the view without buckets when storage is unavailable', () => {
    vi.mocked(readAndStampVisits).mockReturnValue(undefined);
    reportPageView();
    expect(sendToSink).toHaveBeenCalledExactlyOnceWith({ name: 'page_viewed', properties: {} });
  });

  it('never throws', () => {
    vi.mocked(readAndStampVisits).mockImplementation(() => { throw new Error('storage'); });
    expect(() => reportPageView()).not.toThrow();
  });
});
