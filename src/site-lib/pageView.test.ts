// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/analyticsSink.ts', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('#lib/telemetry/visitRecency.ts', { spy: true });

import { resetSinkForTests, sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { sendBeacon } from '#lib/telemetry/errorReport.ts';
import { FIRST_VISIT_KEY } from '#lib/telemetry/visitRecency.ts';
import { reportPageView } from './pageView.ts';

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

  it('never throws', () => {
    // Blocked storage: reading localStorage itself throws, as in a locked-down private window.
    // Forced: jsdom's localStorage always opens; blocking it is a browser setting a test cannot turn on.
    const own = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('storage'); } });
    try {
      expect(() => reportPageView()).not.toThrow();
      expect(sendToSink).toHaveBeenCalledExactlyOnceWith({ name: 'page_viewed', properties: {} });
    } finally {
      if (own) Object.defineProperty(window, 'localStorage', own);
      else Reflect.deleteProperty(window, 'localStorage');
    }
  });
});
