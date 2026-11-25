// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/analyticsSink.ts', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('#lib/telemetry/visitRecency.ts', { spy: true });

import { resetSinkForTests, sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { sendBeacon } from '#lib/telemetry/errorReport.ts';
import { FIRST_VISIT_KEY, readAndStampVisits } from '#lib/telemetry/visitRecency.ts';
import { reportPageView } from './pageView.ts';
import { fillStorage } from '../test/support/fullStorage.ts';

describe('reportPageView (MEM-45)', () => {
  const daysAgo = (days: number) => {
    const d = new Date(Date.now() - days * 864e5);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetSinkForTests();
    localStorage.clear();
    // A browser last here three days ago and first here twenty days ago: the real buckets are week and month.
    localStorage.setItem('pdkef:last-tool-visit', daysAgo(3));
    localStorage.setItem(FIRST_VISIT_KEY, daysAgo(20));
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends one page_viewed with the visit and since buckets to the analytics address', () => {
    reportPageView();
    expect(sendToSink).toHaveBeenCalledExactlyOnceWith({ name: 'page_viewed', properties: { visit: 'week', since: 'month' } });
  });

  it('never sends to the old report endpoint', () => {
    reportPageView();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('sends the view without buckets when storage is unavailable', () => {
    // A browser with no last-visit day and a full storage: the stamp is refused, a real QuotaExceededError.
    localStorage.removeItem('pdkef:last-tool-visit');
    fillStorage(localStorage);
    expect(() => localStorage.setItem('pdkef:last-tool-visit', daysAgo(0))).toThrow();
    reportPageView();
    expect(sendToSink).toHaveBeenCalledExactlyOnceWith({ name: 'page_viewed', properties: {} });
  });

  it('never throws', () => {
    vi.mocked(readAndStampVisits).mockImplementationOnce(() => { throw new Error('storage'); }); // forced: the visit lookup throws (this one call)
    expect(() => reportPageView()).not.toThrow();
  });
});
