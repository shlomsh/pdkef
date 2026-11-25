import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/analyticsSink.ts', { spy: true });

import { sendToSink } from '#lib/telemetry/analyticsSink.ts';
import { reportPageView } from './pageView.ts';

// Node has no localStorage; the rest of the page view tests are in pageView.test.ts.
describe('reportPageView (MEM-45)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the view without buckets when storage is unavailable', () => {
    expect(() => localStorage).toThrow();
    reportPageView();
    expect(sendToSink).toHaveBeenCalledExactlyOnceWith({ name: 'page_viewed', properties: {} });
  });
});
