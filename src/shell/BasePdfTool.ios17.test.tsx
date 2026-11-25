// @vitest-environment jsdom
// @vitest-environment-options { "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" }
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import BasePdfTool from './BasePdfTool.tsx';
import { resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';

// Split from BasePdfTool.test.tsx: the notice reads navigator.userAgent, which jsdom takes from the environment options above.
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('BasePdfTool', () => {
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    // Live control: the page really has this user agent.
    expect(navigator.userAgent).toBe(UA);
  });

  afterEach(() => {
    resetUsageEventsForTests();
    if (container) {
      act(() => render(null, container as HTMLDivElement));
      container.remove();
      container = null;
    }
  });

  function mount(props: { hasFiles: boolean; intake?: { needsPdfjs: boolean } }) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<BasePdfTool onFilesAdded={() => {}} {...props} />, container as HTMLDivElement);
    });
  }

  const text = () => (container as HTMLDivElement).textContent;

  describe('old browser notice', () => {
    it('is skipped for a tool that never loads pdf.js (needsPdfjs false)', () => {
      mount({ hasFiles: true, intake: { needsPdfjs: false } });
      expect(text()).not.toContain('or newer to open PDFs');
    });

    it('still appears on iOS 17 by default', () => {
      mount({ hasFiles: true });
      expect(text()).toContain('needs iOS 18.4 or newer');
    });
  });
});
